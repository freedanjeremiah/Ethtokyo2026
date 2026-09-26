# ENSv2 on Sepolia — pinned deployment and semantics (FNS Task 2)

Researched 2026-09-26 against Sepolia block ~11,784,2xx. Every claim is tagged:

- **VERIFIED-ONCHAIN**: observed on live Sepolia (`cast` against `https://ethereum-sepolia-rpc.publicnode.com`) or on an anvil fork of it (commands + output in the Appendix).
- **VERIFIED-SOURCE**: read in the Solidity that is actually deployed (see §0 for how that was established).
- **UNVERIFIED**: stated by someone else, not checked.

Source citations use `contracts-v2@f2f0a05e:<path>:<line>` = https://github.com/ensdomains/contracts-v2 at tag
`sepolia-deployment-2026-09-15` (commit `f2f0a05e6c1711134b73204a1e37f8e6c1aea6ab`), directory `contracts/`.

---

## 0. Which deployment, and why we trust the source

There are **two** "2026-09-15" deployments in the `ensdomains/contracts-v2` repo. We pin the second one.

| Candidate | Where | Deployed at | RootRegistry | UniversalResolverV2 | Live? |
|---|---|---|---|---|---|
| A (phase-1 re-migration) | branch `deploy/sepolia-migration-20260915` @ `07690a9c`, `contracts/docs/addresses/sepolia.md` | 2026-09-15T03:40:01Z | `0x0f62fbf8…4a55` | `0xc105976531cd90285b91fbef70ca7d8d6597095d` | **No** — nothing routes to it |
| **B (pinned)** | commit `71a3b733` "chore(sepolia): deploy a fresh v2 migration set", tag `sepolia-deployment-2026-09-15` (`f2f0a05e`), merged into `post-audit-2` via PR #427 (`788264c4`, 2026-09-22) | 2026-09-15T09:46:38Z | `0x9703dbd2…a9ce` | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` | **Yes** |

Older archived sets also exist in the repo (`sepolia-20260629-r1`, `sepolia-20260730-r1`, `sepolia-official-v1-20260525-r2`) — superseded, not used.

