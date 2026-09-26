// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {MountBase} from "./MountBase.sol";
import {IPermissionedRegistry} from "../src/interfaces/IPermissionedRegistry.sol";
import {IPermissionedResolver} from "../src/interfaces/IPermissionedResolver.sol";

/// @title MOUNT — every claim of idea.md §2 / §6, proven against the real ENSv2 contracts on a pinned Sepolia fork.
/// One test per claim. World: see MountBase (fleet mounted under vendor.eth, shopa.eth, shopb.eth; members mia/kai/rin).
contract MountTest is MountBase {
    // ------------------------------------------------------------------ idea §2: one token, many mounts

    /// ONE register() mints ONE ERC-1155 token in the fleet, and that single token resolves under all three
    /// independently-owned .eth parents through the real UniversalResolver.
    function test_oneTokenThreeMounts() public {
        // Three different owners hold the three parents, each with its own registry, all pointing at the same fleet.
        assertEq(ethRegistry.findOwner("vendor"), vendor);
        assertEq(ethRegistry.findOwner("shopa"), shopa);
        assertEq(ethRegistry.findOwner("shopb"), shopb);

        // A brand-new member: exactly one transaction, sent by the vendor.
        address zoe = makeAddr("zoe");
        uint256 tokenId = _registerMember("zoe", zoe);
        assertEq(fleet.getTokenId(labelId("zoe")), tokenId);
        assertEq(fleet.ownerOf(tokenId), zoe);
        assertEq(fleet.balanceOf(zoe, tokenId), 1, "exactly one token");

        for (uint256 i; i < parents.length; i++) {
            string memory name = memberName("zoe", parents[i]);
            // Same registry, same owner behind every doorway: it is the same token, not three copies.
            assertEq(helper.findExactRegistry(dns(string.concat(MOUNT_LABEL, ".", parents[i], ".eth"))), address(fleet));
            assertEq(helper.findExactOwner(dns(name)), zoe, string.concat(name, ": owner"));
            assertMemberResolves(name);
        }
        assertTrue(address(parentRegistry["vendor"]) != address(parentRegistry["shopa"]));
        assertTrue(address(parentRegistry["shopa"]) != address(parentRegistry["shopb"]));
    }

    // ------------------------------------------------------------------ idea §6 #1: resolution == membership

    /// Non-members and the parent nodes themselves have NO resolver (true negative), not an empty record.
    function test_nonMemberAndParentHaveNoResolver() public {
        // Control: a member resolves with the shared resolver found at the leaf.
        assertMemberResolves(memberName("mia", "shopa"));

        assertNoResolver(memberName("bob", "shopa")); // non-member under a live mount
        assertNoResolver(memberName("bob", "vendor"));
        assertNoResolver("support.shopa.eth"); // the mount node itself
        assertNoResolver(CANONICAL_NAME);
        assertNoResolver("shopa.eth"); // the parent .eth name
        assertNoResolver("vendor.eth");
    }

    /// Members get the whole roster bundle from the default record (0x00) with ZERO per-member writes.
    function test_defaultBundleZeroMemberWrites() public view {
        // Only one record exists on the shared resolver: the default one. No member has a record of its own.
        assertEq(sharedResolver.getRecordCount(), 1, "only the default record exists");
        assertEq(sharedResolver.getRecordId(bytes32(0)), 1, "default record is record #1");

        for (uint256 m; m < members.length; m++) {
            for (uint256 p; p < parents.length; p++) {
                string memory name = memberName(members[m], parents[p]);
                assertEq(sharedResolver.getRecordId(namehash(dns(name))), 0, string.concat(name, ": has own record"));
                assertMemberResolves(name);
                (string memory v,) = urText(name, "mount.parents");
                assertEq(v, ENDORSED_PARENTS);
                (v,) = urText(name, "agent-context");
                assertEq(v, AGENT_CONTEXT_URL);
                (v,) = urText(name, "agent-endpoint[web]");
                assertEq(v, AGENT_ENDPOINT_WEB_URL);
            }
        }
    }

    // ------------------------------------------------------------------ kill switches

    /// A merchant unmounts with ONE tx (setSubregistry(support, 0)); only its doorway dies.
    function test_merchantUnmountKillsOnlyItsDoorway() public {
        for (uint256 m; m < members.length; m++) {
            assertMemberResolves(memberName(members[m], "shopa")); // alive before
        }

        vm.prank(shopa);
        parentRegistry["shopa"].setSubregistry(labelId(MOUNT_LABEL), address(0));

        assertEq(helper.findExactRegistry(dns("support.shopa.eth")), address(0));
        for (uint256 m; m < members.length; m++) {
            assertNoResolver(memberName(members[m], "shopa"));
            assertMemberResolves(memberName(members[m], "vendor"));
            assertMemberResolves(memberName(members[m], "shopb"));
        }
    }

    /// The vendor unregisters a member with ONE tx; that member dies under EVERY doorway, other members live.
    function test_vendorUnregisterKillsAllDoorways() public {
        for (uint256 p; p < parents.length; p++) {
            assertMemberResolves(memberName("mia", parents[p])); // alive before
        }
        uint256 oldTokenId = fleet.getTokenId(labelId("mia"));
        assertEq(fleet.ownerOf(oldTokenId), mia);

        vm.prank(vendor);
        fleet.unregister(labelId("mia"));

        IPermissionedRegistry.State memory s = fleet.getState(labelId("mia"));
        assertEq(uint8(s.status), uint8(IPermissionedRegistry.Status.AVAILABLE));
        assertEq(fleet.ownerOf(oldTokenId), address(0), "token burned");
        assertEq(fleet.balanceOf(mia, oldTokenId), 0);

        for (uint256 p; p < parents.length; p++) {
            assertNoResolver(memberName("mia", parents[p]));
            assertMemberResolves(memberName("kai", parents[p]));
            assertMemberResolves(memberName("rin", parents[p]));
        }
    }

    /// One parent .eth name lapses (shopb.eth, registered for the 28-day minimum); only its doorway dies.
    function test_parentLapseKillsOnlyThatDoorway() public {
        uint64 shopbExpiry = ethRegistry.getExpiry(labelId("shopb"));
        assertLt(shopbExpiry, ethRegistry.getExpiry(labelId("vendor")));
        assertLt(shopbExpiry, ethRegistry.getExpiry(labelId("shopa")));
        assertMemberResolves(memberName("mia", "shopb"));

        vm.warp(shopbExpiry); // expired <=> block.timestamp >= expiry

        // shopb.eth has lapsed; everything beneath it is cut out of resolution.
        assertEq(uint8(ethRegistry.getState(labelId("shopb")).status), uint8(IPermissionedRegistry.Status.AVAILABLE));
        assertEq(ethRegistry.getSubregistry("shopb"), address(0));
        // vendor.eth, shopa.eth, the support entries and the members are all still live.
        assertEq(uint8(ethRegistry.getState(labelId("vendor")).status), uint8(IPermissionedRegistry.Status.REGISTERED));
        assertEq(uint8(ethRegistry.getState(labelId("shopa")).status), uint8(IPermissionedRegistry.Status.REGISTERED));
        assertEq(uint8(fleet.getState(labelId("mia")).status), uint8(IPermissionedRegistry.Status.REGISTERED));

        for (uint256 m; m < members.length; m++) {
            assertNoResolver(memberName(members[m], "shopb"));
            assertMemberResolves(memberName(members[m], "vendor"));
            assertMemberResolves(memberName(members[m], "shopa"));
        }
    }

    // ------------------------------------------------------------------ soulbound

    /// Members are soulbound because they hold no ROLE_CAN_TRANSFER_ADMIN; an approved operator cannot bypass it.
    /// unsafeTransfer is the path that reaches the role lock (safeTransferFrom is stopped earlier by the
    /// separate "registry not emancipated" lock, so it would not prove soulbound on its own).
    function test_soulboundEvenViaApprovedOperator() public {
        uint256 tokenId = fleet.getTokenId(labelId("mia"));
        uint256 resource = fleet.getState(labelId("mia")).resource;
        assertEq(fleet.roles(resource, mia), 0, "member holds no roles");

        vm.prank(mia);
        fleet.setApprovalForAll(kai, true);

        // The approved operator takes the transfer path that checks roles: blocked by the missing role on `from`.
        vm.prank(kai);
        vm.expectRevert(abi.encodeWithSelector(IPermissionedRegistry.TransferDisallowed.selector, tokenId, mia));
        fleet.unsafeTransfer(kai, tokenId, "");

        // The owner herself is blocked the same way.
        vm.prank(mia);
        vm.expectRevert(abi.encodeWithSelector(IPermissionedRegistry.TransferDisallowed.selector, tokenId, mia));
        fleet.unsafeTransfer(kai, tokenId, "");

        // Second, independent lock: the fleet is never emancipated (vendor keeps root UNREGISTER etc.).
        assertFalse(fleet.isEmancipated());
        vm.prank(kai);
        vm.expectRevert(IPermissionedRegistry.TransferUnsafeUntilRegistryIsEmancipated.selector);
        fleet.safeTransferFrom(mia, kai, tokenId, 1, "");

        assertEq(fleet.ownerOf(tokenId), mia, "still mia's");
        assertMemberResolves(memberName("mia", "vendor"));

        // Control: the SAME path succeeds for a token registered WITH ROLE_CAN_TRANSFER_ADMIN, so the revert above
        // is the role lock and nothing else.
        address ada = makeAddr("ada");
        vm.prank(vendor);
        uint256 adaToken = fleet.register(
            "ada",
            ada,
            address(0),
            address(sharedResolver),
            REG_ROLE_CAN_TRANSFER_ADMIN,
            uint64(block.timestamp) + ONE_YEAR
        );
        vm.prank(ada);
        fleet.setApprovalForAll(kai, true);
        vm.prank(kai);
        fleet.unsafeTransfer(kai, adaToken, "");
        assertEq(fleet.ownerOf(adaToken), kai, "transferable token moved");
    }

    // ------------------------------------------------------------------ idea §6 #3: shared-resolver permissions

    /// A member cannot write the shared resolver (neither its own name nor the default bundle),
    /// and cannot re-point its own registry entry to another resolver.
    function test_memberCannotWriteSharedResolver() public {
        uint256 keyResource = uint256(keccak256(bytes("mount.canonical")));
        bytes memory ownName = dns(memberName("mia", "vendor"));

        vm.startPrank(mia);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPermissionedResolver.EACUnauthorizedAccountRoles.selector, keyResource, RES_ROLE_SET_TEXT, mia
            )
        );
        sharedResolver.setText(ownName, "mount.canonical", "support.scam.eth");

        vm.expectRevert(
            abi.encodeWithSelector(
                IPermissionedResolver.EACUnauthorizedAccountRoles.selector, keyResource, RES_ROLE_SET_TEXT, mia
            )
        );
        sharedResolver.setText(hex"00", "mount.canonical", "support.scam.eth");

        uint256 entryResource = fleet.getState(labelId("mia")).resource;
        vm.expectRevert(
            abi.encodeWithSelector(
                IPermissionedRegistry.EACUnauthorizedAccountRoles.selector, entryResource, REG_ROLE_SET_RESOLVER, mia
            )
        );
        fleet.setResolver(labelId("mia"), mia);
        vm.stopPrank();

        assertEq(sharedResolver.getRecordCount(), 1, "no record was created");
        assertMemberResolves(memberName("mia", "vendor"));
        assertMemberResolves(memberName("kai", "shopa"));
    }

    /// HAZARD (why members never get roles): a setter role "scoped" to one member's name is really scoped to the
    /// record KEY, so the member can rewrite the default bundle for everyone and another member's value.
    function test_scopedMemberRoleWouldRewriteEveryone() public {
        // Operator grants mia a setter role derived from a setText call on HER OWN name.
        bytes memory scopedTo =
            abi.encodeCall(IPermissionedResolver.setText, (dns(memberName("mia", "vendor")), "mount.canonical", ""));
        vm.prank(operator);
        sharedResolver.grantSetterRoles(scopedTo, mia);

        // ...but mia can now rewrite the DEFAULT record: every member under every doorway changes.
        vm.prank(mia);
        sharedResolver.setText(hex"00", "mount.canonical", "support.scam.eth");
        for (uint256 m; m < members.length; m++) {
            for (uint256 p; p < parents.length; p++) {
                (string memory v,) = urText(memberName(members[m], parents[p]), "mount.canonical");
                assertEq(v, "support.scam.eth", "default bundle rewritten by a member");
            }
        }

        // ...and another member's own value.
        string memory kaiName = memberName("kai", "vendor");
        vm.prank(mia);
        sharedResolver.setText(dns(kaiName), "mount.canonical", "hijacked-by-mia");
        (string memory kaiValue,) = urText(kaiName, "mount.canonical");
        assertEq(kaiValue, "hijacked-by-mia", "kai's record rewritten by mia");
    }

    // ------------------------------------------------------------------ idea §6 #2: counterfeit mounts

    /// Anyone can mount the fleet under their own name and it resolves (the settlement address included);
    /// only the canonical back-pointer and the roster's own mount.parents reveal it as counterfeit.
    function test_counterfeitMountResolves() public {
        vm.deal(scam, 10 ether);
        _obtainEth("scam", scam, ONE_YEAR);
        _setupParentRegistry("scam", scam);
        assertNoResolver(memberName("mia", "scam")); // dead before the counterfeit mount
        _mount("scam", scam); // no consent from the vendor needed

        string memory name = memberName("mia", "scam");
        assertMemberResolves(name);
        (address paidTo, address via) = urAddr(name);
        assertEq(paidTo, settlement, "counterfeit doorway serves the real settlement address");
        assertEq(via, address(sharedResolver));

        // What a verifier checks: the fleet's canonical name is still support.vendor.eth ...
        assertEq(helper.findCanonicalName(address(fleet)), dns(CANONICAL_NAME));
        assertEq(helper.findCanonicalRegistry(dns(CANONICAL_NAME)), address(fleet));
        // ... the counterfeit mount reaches the fleet but is not its canonical registry ...
        assertEq(helper.findExactRegistry(dns("support.scam.eth")), address(fleet));
        assertEq(helper.findCanonicalRegistry(dns("support.scam.eth")), address(0));
        // ... and the roster never endorsed it (two-sided consent fails).
        (string memory endorsed,) = urText(name, "mount.parents");
        assertEq(endorsed, ENDORSED_PARENTS);
        assertEq(vm.indexOf(endorsed, "support.scam.eth"), type(uint256).max, "scam not endorsed");
    }
}
