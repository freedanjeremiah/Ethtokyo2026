// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice `UserRegistry.initialize` (deployments/abis/UserRegistryImpl.json): grants on ROOT_RESOURCE.
interface IUserRegistry {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    function initialize(Grant[] calldata grants) external;
}
