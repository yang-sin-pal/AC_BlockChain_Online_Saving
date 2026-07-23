// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ISavingCore
/// @notice Interface for the blockchain-based term deposit saving system.
/// @dev Each deposit is an ERC721 NFT. APR and penalty are snapshotted at deposit open time.
interface ISavingCore {
    enum Status {
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed
    }

    struct Plan {
        uint32 tenorDays;               // 4 bytes — packed in slot 1
        uint16 aprBps;                  // 2 bytes — packed in slot 1
        uint16 earlyWithdrawPenaltyBps;  // 2 bytes — packed in slot 1
        bool enabled;                    // 1 byte  — packed in slot 1
        uint256 minDeposit;              // Slot 2
        uint256 maxDeposit;              // Slot 3
    }

    struct Deposit {
        uint256 planId;            // Slot 1
        uint256 principal;         // Slot 2
        uint64 startAt;            // 8 bytes  ┐
        uint64 maturityAt;         // 8 bytes  │ Slot 3 (21 bytes)
        uint16 aprBpsAtOpen;       // 2 bytes  │
        uint16 penaltyBpsAtOpen;   // 2 bytes  │
        Status status;             // 1 byte   ┘
    }

    // ---------- Admin functions ----------

    /// @notice Creates a new saving plan.
    /// @param tenorDays Term length of the plan in days.
    /// @param aprBps Annual interest rate in basis points (100 = 1%).
    /// @param minDeposit Minimum deposit amount. 0 = no limit.
    /// @param maxDeposit Maximum deposit amount. 0 = no limit.
    /// @param earlyWithdrawPenaltyBps Early withdrawal penalty in basis points.
    /// @return planId ID of the newly created plan.
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external returns (uint256 planId);

    /// @notice Updates the APR of a plan. Does not affect previously opened deposits.
    /// @param planId ID of the plan to update.
    /// @param newAprBps New APR in basis points.
    function updatePlan(uint256 planId, uint256 newAprBps) external;

    /// @notice Enables a plan to allow new deposits.
    /// @param planId ID of the plan to enable.
    function enablePlan(uint256 planId) external;

    /// @notice Disables a plan to block new deposits. Does not affect existing deposits.
    /// @param planId ID of the plan to disable.
    function disablePlan(uint256 planId) external;

    // ---------- User functions ----------

    /// @notice Opens a new deposit. User must approve() tokens to the contract before calling.
    /// @param planId ID of the plan to deposit into.
    /// @param amount Deposit amount (must be within minDeposit..maxDeposit).
    /// @return depositId ID of the newly created deposit.
    function openDeposit(uint256 planId, uint256 amount) external returns (uint256 depositId);

    /// @notice Withdraws principal + interest at or after maturity.
    /// @param depositId ID of the deposit to withdraw.
    function withdrawAtMaturity(uint256 depositId) external;

    /// @notice Early withdrawal — no interest, penalty deducted from principal.
    /// @param depositId ID of the deposit to withdraw early.
    function earlyWithdraw(uint256 depositId) external;

    /// @notice Manual renewal to a new plan after maturity.
    /// @param depositId ID of the old deposit.
    /// @param newPlanId ID of the new plan to switch to.
    /// @return newDepositId ID of the newly created deposit.
    function renewDeposit(uint256 depositId, uint256 newPlanId) external returns (uint256 newDepositId);

    /// @notice Bot (or anyone) calls this to auto-renew after the grace period, preserving the original APR.
    /// @param depositId ID of the deposit to auto-renew.
    /// @return newDepositId ID of the newly created deposit.
    function autoRenewDeposit(uint256 depositId) external returns (uint256 newDepositId);

}
