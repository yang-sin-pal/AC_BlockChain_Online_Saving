// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

error VaultManager_OnlySavingCore();
error VaultManager_InsufficientBalance();
error VaultManager_ZeroAmount();
error VaultManager_SavingCoreAlreadySet();

error SavingCore_PlanNotFound();
error SavingCore_PlanNotEnabled();
error SavingCore_DepositBelowMin();
error SavingCore_DepositAboveMax();
error SavingCore_ZeroAmount();
error SavingCore_NotYetMature();
error SavingCore_AlreadyWithdrawn();
error SavingCore_FeeReceiverNotSet();
error SavingCore_InvalidTenor();
error SavingCore_InvalidApr();
error SavingCore_InvalidDepositRange();
error SavingCore_NotOwner();
