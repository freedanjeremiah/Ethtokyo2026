// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";

import {IPermissionedRegistry} from "../src/interfaces/IPermissionedRegistry.sol";
import {IPermissionedResolver} from "../src/interfaces/IPermissionedResolver.sol";
import {IUserRegistry} from "../src/interfaces/IUserRegistry.sol";
import {IVerifiableFactory} from "../src/interfaces/IVerifiableFactory.sol";
import {IETHRegistrar} from "../src/interfaces/IETHRegistrar.sol";
import {IUniversalResolver, IUniversalHelper, IRecordProfiles} from "../src/interfaces/IUniversalResolver.sol";
import {IMockUSDC} from "../src/interfaces/IMockUSDC.sol";

/// @title MountBase — builds the MOUNT world on a pinned Sepolia fork, against the REAL ENSv2 contracts.
///
/// Topology (identical to scripts/lib/fleet.ts, docs/ensv2-notes.md §3):
///
///   ETHRegistry ── <parent>.eth   (resolver 0x0, subregistry = PARENT_REG)        parents: vendor, shopa, shopb
///     PARENT_REG ── support       (resolver 0x0, subregistry = FLEET)            <- mount / unmount (1 tx)
///       FLEET ── mia | kai | rin  (resolver = SHARED_RESOLVER, roleBitmap 0)     <- register / unregister (1 tx)
///   SHARED_RESOLVER default record (DNS name 0x00) holds the roster bundle, written by the operator only.
///   Canonical back-pointers: FLEET.getParent() = (vendorReg, "support"), vendorReg.getParent() = (ETHRegistry, "vendor").
///
/// Every address comes from deployments/sepolia.json. Every actor is a fresh makeAddr() key.
/// Names are plain-ASCII literals that are already ENSIP-15-normalized (no normalization library in Solidity).
abstract contract MountBase is Test {
    // ------------------------------------------------------------------ fork pin
    /// Sepolia block pinned for determinism + RPC caching (after the 2026-09-15 ENSv2 redeploy;
    /// timestamp 1790403636). vendor/shopa/shopb/scam are all available at this block.
    uint256 internal constant FORK_BLOCK = 11_784_409;

    // ------------------------------------------------------------------ roles (notes §2.4, §4.3)
    /// Every role + admin role (ENS's own setup constant).
    uint256 internal constant ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111;
    /// Members get no roles at all: no ROLE_CAN_TRANSFER_ADMIN => soulbound; no resolver setter roles.
    uint256 internal constant MEMBER_ROLES = 0;
    uint256 internal constant REG_ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant REG_ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant RES_ROLE_SET_TEXT = 1 << 4;

    // ------------------------------------------------------------------ constants
    string internal constant MOUNT_LABEL = "support";
    string internal constant CANONICAL_NAME = "support.vendor.eth";
    string internal constant ENDORSED_PARENTS = "support.vendor.eth,support.shopa.eth,support.shopb.eth";
    string internal constant AGENT_CONTEXT_URL = "https://mount.example/fleet";
    string internal constant AGENT_ENDPOINT_WEB_URL = "https://mount.example/fleet/chat";
    uint64 internal constant ONE_YEAR = 365 days;
    uint256 internal constant COIN_TYPE_ETH = 60;

    // ------------------------------------------------------------------ real ENSv2 contracts
    IPermissionedRegistry internal ethRegistry;
    IETHRegistrar internal registrar;
    IVerifiableFactory internal factory;
    IUniversalResolver internal ur;
    IUniversalHelper internal helper;
    IMockUSDC internal usdc;
    address internal userRegistryImpl;
    address internal permissionedResolverImpl;

    // ------------------------------------------------------------------ actors (fresh keys)
    address internal vendor = makeAddr("vendor");
    address internal shopa = makeAddr("shopa");
    address internal shopb = makeAddr("shopb");
    address internal scam = makeAddr("scam");
    address internal operator = makeAddr("operator");
    address internal settlement = makeAddr("settlement");
    address internal mia = makeAddr("mia");
    address internal kai = makeAddr("kai");
    address internal rin = makeAddr("rin");

    // ------------------------------------------------------------------ the world
    IPermissionedRegistry internal fleet;
    IPermissionedResolver internal sharedResolver;
    mapping(string parentLabel => IPermissionedRegistry) internal parentRegistry;

    string[3] internal parents = ["vendor", "shopa", "shopb"];
    string[3] internal members = ["mia", "kai", "rin"];

    function setUp() public virtual {
        vm.createSelectFork("sepolia", FORK_BLOCK);
        _loadDeployment();

        address[4] memory everyone = [vendor, shopa, shopb, operator];
        for (uint256 i; i < everyone.length; i++) {
            vm.deal(everyone[i], 10 ether);
        }

        // 1. Parents obtain their .eth names through the real ETHRegistrar commit/reveal flow.
        //    shopb.eth is registered for the registrar minimum (28 days) so a single parent can lapse
        //    in isolation (test_parentLapseKillsOnlyThatDoorway); vendor/shopa hold theirs for a year.
        uint64 minDuration = registrar.MIN_REGISTER_DURATION();
        bytes32 sVendor = _commitEth("vendor", vendor, ONE_YEAR);
        bytes32 sShopa = _commitEth("shopa", shopa, ONE_YEAR);
        bytes32 sShopb = _commitEth("shopb", shopb, minDuration);
        vm.warp(block.timestamp + registrar.MIN_COMMITMENT_AGE() + 1);
        _registerEth("vendor", vendor, sVendor, ONE_YEAR);
        _registerEth("shopa", shopa, sShopa, ONE_YEAR);
        _registerEth("shopb", shopb, sShopb, minDuration);

        // 2. Fleet UserRegistry (vendor holds all root roles) + shared PermissionedResolver (operator holds all roles),
        //    both proxies from the real VerifiableFactory.
        fleet = IPermissionedRegistry(_deployUserRegistry(vendor, "mount.fleet-registry.v1"));
        vm.prank(operator);
        sharedResolver = IPermissionedResolver(
            factory.deployProxy(
                permissionedResolverImpl,
                _salt("mount.shared-resolver.v1"),
                abi.encodeCall(IPermissionedResolver.initialize, (_grants(operator), new bytes[](0)))
            )
        );

        // 3. Each parent gets its own UserRegistry and mounts the fleet at `support` (resolver stays 0x0).
        _setupParentRegistry("vendor", vendor);
        _setupParentRegistry("shopa", shopa);
        _setupParentRegistry("shopb", shopb);
        _mount("vendor", vendor);
        _mount("shopa", shopa);
        _mount("shopb", shopb);

        // 4. Canonical back-pointers: fleet -> vendor registry "support"; vendor registry -> ETHRegistry "vendor".
        vm.startPrank(vendor);
        fleet.setParent(address(parentRegistry["vendor"]), MOUNT_LABEL);
        parentRegistry["vendor"].setParent(address(ethRegistry), "vendor");
        vm.stopPrank();

        // 5. The operator writes the roster bundle into the default record (0x00) in one multicall.
        bytes[] memory calls = new bytes[](5);
        calls[0] =
            abi.encodeCall(IPermissionedResolver.setAddress, (hex"00", COIN_TYPE_ETH, abi.encodePacked(settlement)));
        calls[1] = abi.encodeCall(IPermissionedResolver.setText, (hex"00", "mount.canonical", CANONICAL_NAME));
        calls[2] = abi.encodeCall(IPermissionedResolver.setText, (hex"00", "mount.parents", ENDORSED_PARENTS));
        calls[3] = abi.encodeCall(IPermissionedResolver.setText, (hex"00", "agent-context", AGENT_CONTEXT_URL));
        calls[4] =
            abi.encodeCall(IPermissionedResolver.setText, (hex"00", "agent-endpoint[web]", AGENT_ENDPOINT_WEB_URL));
        vm.prank(operator);
        sharedResolver.multicall(calls);

        // 6. Members: one register() each, roles 0, resolver = shared resolver. Members never send a tx.
        for (uint256 i; i < members.length; i++) {
            _registerMember(members[i], makeAddr(members[i]));
        }
    }

    // ================================================================== world-building helpers

    function _loadDeployment() internal {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../deployments/sepolia.json"));
        ethRegistry = IPermissionedRegistry(vm.parseJsonAddress(json, ".contracts.ETHRegistry.address"));
        registrar = IETHRegistrar(vm.parseJsonAddress(json, ".contracts.ETHRegistrar.address"));
        factory = IVerifiableFactory(vm.parseJsonAddress(json, ".contracts.VerifiableFactory.address"));
        // viem's default Sepolia UR (proxy -> ManagedUniversalResolverProxy -> UniversalResolverV2).
        ur = IUniversalResolver(vm.parseJsonAddress(json, ".contracts.UpgradableUniversalResolverProxy.address"));
        helper = IUniversalHelper(vm.parseJsonAddress(json, ".contracts.UniversalHelper.address"));
        usdc = IMockUSDC(vm.parseJsonAddress(json, ".contracts.MockUSDC.address"));
        userRegistryImpl = vm.parseJsonAddress(json, ".contracts.UserRegistryImpl.address");
        permissionedResolverImpl = vm.parseJsonAddress(json, ".contracts.PermissionedResolverImpl.address");
    }

    /// Step 1 of the real registrar flow (same as scripts/lib/names.ts): subregistry 0, resolver 0, referrer 0.
    function _commitEth(string memory label, address owner, uint64 duration) internal returns (bytes32 secret) {
        secret = keccak256(abi.encode("mount.secret", label, owner));
        bytes32 commitment =
            registrar.makeCommitment(label, owner, secret, address(0), address(0), duration, bytes32(0));
        vm.prank(owner);
        registrar.commit(commitment);
    }

    /// Step 2 (after MIN_COMMITMENT_AGE): mint MockUSDC for the exact price, approve, register.
    function _registerEth(string memory label, address owner, bytes32 secret, uint64 duration) internal {
        (uint256 base, uint256 premium) = registrar.getRegisterPrice(label, duration, address(usdc));
        vm.startPrank(owner);
        usdc.mint(owner, base + premium);
        usdc.approve(address(registrar), base + premium);
        registrar.register(label, owner, secret, address(0), address(0), duration, address(usdc), bytes32(0));
        vm.stopPrank();
        assertEq(ethRegistry.findOwner(label), owner, "registrar did not hand the .eth name to its owner");
    }

    /// Full commit -> wait -> register for a single name (used for scam.eth inside its own test).
    function _obtainEth(string memory label, address owner, uint64 duration) internal {
        bytes32 secret = _commitEth(label, owner, duration);
        vm.warp(block.timestamp + registrar.MIN_COMMITMENT_AGE() + 1);
        _registerEth(label, owner, secret, duration);
    }

    function _deployUserRegistry(address owner, string memory saltTag) internal returns (address proxy) {
        vm.prank(owner);
        proxy = factory.deployProxy(
            userRegistryImpl, _salt(saltTag), abi.encodeCall(IUserRegistry.initialize, (_userGrants(owner)))
        );
        assertEq(factory.verifyContract(proxy), userRegistryImpl, "proxy not verifiable as a UserRegistry");
    }

    /// `<label>.eth` -> its own UserRegistry; the .eth name keeps resolver 0x0.
    function _setupParentRegistry(string memory label, address owner) internal {
        IPermissionedRegistry reg = IPermissionedRegistry(_deployUserRegistry(owner, "mount.parent-registry.v1"));
        parentRegistry[label] = reg;
        vm.prank(owner);
        ethRegistry.setSubregistry(labelId(label), address(reg));
        assertEq(ethRegistry.getResolver(label), address(0), "parent .eth must not carry a resolver");
    }

    /// `support.<label>.eth` registered in the parent's registry with subregistry = FLEET and resolver 0x0.
    function _mount(string memory label, address owner) internal {
        vm.prank(owner);
        parentRegistry[label].register(
            MOUNT_LABEL, owner, address(fleet), address(0), ALL_ROLES, uint64(block.timestamp) + ONE_YEAR
        );
    }

    function _registerMember(string memory label, address agent) internal returns (uint256 tokenId) {
        vm.prank(vendor);
        tokenId = fleet.register(
            label, agent, address(0), address(sharedResolver), MEMBER_ROLES, uint64(block.timestamp) + ONE_YEAR
        );
    }

    function _salt(string memory tag) internal pure returns (uint256) {
        return uint256(keccak256(bytes(tag)));
    }

    function _grants(address account) internal pure returns (IPermissionedResolver.Grant[] memory g) {
        g = new IPermissionedResolver.Grant[](1);
        g[0] = IPermissionedResolver.Grant(account, ALL_ROLES);
    }

    function _userGrants(address account) internal pure returns (IUserRegistry.Grant[] memory g) {
        g = new IUserRegistry.Grant[](1);
        g[0] = IUserRegistry.Grant(account, ALL_ROLES);
    }

    // ================================================================== name encoding

    function labelId(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    /// `<member>.support.<parent>.eth`
    function memberName(string memory member, string memory parent) internal pure returns (string memory) {
        return string.concat(member, ".", MOUNT_LABEL, ".", parent, ".eth");
    }

    /// DNS wire format of a dotted, already-normalized name ("" => 0x00).
    function dns(string memory name) internal pure returns (bytes memory out) {
        bytes memory s = bytes(name);
        uint256 start;
        for (uint256 i; i <= s.length; i++) {
            if (i == s.length || s[i] == ".") {
                uint256 len = i - start;
                if (len == 0) {
                    if (s.length == 0) break;
                    revert("empty label");
                }
                require(len < 256, "label too long");
                bytes memory label = new bytes(len);
                for (uint256 j; j < len; j++) {
                    label[j] = s[start + j];
                }
                out = abi.encodePacked(out, uint8(len), label);
                start = i + 1;
            }
        }
        out = abi.encodePacked(out, uint8(0));
    }

    /// ENSIP-1 namehash of a DNS-encoded name.
    function namehash(bytes memory dnsName) internal pure returns (bytes32) {
        return _namehashAt(dnsName, 0);
    }

    function _namehashAt(bytes memory d, uint256 offset) private pure returns (bytes32) {
        uint256 len = uint8(d[offset]);
        if (len == 0) return bytes32(0);
        bytes memory label = new bytes(len);
        for (uint256 j; j < len; j++) {
            label[j] = d[offset + 1 + j];
        }
        return keccak256(abi.encodePacked(_namehashAt(d, offset + 1 + len), keccak256(label)));
    }

    // ================================================================== resolution through the real UniversalResolver

    function urText(string memory name, string memory key)
        internal
        view
        returns (string memory value, address resolver)
    {
        bytes memory d = dns(name);
        bytes memory result;
        (result, resolver) = ur.resolve(d, abi.encodeCall(IRecordProfiles.text, (namehash(d), key)));
        value = abi.decode(result, (string));
    }

    function urAddr(string memory name) internal view returns (address value, address resolver) {
        bytes memory d = dns(name);
        bytes memory result;
        (result, resolver) = ur.resolve(d, abi.encodeWithSignature("addr(bytes32,uint256)", namehash(d), COIN_TYPE_ETH));
        bytes memory raw = abi.decode(result, (bytes));
        assertEq(raw.length, 20, "addr(60) must be 20 bytes");
        value = address(bytes20(raw));
    }

    /// Member resolves: the shared resolver is found AT THE LEAF (offset 0) and serves the default bundle.
    function assertMemberResolves(string memory name) internal view {
        (address found,, uint256 offset) = ur.findResolver(dns(name));
        assertEq(found, address(sharedResolver), string.concat(name, ": findResolver != shared resolver"));
        assertEq(offset, 0, string.concat(name, ": resolver not at the leaf"));

        (address a, address viaA) = urAddr(name);
        assertEq(a, settlement, string.concat(name, ": addr(60) != settlement"));
        assertEq(viaA, address(sharedResolver), string.concat(name, ": addr served by wrong resolver"));

        (string memory canonical, address viaT) = urText(name, "mount.canonical");
        assertEq(canonical, CANONICAL_NAME, string.concat(name, ": mount.canonical"));
        assertEq(viaT, address(sharedResolver), string.concat(name, ": text served by wrong resolver"));
    }

    /// True negative ("black"): no resolver anywhere on the path — not merely an empty record.
    ///   findResolver -> address(0); requireResolver and resolve -> ResolverNotFound(dnsName).
    function assertNoResolver(string memory name) internal {
        bytes memory d = dns(name);
        (address found,,) = ur.findResolver(d);
        assertEq(found, address(0), string.concat(name, ": expected NO resolver"));

        vm.expectRevert(abi.encodeWithSelector(IUniversalResolver.ResolverNotFound.selector, d));
        ur.requireResolver(d);

        bytes memory call = abi.encodeCall(IRecordProfiles.text, (namehash(d), "mount.canonical"));
        vm.expectRevert(abi.encodeWithSelector(IUniversalResolver.ResolverNotFound.selector, d));
        ur.resolve(d, call);
    }
}