Evidence that B is the live one:
- viem 2.56.9's built-in `sepolia.contracts.ensUniversalResolver` is `0xeeeeeeee14d718c2b47d9923deab1335e144eeee` (`node_modules/viem/_esm/chains/definitions/sepolia.js`). On-chain: `0xeEeE…EeEe.implementation() = 0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1` (ManagedUniversalResolverProxy), whose `implementation() = 0x5d25C1D6…03e3` (B's UniversalResolverV2), whose `ROOT_REGISTRY() = 0x9703DBD2…a9cE` (B's RootRegistry). Candidate A's UR `0xc105…095d` has `ROOT_REGISTRY() = 0x0F62…4A55` but no proxy points at it. **VERIFIED-ONCHAIN**
- docs.ens.domains/learn/deployments lists exactly B's addresses (RootRegistry `0x9703…`, ETHRegistry `0x657e…`, ETHRegistrar `0xabe7…`, UserRegistryImpl `0xa803…`, PermissionedResolverImpl `0x14f0…`, VerifiableFactory `0x9e72…`, UniversalResolverV2 `0x5d25…`). (fetched 2026-09-26) **VERIFIED-SOURCE (docs)**
- This is the post-09-15 redeploy the team refers to. Nothing newer: `git log --all --since=2026-09-10 -- contracts/deployments/sepolia` shows only 5fb88dcf, 07690a9c (A), 71a3b733 (B), f2f0a05e (tag), 788264c4 (merge; `git diff 71a3b733 origin/post-audit-2 -- contracts/deployments/sepolia` changes only `fixtures.md`). **VERIFIED-SOURCE**

Source ↔ bytecode:
- For RootRegistry, ETHRegistry, ETHRegistrar, UserRegistryImpl, PermissionedResolverImpl, VerifiableFactory, UniversalResolverV2, PublicResolverV2, LabelStore: `cast code` on Sepolia equals the artifact's `deployedBytecode` byte-for-byte after zeroing the artifact's `immutableReferences` ranges (script: Appendix A.1). **VERIFIED-ONCHAIN**
- The Solidity sources embedded in the artifacts' build-info (`contracts/deployments/sepolia/build-info/solc-0_8_25-dabdd66c…json`, `…08274c97…json`, `…32c5cc51…json`) are byte-identical to the files at tag `f2f0a05e` for every file cited below (`cmp`). So line citations at `f2f0a05e` describe the deployed code. **VERIFIED-SOURCE**
- Etherscan source verification was not checked (no API key); the ABIs in `deployments/abis/` are taken from the repo artifacts, whose bytecode matches chain.

## 1. Pinned contracts (`deployments/sepolia.json`)

`deployments/sepolia.json` = `{ chainId: 11155111, source: {...}, contracts: { <name>: { address, abi: "abis/<name>.json", codeHash } } }`.
`codeHash` = `keccak256(eth_getCode)` on Sepolia; `scripts/check-deployment.ts` re-checks it, so a silent redeploy/upgrade shows as FAIL.

| Name | Address | Role in FNS |
|---|---|---|
| RootRegistry | `0x9703DBD26dAB89504490994138cF2c575251a9cE` | root of the v2 tree; `getSubregistry("eth") = ETHRegistry` |
| ETHRegistry | `0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E` | `.eth` registry (a `PermissionedRegistry`), `getParent() = (RootRegistry, "eth")` |
| ETHRegistrar | `0xAbe76F6C8DFcEd81AA5A2bB8034202A7136b94ca` | commit/reveal `.eth` registrar; holds `ROLE_REGISTRAR` on ETHRegistry root |
| UserRegistryImpl | `0xA80338aAA8D23831cEa25E858D1774534aBb0263` | implementation for UserRegistry proxies (fleet + each parent's registry) |
| PermissionedResolverImpl | `0x14F09Fd05d4585759e54844DC9B00147131Cf243` | implementation for the shared resolver (default record `0x00`, `linkToNode`/`linkToRecord`) |
| VerifiableFactory | `0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C` | **the** factory for both UserRegistry and PermissionedResolver proxies |
| UniversalResolverV2 | `0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3` | v2 UR implementation (`isENSv2() = true`) |
| ManagedUniversalResolverProxy | `0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1` | proxy → UniversalResolverV2 |
| UpgradableUniversalResolverProxy | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` | viem's default Sepolia UR; proxy → Managed proxy. Call UR functions here with the UniversalResolverV2 ABI |
| UniversalHelper | `0x33f571aa8A160a21b877cF6E0Fb8806692b97DF5` | view helpers: `findCanonicalName(registry)`, `findCanonicalRegistry(name)`, `findExactRegistry(name)`, … (verifier C2) |
| LabelStore | `0x375C082021E677a40eA2AE094D050602dba90992` | global labelhash→label store (every `register` writes to it; `setLabel` is permissionless) |
| StandardRentPriceOracle | `0x9B0b9C65BDAf9794Ff7697E4dCFb1f50581072BB` | registrar pricing |
| MockUSDC | `0x16f95D91DBa7dA3Aca778Ec053dF0FF6C6A8aA8e` | payment token accepted by ETHRegistrar; 6 decimals; `mint(address,uint256)` |

Not pinned (exist, not needed): PublicResolverV2 `0xd7e5…a50f`, BatchRegistrar, WrapperRegistryImpl, migration controllers, HCA contracts, DNS resolvers — full list in `contracts-v2@f2f0a05e:contracts/deployments/sepolia/addresses.md`.

**There is no dedicated "UserRegistryFactory" or "PermissionedResolverFactory".** Both are deployed as proxies through the generic `VerifiableFactory.deployProxy(implementation, salt, initData)`. This matches ENS's own tooling (`contracts-v2@f2f0a05e:contracts/script/setup.ts:801-827` `deployUserRegistry`, `:772-799` `deployPermissionedResolver`). **VERIFIED-SOURCE + VERIFIED-ONCHAIN (fork)**

## 2. Registry model

### 2.1 Entries, token IDs, resources (VERIFIED-SOURCE)
- A `PermissionedRegistry` stores per label: `Entry { uint32 eacVersionId; uint32 tokenVersionId; IRegistry subregistry; uint64 expiry; address resolver; }` keyed by labelhash with the low 32 bits zeroed (`PermissionedRegistry.sol:65-76`, `_entry` `:631-633`).
- `anyId` parameters accept a labelhash, a token ID or a resource interchangeably (`:25-29`); `LibLabel.withVersion(anyId, v) = anyId ^ uint32(anyId) ^ v` replaces the low 32 bits (`src/utils/LibLabel.sol:15-17`).
- **tokenId** = labelhash with low 32 bits = `tokenVersionId` (`:684-686`). **resource** (EAC permission scope) = labelhash with low 32 bits = `eacVersionId` (`+1` if expired) (`:670-681`). Both bump on `unregister` (`:229-233`); `tokenVersionId` also bumps when a token's roles change ("regenerate" = burn + re-mint with a new id, `:542-581`). → **Never cache a tokenId across role changes; always re-read `getTokenId(labelhash)`.**
- ERC-1155 "singleton": one token per name, balance 0/1; `ownerOf(tokenId)` returns 0 if the id is stale or expired (`:371-382`).

### 2.2 `getState` field order (VERIFIED-SOURCE + VERIFIED-ONCHAIN)
`IPermissionedRegistry.sol:23-36`:
```solidity
enum Status { AVAILABLE, RESERVED, REGISTERED }            // 0,1,2
struct State { Status status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }
function getState(uint256 anyId) external view returns (State memory);
```
Fork output for a freshly registered `mia`: `(2, 1821937752, 0x358d…c24b, 2576…3744, 2576…3744)`; after `unregister`: `(0, <now>, 0x0, …3745, …3746)` (tokenId version 1, resource version 1+1 because expired). Decode positionally in exactly this order. Other getters that **do** exist: `getStatus, getExpiry, getOwner, getTokenId, getResource, latestOwnerOf, ownerOf, getSubregistry(string), getResolver(string), getParent(), findExpiry(string), findOwner(string), findTokenId(string)` (`PermissionedRegistry.sol:277-382`). There is no `getRoleCount`/per-role convenience getter — use `roleCount`, `getAssigneeCount`, `roles`, `hasRoles`, `hasRootRoles`.

### 2.3 Expiry semantics (VERIFIED-SOURCE; lapse effect VERIFIED-ONCHAIN on fork)
- Expired ⇔ `block.timestamp >= expiry` (`:663-665`); an expired name is `AVAILABLE`.
- `getSubregistry(label)` and `getResolver(label)` return `0` when the entry is expired (`:277-286`). So a lapsed parent (`support.shopa.eth` or `shopa.eth`) cuts every name beneath it out of resolution, and a lapsed member stops resolving. Fork step 11: after warping past expiry `kai.support.vendor.eth` → `ResolverNotFound`. (That warp expired members *and* parents together; the isolated "one parent lapses, others survive" case was not re-run here — the team reports it; source makes it follow directly.)
- `renew(anyId, newExpiry)` needs `ROLE_RENEW` on the name (or root); cannot reduce expiry (`:240-256`).

### 2.4 Roles and the 4-bit nybble packing (VERIFIED-SOURCE + VERIFIED-ONCHAIN)
- Role bitmaps are `uint256` split into 64 nybbles: nybbles 0-31 = regular roles, 32-63 = the matching admin roles (`role << 128`). Each role is bit 0 of its nybble (`EACBaseRolesLib.sol:19-24`, `RegistryRolesLib.sol:4-6`).
- `roleCount(resource)` packs, per nybble, **how many accounts hold that role (0-15)**; granting to a 16th account reverts `EACMaxAssignees` (`EnhancedAccessControl.sol:332-348`). `EACBaseRolesLib.fromCounts(counts)` converts counts back to a presence bitmap (`EACBaseRolesLib.sol:39-41`). Fork: fleet root with only the vendor → `roleCount(0) = 0x1111…1111`; after `grantRootRoles(ROLE_REGISTRAR, operator)` → `0x1111…1112` (nybble 0 count = 2); `getAssigneeCount(0, 0x1001)` → `(counts=0x1002, mask=0xf00f)`.
- `ROOT_RESOURCE = 0` (`EnhancedAccessControl.sol:54`). Effective roles on a name = roles on the name's resource **OR** roles on root (`:463-465`). ⇒ whoever holds a root role on the fleet registry can exercise it on every member.
- If `account` is `isApprovedForAll`-approved by the token owner, it additionally gets the owner's roles on that token (`PermissionedRegistry.sol:614-628`).
- Grant/revoke rules: `grantRoles(anyId, bitmap, account)` needs the corresponding admin role; on a **token** resource only *regular* roles can be granted afterwards (admin roles only at `register`) (`:598-610`); root grants use `grantRootRoles` (`EnhancedAccessControl.sol:134-141`).

`RegistryRolesLib` (`src/registry/libraries/RegistryRolesLib.sol:9-63`):

| Role | Value | Scope |
|---|---|---|
| ROLE_REGISTRAR | `1<<0` | root: register/reserve |
| ROLE_REGISTER_RESERVED | `1<<4` | root |
| ROLE_SET_PARENT | `1<<8` | root: `setParent` (canonical back-pointer) |
| ROLE_UNREGISTER | `1<<12` | root or token |
| ROLE_RENEW | `1<<16` | root or token |
| ROLE_SET_SUBREGISTRY | `1<<20` | root or token |
| ROLE_SET_RESOLVER | `1<<24` | root or token |
| ROLE_CAN_TRANSFER_ADMIN | `(1<<28)<<128` | token only; checked on the owner at transfer |
| ROLE_WAS_RESERVED | `1<<32` | token tag |
| ROLE_SET_URI | `1<<36` | root |
| ROLE_CAN_NAME | `1<<120` | root |
| ROLE_UPGRADE | `1<<124` | root: UUPS upgrade |
| `*_ADMIN` | `role << 128` | may grant/revoke that role |
| ALL (used by ENS's own setup) | `0x1111…1111` | every role + admin (`script/deploy-constants.ts:92`) |

### 2.5 Soulbound / transfer mechanics (VERIFIED-SOURCE + VERIFIED-ONCHAIN)
`PermissionedRegistry._update` (`:509-539`), on every transfer (not mint/burn):
1. `safeTransferFrom` (the `safe=true` path) reverts `TransferUnsafeUntilRegistryIsEmancipated()` unless the registry is emancipated (no account holds any of `UNEMANCIPATED_ROLE_BITMAP` = SET_SUBREGISTRY/SET_RESOLVER/UNREGISTER/UPGRADE (+admins) on root; `:425-430`, `RegistryRolesLib.sol:67-75`). A fleet whose vendor keeps root UNREGISTER is **never** emancipated.
2. Otherwise (`unsafeTransfer`, or safe on an emancipated registry) it requires the **owner** (`from`) to hold `ROLE_CAN_TRANSFER_ADMIN` on the token, else `TransferDisallowed(tokenId, from)`. Operator approval cannot bypass: the check reads `from`'s roles.
3. Roles move with the token (`_transferRoles`).

⇒ **Soulbound = register the member with `roleBitmap` that lacks `ROLE_CAN_TRANSFER_ADMIN`** (FNS uses `0`). Fork step 8 with `roles=0`: mia `safeTransferFrom` → `TransferUnsafeUntilRegistryIsEmancipated`; mia `unsafeTransfer` → `TransferDisallowed`; after `setApprovalForAll(kai)`, kai `safeTransferFrom` → `TransferUnsafeUntilRegistryIsEmancipated`, kai `unsafeTransfer` → `TransferDisallowed`. Mia also cannot `setResolver` on her own name (`EACUnauthorizedAccountRoles`).

Note: `.eth` names from ETHRegistrar get `REGISTRATION_ROLE_BITMAP = SET_SUBREGISTRY(+ADMIN) | SET_RESOLVER(+ADMIN) | CAN_TRANSFER_ADMIN` (`src/registrar/ETHRegistrar.sol:18-23`); fork: `ETHRegistry.roles(labelhash("vendor"), vendor) = 0x1110000000000000000000000000000001100000`. The owner does **not** get RENEW/UNREGISTER on ETHRegistry (renew goes through the registrar). `ETHRegistry.isEmancipated() = true` on Sepolia. **VERIFIED-ONCHAIN**

## 3. Operations — exact signatures (all VERIFIED-SOURCE, exercised on fork)

### 3.1 Register a `.eth` name
Real path (works on a fork and on live Sepolia; used in the fork run):
```solidity
// ETHRegistrar 0xAbe7…94ca  (src/registrar/ETHRegistrar.sol:114-172, 205-228)
function makeCommitment(string label, address owner, bytes32 secret, IRegistry subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32);
  // = keccak256(abi.encode(label, owner, secret, subregistry, resolver, duration, referrer))
function commit(bytes32 commitment);
function register(string label, address owner, bytes32 secret, IRegistry subregistry, address resolver, uint64 duration, IERC20 paymentToken, bytes32 referrer) returns (uint256 tokenId);
function isAvailable(string label) view returns (bool);
function getRegisterPrice(string label, uint64 duration, IERC20 paymentToken) view returns (uint256 base, uint256 premium);
```
Live values (VERIFIED-ONCHAIN): `MIN_COMMITMENT_AGE = 60`, `MAX_COMMITMENT_AGE = 86400`, `MIN_REGISTER_DURATION = 2419200` (28 d), `GRACE_PERIOD = 2419200`. Payment: `MockUSDC` (6 dp); 1-year price `vendor`/`shopa` = 8.000021 USDC, `scam` (4 chars) = 160.000009 USDC, premium 0. Caller must `approve(ETHRegistrar, price)`; the payer is `msg.sender`, the name goes to `owner`. `MockUSDC.mint(to, amount)` succeeded for arbitrary fresh accounts on the fork (permissionless there; live-Sepolia behaviour assumed identical — same bytecode). `vendor`, `shopa`, `shopb`, `scam` all `isAvailable = true` on 2026-09-26.
Because the commitment binds `subregistry`, deploy the parent's own UserRegistry **first** and pass it in, or register with `0` and call `ETHRegistry.setSubregistry(labelhash, reg)` afterwards (owner holds ROLE_SET_SUBREGISTRY).

Fork shortcut (optional): impersonate `ETHRegistrar` (it holds root `ROLE_REGISTRAR` on ETHRegistry: `hasRootRoles(1, 0xAbe7…) = true`) and call `ETHRegistry.register(...)` directly with any role bitmap. We did not need it.

### 3.2 Deploy a UserRegistry via the factory
```solidity
// VerifiableFactory 0x9e72…841C  (lib/verifiable-factory/src/VerifiableFactory.sol:32-46)
function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy);
  // CREATE2 salt = keccak256(abi.encode(msg.sender, salt)); then proxy.initialize(implementation, data); emits ProxyDeployed(sender, proxy, salt, impl)
function verifyContract(address proxy) view returns (address implementation); // reverts VerificationFailed if not from this factory
// data for a UserRegistry (src/registry/UserRegistry.sol:49-58; Grant = (address account, uint256 roleBitmap)):
UserRegistry.initialize((address,uint256)[] grants)   // grants on ROOT_RESOURCE; reverts InvalidOwner if none
```
Example (fork): `data = cast calldata 'initialize((address,uint256)[])' "[(VENDOR,0x1111…1111)]"`, `deployProxy(0xA803…0263, 777, data)` → fleet at a deterministic address; gas ≈ 177.6k. Get the address by simulating the same call first (`eth_call` from the same sender) or from the `ProxyDeployed` event. `verifyContract(fleet)` returned `0xA803…0263`. ENS's own salt convention (optional): `keccak256(abi.encode(keccak256("UserRegistry"), namehash(name), version))` (`script/setup.ts:757-770`).

### 3.3 Deploy the shared PermissionedResolver via the factory
```solidity
PermissionedResolver.initialize((address,uint256)[] grants, bytes[] calls)   // src/resolver/PermissionedResolver.sol:119-126
```
`deployProxy(0x14F0…f243, salt, initialize([(OPERATOR, 0x1111…1111)], []))` (gas ≈ 177.9k). `calls` are multicalled during init *without* permission checks (`:370-378`), so records can be seeded atomically.

### 3.4 `setSubregistry` / `setResolver` / `setParent`
```solidity
function setSubregistry(uint256 anyId, IRegistry registry);   // PermissionedRegistry.sol:145-150  needs ROLE_SET_SUBREGISTRY on name or root; reverts LabelExpired
function setResolver(uint256 anyId, address resolver);         // :153-158  needs ROLE_SET_RESOLVER
function setParent(IRegistry parent, string label);            // :172-179  needs root ROLE_SET_PARENT
function getParent() view returns (IRegistry parent, string label);
```
- **Mount** = `parentRegistry.setSubregistry(labelhash("support"), FLEET)`; **unmount** = `setSubregistry(labelhash("support"), address(0))`. Several registries may point at the same FLEET; nothing on-chain prevents or records it (fork: vendor, shopa, scam all mounted the same fleet). **VERIFIED-ONCHAIN**
- **Canonical mount** is expressed by the child: `FLEET.setParent(vendorRegistry, "support")`. The resolver-independent canonical name is computed by walking `getParent()` and checking `parent.getSubregistry(label) == child` all the way to RootRegistry (`src/universalResolver/libraries/LibResolution.sol:119-146`). **Every registry in the chain needs `setParent`**: fork showed `findCanonicalName(fleet) = 0x` until `vendorRegistry.setParent(ETHRegistry, "vendor")` was also called; then it returned `dns("support.vendor.eth")`. `ETHRegistry.getParent() = (RootRegistry, "eth")` on-chain. `UniversalHelper.findCanonicalRegistry(dns("support.shopa.eth")) = 0x0` while `findExactRegistry(...) = FLEET` — this is the C2 "canonical registry" signal for the verifier. **VERIFIED-ONCHAIN (fork)**
- Parent nodes: register `support` in the parent's registry with `resolver = 0`, then `setSubregistry`. (Fork used `register("support", owner, 0, 0, ALL, expiry)` then `setSubregistry`.)

### 3.5 `register` on a UserRegistry (members)
```solidity
function register(string label, address owner, IRegistry registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId);  // PermissionedRegistry.sol:207-220, _register :440-506
```
- Needs root `ROLE_REGISTRAR` (or `ROLE_REGISTER_RESERVED` for a reserved label). `owner == 0` with `roleBitmap == 0` reserves instead. `expiry` must be in the future. Reverts `LabelAlreadyRegistered` / `LabelAlreadyReserved` if live. Writes the label to LabelStore, mints the ERC-1155 token to `owner`, grants `roleBitmap` on the new token resource (admin roles allowed here, and only here).
- FNS: `FLEET.register("mia", MIA, address(0), SHARED_RESOLVER, 0, expiry)` — gas ≈ 125k.

### 3.6 Unregister / burn
```solidity
function unregister(uint256 anyId);   // PermissionedRegistry.sol:224-235 — needs ROLE_UNREGISTER on the name or on root
```
Burns the token, bumps both version ids, sets `expiry = block.timestamp` (name becomes AVAILABLE immediately). Fork step 10: vendor (root ROLE_UNREGISTER) unregistered `mia`; `mia.support.vendor.eth` and `mia.support.scam.eth` → `ResolverNotFound` in the next call, `kai.*` unaffected. (`mia.support.shopa.eth` had already been unmounted in step 9.) **VERIFIED-ONCHAIN (fork)**

## 4. PermissionedResolver: default record `0x00`, linking, permissions

### 4.1 Records and the default record (VERIFIED-SOURCE + VERIFIED-ONCHAIN)
- Records live in `_records[recordId]`; `_recordIds[node]` maps a namehash to a record id (`PermissionedResolver.sol:94-100`). Setters take a **DNS-encoded name** (not a node) and create a record for `namehash(name)` on first write (`_ensureRecord`, `:352-360`).
- Reads go only through ENSIP-10 `resolve(bytes name, bytes data)`; the node inside `data` is ignored and the record is chosen by `namehash(name)` (`AbstractRecordResolver.sol:108-123`). There are no direct `text(node,key)`/`addr(node)` functions on this contract — use the UniversalResolver / viem.
- **Default record**: if `namehash(name)` has no record, `_record` falls back to `_recordIds[bytes32(0)]` — the record of the root name, DNS-encoded `0x00` (`:381-387`, doc `:54`). So writing `setText(0x00, key, value)` / `setAddress(0x00, 60, addr)` gives **every** name that reaches this resolver without its own record those values. Both text and addr (and data, contenthash, …) come from the same record. Fork: after 3 writes on `0x00` (`getRecordId(0x0) = 1`), `mia.support.{vendor,shopa,scam}.eth` and `kai.support.shopa.eth` all returned `text(enf.canonical) = "support.vendor.eth"` and `addr = 0x…bEEF` through the real UR. ⇒ the roster keys **can** live in the default bundle. **VERIFIED-ONCHAIN (fork)**
- `addr(coinType)` falls back to the default coin type (ENSIP-19) for EVM chains when unset (`AbstractRecordResolver.sol:169-179`).

### 4.2 `linkToNode` / `linkToRecord` (VERIFIED-SOURCE + VERIFIED-ONCHAIN)
```solidity
function linkToNode(bytes sourceName, bytes32 targetNode);   // :231-240  source uses the record currently used by targetNode; reverts InvalidRecord if target has none
function linkToRecord(bytes sourceName, uint256 recordId);   // :243-251  recordId 0 = unlink (fall back to default); reverts InvalidRecord if > getRecordCount()
function getRecordId(bytes32 node) view returns (uint256);  function getRecordCount() view returns (uint256);
```
Both require root `ROLE_LINK = 1<<28` (`PermissionedResolverLib.sol:48`). Fork step 7: `setText(dns("kai.support.vendor.eth"), enf.canonical, "KAI-SPECIFIC")` → only that name changed; `linkToNode(dns("kai.support.shopa.eth"), namehash("kai.support.vendor.eth"))` → shopa doorway now returns `KAI-SPECIFIC`; `linkToRecord(dns("kai.support.shopa.eth"), 0)` → back to the default. Mia calling `linkToNode` → `EACUnauthorizedAccountRoles(0, 0x10000000, mia)`.

### 4.3 Resolver permissions (VERIFIED-SOURCE + VERIFIED-ONCHAIN)
- Permissions are **per record-key argument or root, not per name**: `setText(name,key,…)` checks `ROLE_SET_TEXT` on `resource(key) = keccak256(key)` or root (`PermissionedResolver.sol:220-228, 76-78`). A holder of `ROLE_SET_TEXT` for key K can write K on **every** name and on the default record (confirms idea.md loophole #3). `setContenthash`, `setName`, `linkTo*` are root-only.
- `grantRoles` is disabled; use `grantSetterRoles(bytes setterCalldata, account)` (`:254-261, 297-304`) or `grantRootRoles`.
- Roles (`PermissionedResolverLib.sol:11-60`): SET_ADDRESS `1<<0`, SET_TEXT `1<<4`, SET_CONTENTHASH `1<<8`, SET_ABI `1<<12`, SET_INTERFACE `1<<16`, SET_NAME `1<<20`, SET_DATA `1<<24`, LINK `1<<28`, CAN_NAME `1<<120`, UPGRADE `1<<124`; admins `<<128`.
- Fork: mia `setText(0x00, …)` → `EACUnauthorizedAccountRoles(keccak256("enf.canonical"), 16, mia)`.

## 5. Resolution path (UniversalResolver V2)

- `findResolver` walks labels from the root: at each registry, remember `getResolver(label)` if non-zero, then descend to `getSubregistry(label)` (`LibResolution.sol:58-85`). The deepest non-zero resolver wins; if it was found **above** the leaf, it is used only if it supports `IExtendedResolver` (ENSIP-10 wildcard) (`:22-47`). **VERIFIED-SOURCE**
- No resolver ⇒ UR reverts `ResolverNotFound(bytes name)` (selector `0x77209fe8`, `lib/ens-contracts/contracts/universalResolver/IUniversalResolver.sol:9`). Fork: `bob.support.shopa.eth`, `support.shopa.eth`, `shopa.eth` → `0x77209fe8`. **VERIFIED-ONCHAIN (fork)**
- **Stock viem** (2.56.9, `chain: sepolia`, no UR override) against the fork: `getEnsText`/`getEnsAddress` returned the default-bundle values for `mia.support.{shopa,vendor,scam}.eth` and **`null`** (no throw) for `bob.support.shopa.eth`. ⇒ a verifier cannot distinguish "not a member" from "member with empty record" via viem's text/addr alone; call the UR's `findResolver(bytes)` / `requireResolver(bytes)` (or catch `ResolverNotFound` from `resolve`) for the `black` verdict. **VERIFIED-ONCHAIN (fork)**
- Consequence for topology (fix #1 in idea.md): members resolve because the member entry itself has the resolver; parents (`support.<p>.eth`) keep resolver `0`. **Also keep the grandparent `<p>.eth` from having an extended (wildcard) resolver**, otherwise non-members like `bob.support.<p>.eth` would resolve through it. Merchants' own `<p>.eth` resolvers are outside our control — the verifier should check `findResolver` returns *the shared resolver at the leaf offset*, not just "some resolver".

## Deviations

All three idea.md §2 primitives exist in the pinned deployment. Differences from the plan's vocabulary / assumptions:

1. **No UserRegistry-specific factory.** The "UserRegistry factory" is the generic `VerifiableFactory` (`deployProxy(impl, salt, initData)`), also used for the resolver. `UserRegistryImpl` and `PermissionedResolverImpl` are implementation contracts, never called directly.
2. **Mounting under a `.eth` name needs the parent to own a registry.** `support.shopa.eth` is an entry in *shopa's own* UserRegistry (the subregistry of `shopa.eth` in ETHRegistry). Each parent therefore deploys its own UserRegistry (1 tx), registers `support` there (1 tx), and `setSubregistry(support, FLEET)` (1 tx). The "one tx to mount/unmount" claim holds for the `setSubregistry` step only.
3. **Canonicity requires `setParent` on every registry up the chain** (fleet → vendor registry → ETHRegistry). Only the fleet's and vendor registry's `setParent` are ours to call; ETHRegistry's is already set.
4. **Soulbound is two independent locks**: non-emancipated registry blocks `safeTransferFrom`; missing `ROLE_CAN_TRANSFER_ADMIN` blocks everything. Tests should exercise `unsafeTransfer` to prove the role lock, not only `safeTransferFrom`.
5. **viem returns `null` for non-members** instead of throwing; `black` detection needs a direct UR `findResolver`/`requireResolver` call.
6. Team note "packs role counts as 4-bit nybbles" — confirmed (`roleCount`). "changed getState's field order" — the current order is `(status, expiry, latestOwner, tokenId, resource)`; we did not diff against the pre-redeploy ABI. "removed convenience getters" — UNVERIFIED as a change; §2.2 lists what exists now.
7. `ensjs` v2 branches for `linkToNode`/`linkToRecord` were not inspected (UNVERIFIED); not needed — the deployed resolver source and fork run are authoritative.

## Appendix A — commands and outputs

### A.1 Discovery (live Sepolia, `R=https://ethereum-sepolia-rpc.publicnode.com`)
```
$ git clone https://github.com/ensdomains/contracts-v2 && git checkout sepolia-deployment-2026-09-15   # f2f0a05e
$ cast call 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe 'implementation()(address)' -r $R   → 0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1
$ cast call 0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1 'implementation()(address)' -r $R   → 0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3
$ cast call 0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3 'ROOT_REGISTRY()(address)' -r $R     → 0x9703DBD26dAB89504490994138cF2c575251a9cE
$ cast call 0xc105976531cd90285b91fbef70ca7d8d6597095d 'ROOT_REGISTRY()(address)' -r $R     → 0x0F62FBF8A820B4F2590A6631D846467dA7384A55   (candidate A, orphaned)
$ cast call 0x9703…a9ce 'getSubregistry(string)(address)' eth -r $R                        → 0x657eA849311d3D5823348ddEd7C2AaAFb3EDE09E
$ cast call 0x657e…e09e 'hasRootRoles(uint256,address)(bool)' 1 0xabe7…94ca -r $R          → true
$ cast call 0x657e…e09e 'isEmancipated()(bool)' -r $R                                       → true
$ cast call 0xabe7…94ca 'MIN_COMMITMENT_AGE()(uint64)' / MAX / MIN_REGISTER_DURATION / GRACE_PERIOD → 60 / 86400 / 2419200 / 2419200
$ cast call 0xabe7…94ca 'isAvailable(string)(bool)' vendor|shopa|shopb|scam                 → true ×4
```
Bytecode comparison (python, scratchpad `bytecmp.py`): for each artifact, fetch `cast code <address>`, zero every `immutableReferences` range in both, compare → `MATCH` for RootRegistry, ETHRegistry, ETHRegistrar, UserRegistryImpl, PermissionedResolverImpl, VerifiableFactory, UniversalResolverV2, PublicResolverV2, LabelStore.

### A.2 Fork experiment
`anvil --fork-url $R --chain-id 11155111 --port 8546`, six fresh keys from `cast wallet new` (funded with `anvil_setBalance`; never anvil defaults). Throwaway script (kept out of the repo) — core calls, in order:
```
# per parent P in {vendor, shopa, scam} (owner key K_P):
deployProxy(UserRegistryImpl, 1, initialize([(P_ADDR, ALL)]))             → P_REG
MockUSDC.mint(P_ADDR, 1e12); MockUSDC.approve(ETHRegistrar, 1e12)
ETHRegistrar.commit(makeCommitment(P, P_ADDR, secret, P_REG, 0, 31536000, 0)); evm_increaseTime 61
ETHRegistrar.register(P, P_ADDR, secret, P_REG, 0, 31536000, MockUSDC, 0)
# fleet + resolver
deployProxy(UserRegistryImpl, 777, initialize([(VENDOR, ALL)]))           → FLEET   (vendor)
deployProxy(PermissionedResolverImpl, 1, initialize([(OPERATOR, ALL)], [])) → RES   (operator)
# mounts
P_REG.register("support", P_ADDR, 0, 0, ALL, now+1y); P_REG.setSubregistry(labelhash("support"), FLEET)
FLEET.setParent(VENDOR_REG, "support"); VENDOR_REG.setParent(ETHRegistry, "vendor")
# default record
RES.setText(0x00, "enf.canonical", "support.vendor.eth"); RES.setText(0x00, "enf.parents", "support.vendor.eth,support.shopa.eth"); RES.setAddress(0x00, 60, 0x…beef)
# members
FLEET.register("mia", MIA, 0, RES, 0, now+1y); FLEET.register("kai", KAI, 0, RES, 0, now+1y)
# resolve
cast call 0xeEeE…EeEe 'resolve(bytes,bytes)(bytes,address)' <dns(name)> <text(namehash(name),key) calldata>
```
Output (abridged, fork of block 11784236):
```
  ETHRegistry.getSubregistry(vendor)=0xc2fF1FF5E95F68ca3607D9a392db5cc2F80dCd9D
  ETHRegistry.getState(labelhash vendor)=(2, 1821937575, 0x1E45…143b, 3872…7520, 3872…7520)
  ETHRegistry.roles(vendor token, vendor)=0x1110000000000000000000000000000001100000
  fleet 0xB0669e57f5C23f0D276B40f96C7FE2652B4B22d2    factory.verifyContract(fleet) impl=0xA80338aAA8D23831cEa25E858D1774534aBb0263
  shared resolver 0x788cbd1e7964C76f1a3dCa786c5e0DbB882ed716
  UniversalHelper.findCanonicalName(fleet) BEFORE vendorRegistry.setParent =0x
  UniversalHelper.findCanonicalName(fleet)=0x07737570706f72740676656e646f720365746800  (= dns(support.vendor.eth))
  findExactRegistry(support.vendor.eth)=FLEET findCanonicalRegistry(support.vendor.eth)=FLEET
  findExactRegistry(support.shopa.eth)=FLEET  findCanonicalRegistry(support.shopa.eth)=0x0
  findExactRegistry(support.scam.eth)=FLEET   findCanonicalRegistry(support.scam.eth)=0x0
  fleet.roleCount(0)=0x1111…1112 after grantRootRoles(1, operator); getAssigneeCount(0,0x1001)=(4098=0x1002, 61455=0xf00f)
  getRecordId(0x0)=1 recordCount=1
  fleet.getState(mia)=(2, 1821937752, 0x358d…c24b, 2576…3744, 2576…3744); roleCount(0)=0x1111…1111; roles(mia,mia)=0
  viem mia.support.shopa.eth: text="support.vendor.eth" addr=0x000000000000000000000000000000000000bEEF
  viem mia.support.vendor.eth: text="support.vendor.eth" addr=0x…bEEF
  viem mia.support.scam.eth: text="support.vendor.eth" addr=0x…bEEF
  viem bob.support.shopa.eth: text=null addr=null
  UR text(mia.support.{vendor,shopa,scam}.eth / kai.support.shopa.eth) = "support.vendor.eth" via resolver 0x788c…d716; addr = 0x…bEEF
  UR text(bob.support.shopa.eth | support.shopa.eth | shopa.eth) REVERT 0x77209fe8 ResolverNotFound
  linkToNode: kai.support.vendor.eth="KAI-SPECIFIC"; kai.support.shopa.eth default → linked "KAI-SPECIFIC" → linkToRecord(…,0) default
  mia linkToNode → EACUnauthorizedAccountRoles(0, 268435456, mia)
  mia safeTransferFrom → TransferUnsafeUntilRegistryIsEmancipated; mia unsafeTransfer → TransferDisallowed(tokenId, mia)
  kai (approved operator) safeTransferFrom → TransferUnsafeUntilRegistryIsEmancipated; unsafeTransfer → TransferDisallowed(tokenId, mia)
  mia setResolver(own name) → EACUnauthorizedAccountRoles(resource, 16777216, mia); mia RES.setText(0x00,…) → EACUnauthorizedAccountRoles(keccak(key), 16, mia)
  shopa setSubregistry(support, 0): mia.support.shopa.eth → ResolverNotFound; mia.support.vendor.eth still "support.vendor.eth"
  vendor unregister(mia): getState(mia)=(0, now, 0x0, …3745, …3746); mia.support.vendor.eth, mia.support.scam.eth → ResolverNotFound; kai.support.scam.eth still resolves
  warp +1y+1s: kai.support.vendor.eth → ResolverNotFound
```
Gas (fork): deployProxy ≈ 177.7k; ETHRegistrar.commit 45.4k, register ≈ 239k; parent `register("support")` 145.8k; `setSubregistry` 65.4k (43.2k to zero); `setParent` ≈ 80.7k; member `register` 125.3k; default-record `setText` ≈ 112k; `unregister` 72.7k.
