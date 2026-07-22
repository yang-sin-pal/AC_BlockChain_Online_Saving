// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
        uint256 tenorDays;              // Term length in days
        uint256 aprBps;                 // Annual interest rate in basis points (100 = 1%)
        uint256 minDeposit;             // Minimum deposit amount, 0 = no limit
        uint256 maxDeposit;             // Maximum deposit amount, 0 = no limit
        uint256 earlyWithdrawPenaltyBps; // Early withdrawal penalty in basis points
        bool enabled;                   // Admin can disable plan to block new deposits
    }

    struct Deposit {
        uint256 planId;
        uint256 principal;
        uint256 aprBpsAtOpen;           // APR snapshot at deposit open time
        uint256 penaltyBpsAtOpen;       // Penalty snapshot at deposit open time
        uint256 startAt;
        uint256 maturityAt;
        Status status;
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

    // ---------- Events ----------

    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
    event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 maturityAt,
        uint256 aprBpsAtOpen
    );
    event Withdrawn(uint256 indexed depositId, address indexed owner, uint256 principal, uint256 interest, bool isEarly);
    event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal, uint256 newPlanId);
}
