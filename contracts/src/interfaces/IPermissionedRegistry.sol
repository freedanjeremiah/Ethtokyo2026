// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal slice of ENSv2 `PermissionedRegistry` (ETHRegistry and every UserRegistry proxy),
///         derived from deployments/abis/UserRegistryImpl.json + ETHRegistry.json
///         (ensdomains contracts-v2, tag sepolia-deployment-2026-09-15). Only what MOUNT's tests call.
interface IPermissionedRegistry {
    enum Status {
        AVAILABLE,
        RESERVED,
        REGISTERED
    }

    /// @dev Field order as deployed (docs/ensv2-notes.md §2.2).
    struct State {
        Status status;
        uint64 expiry;
        address latestOwner;
        uint256 tokenId;
        uint256 resource;
    }

    // errors (selectors used with vm.expectRevert)
    error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account);
    error TransferDisallowed(uint256 tokenId, address from);
    error TransferUnsafeUntilRegistryIsEmancipated();
    error LabelExpired(uint256 tokenId);

    // writes
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);
    function unregister(uint256 anyId) external;
    function setSubregistry(uint256 anyId, address registry) external;
    function setResolver(uint256 anyId, address resolver) external;
    function setParent(address parent, string calldata label) external;
    function setApprovalForAll(address operator, bool approved) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
    function unsafeTransfer(address to, uint256 tokenId, bytes calldata data) external;

    // reads
    function getState(uint256 anyId) external view returns (State memory);
    function getTokenId(uint256 anyId) external view returns (uint256);
    function getExpiry(uint256 anyId) external view returns (uint64);
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
    function getParent() external view returns (address parent, string memory label);
    function findOwner(string calldata label) external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function roles(uint256 resource, address account) external view returns (uint256);
    function isEmancipated() external view returns (bool);
}
