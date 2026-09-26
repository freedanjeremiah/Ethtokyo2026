// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice deployments/abis/VerifiableFactory.json — the factory for UserRegistry and PermissionedResolver proxies.
interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address proxy);
    function verifyContract(address proxy) external view returns (address implementation);
}
