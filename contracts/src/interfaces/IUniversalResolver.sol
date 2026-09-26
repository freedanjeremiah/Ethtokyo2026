// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice deployments/abis/UniversalResolverV2.json — called at the UpgradableUniversalResolverProxy
///         (viem's default Sepolia UR), exactly like a client would.
interface IUniversalResolver {
    struct ResolverInfo {
        bytes name;
        uint256 offset;
        bytes32 node;
        address resolver;
        bool extended;
    }

    error ResolverNotFound(bytes name);

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
    function findResolver(bytes calldata name) external view returns (address resolver, bytes32 node, uint256 offset);
    function requireResolver(bytes calldata name) external view returns (ResolverInfo memory info);
}

/// @notice deployments/abis/UniversalHelper.json — canonical-name helpers (verifier check C2).
interface IUniversalHelper {
    function findCanonicalName(address registry) external view returns (bytes memory);
    function findCanonicalRegistry(bytes calldata name) external view returns (address);
    function findExactRegistry(bytes calldata name) external view returns (address);
    function findExactOwner(bytes calldata name) external view returns (address);
}

/// @notice ENSIP-1/9/5 profile selectors used to build `resolve(name, data)` calldata.
interface IRecordProfiles {
    function addr(bytes32 node) external view returns (address);
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory);
    function text(bytes32 node, string calldata key) external view returns (string memory);
}
