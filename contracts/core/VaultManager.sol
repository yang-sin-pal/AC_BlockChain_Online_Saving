// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IVaultManager.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

/// @title VaultManager
/// @notice Holds the bank's interest pool, completely separate from user principal.
/// @dev Admin funds vault; SavingCore calls payInterest to distribute interest to users.
contract VaultManager is IVaultManager, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public savingCore;
    address public feeReceiver;

    modifier onlySavingCore() {
        if (msg.sender != savingCore) revert VaultManager_OnlySavingCore();
        _;
    }

    /// @notice Deploys VaultManager with the USDC token address.
    /// @param _usdc The USDC ERC20 token address.
    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /// @notice Sets the SavingCore address. Can only be called once.
    /// @param _savingCore The address of the SavingCore contract.
    function setSavingCore(address _savingCore) external onlyOwner {
        if (savingCore != address(0)) revert VaultManager_SavingCoreAlreadySet();
        savingCore = _savingCore;
    }

    /// @notice Admin funds the vault to pay interest to users.
    /// @param amount Amount of USDC to deposit into the vault.
    function fundVault(uint256 amount) external onlyOwner {
        if (amount == 0) revert VaultManager_ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Events.VaultFunded(msg.sender, amount);
    }

    /// @notice Admin withdraws excess funds from the vault.
    /// @param amount Amount of USDC to withdraw from the vault.
    function withdrawVault(uint256 amount) external nonReentrant onlyOwner whenNotPaused {
        if (amount > usdc.balanceOf(address(this))) revert VaultManager_InsufficientBalance();
        usdc.safeTransfer(msg.sender, amount);
        emit Events.VaultWithdrawn(msg.sender, amount);
    }

    /// @notice Sets the address that receives early-withdrawal penalties.
    /// @param receiver New address to receive penalties.
    function setFeeReceiver(address receiver) external onlyOwner {
        feeReceiver = receiver;
        emit Events.FeeReceiverUpdated(receiver);
    }

    /// @notice Emergency pause — blocks all withdrawals.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes operations after a pause.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice SavingCore calls this to request interest payout from the vault.
    /// @param to Address to receive tokens.
    /// @param amount Amount of USDC to transfer.
    function payInterest(address to, uint256 amount) external nonReentrant onlySavingCore {
        usdc.safeTransfer(to, amount);
        emit Events.InterestPaid(to, amount);
    }

    /// @notice Returns the current vault balance.
    /// @return Amount of USDC held in the vault.
    function vaultBalance() external view override returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
