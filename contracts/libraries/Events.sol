// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Events
/// @notice Centralized event definitions for all contracts.
/// @dev Emit via `emit Events.EventName(...)` from any contract that imports this library.
library Events {
    // --- SavingCore ---
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
    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool isEarly
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal,
        uint256 newPlanId
    );
    event PlanEnabled(uint256 indexed planId);
    event PlanDisabled(uint256 indexed planId);

    // --- VaultManager ---
    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event FeeReceiverUpdated(address indexed newReceiver);
    event InterestPaid(address indexed to, uint256 amount);
}
