// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title InterestLib
/// @notice Pure math for interest and penalty calculations — no storage reads.
/// @dev Multiply before divide to avoid rounding to zero with small amounts (Design Q4).
library InterestLib {
    /// @notice Calculates simple interest for a term deposit.
    /// @dev Formula: (principal * aprBps * tenorDays) / (365 * 10_000)
    ///      Integer truncation is expected — dust stays in vault (Design Q4).
    /// @param principal Deposit amount in USDC units.
    /// @param aprBps Annual percentage rate in basis points (snapshot at open).
    /// @param tenorDays Term length in days (from the deposit's plan).
    /// @return Interest in USDC units (truncated toward zero).
    function calculateInterest(
        uint256 principal,
        uint16 aprBps,
        uint32 tenorDays
    ) internal pure returns (uint256) {
        return (principal * aprBps * tenorDays) / (365 * 10_000);
    }
}
