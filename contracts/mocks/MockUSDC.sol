// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice ERC20 token simulating USDC (6 decimals) — for testing only, not a real USDC contract.
/// @dev Real USDC cannot be minted by anyone, so this contract allows open minting for easy testing.
///      6 decimals (instead of the default 18) to catch decimal assumption bugs early.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    /// @notice Mints tokens for testing purposes — callable by anyone.
    /// @dev This is the main difference from real USDC — do not use this contract outside of test environments.
    /// @param to The address that receives the minted tokens.
    /// @param amount The number of tokens to mint (in 6-decimal units).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Returns 6 decimals, matching real USDC (differs from the default 18 of ERC20).
    /// @return The number of decimals, always 6.
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
