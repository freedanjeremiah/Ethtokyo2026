// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal slice of ENSv2 `PermissionedResolver`, derived from
///         deployments/abis/PermissionedResolverImpl.json (ensdomains contracts-v2, tag sepolia-deployment-2026-09-15).
///         Setters take a DNS-encoded name; `0x00` is the default record (notes §4.1).
interface IPermissionedResolver {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account);

    function initialize(Grant[] calldata grants, bytes[] calldata calls) external;
    function setText(bytes calldata name, string calldata key, string calldata value) external;
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata value) external;
    function multicall(bytes[] calldata calls) external returns (bytes[] memory);
    function grantSetterRoles(bytes calldata setter, address account) external returns (bool);
    function getRecordId(bytes32 node) external view returns (uint256);
    function getRecordCount() external view returns (uint256);
    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}
