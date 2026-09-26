// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice deployments/abis/MockUSDC.json — ETHRegistrar's payment token on Sepolia (permissionless mint).
interface IMockUSDC {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}
