// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../interfaces/ISavingCore.sol";
import "../interfaces/IVaultManager.sol";

/// @title ReentrantAttacker
/// @notice Malicious contract that attempts reentrancy attacks on SavingCore and VaultManager.
/// @dev Used exclusively for testing the `nonReentrant` modifier. The attacker:
///      1. Opens deposits (to own NFTs) and sets up an attack target
///      2. Calls the target function (e.g., withdrawAtMaturity)
///      3. During the USDC transfer callback (via ReentrantToken), tries to re-enter
///      4. The nonReentrant modifier blocks the re-entrant call → transaction reverts
///      NOT for production use.
contract ReentrantAttacker is IERC721Receiver {
    using SafeERC20 for IERC20;

    ISavingCore public immutable savingCore;
    IVaultManager public immutable vaultManager;
    IERC20 public immutable token;

    enum Target {
        WithdrawAtMaturity,
        EarlyWithdraw,
        RenewDeposit,
        AutoRenewDeposit,
        WithdrawVault
    }

    Target public currentTarget;
    uint256 public attackDepositId;
    uint256 public attackNewPlanId;

    constructor(address _savingCore, address _vaultManager, address _token) {
        savingCore = ISavingCore(_savingCore);
        vaultManager = IVaultManager(_vaultManager);
        token = IERC20(_token);
    }

    /// @dev Required by IERC721Receiver — allows this contract to receive NFTs via `_safeMint`.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /// @notice Configures which function to re-enter during the callback.
    /// @param _target The function to attack.
    /// @param _depositId Deposit ID to use in the attack.
    /// @param _newPlanId Plan ID for renewDeposit (unused for other targets).
    function setAttack(Target _target, uint256 _depositId, uint256 _newPlanId) external {
        currentTarget = _target;
        attackDepositId = _depositId;
        attackNewPlanId = _newPlanId;
    }

    /// @notice Opens a deposit — mints NFT to this contract so it can call withdraw/renew.
    /// @param planId ID of the plan to deposit into.
    /// @param amount Deposit amount.
    function openDeposit(uint256 planId, uint256 amount) external {
        token.approve(address(savingCore), amount);
        savingCore.openDeposit(planId, amount);
    }

    /// @notice Accepts VaultManager ownership (step 2 of Ownable2Step).
    function acceptVaultOwnership() external {
        Ownable2Step(address(vaultManager)).acceptOwnership();
    }

    // ---------- Attack entry points (called by test) ----------

    /// @notice Initiates withdrawAtMaturity — the callback will try to re-enter.
    function attackWithdrawAtMaturity() external {
        savingCore.withdrawAtMaturity(attackDepositId);
    }

    /// @notice Initiates earlyWithdraw — the callback will try to re-enter.
    function attackEarlyWithdraw() external {
        savingCore.earlyWithdraw(attackDepositId);
    }

    /// @notice Initiates renewDeposit — the callback will try to re-enter.
    function attackRenewDeposit() external {
        savingCore.renewDeposit(attackDepositId, attackNewPlanId);
    }

    /// @notice Initiates autoRenewDeposit — the callback will try to re-enter.
    function attackAutoRenewDeposit() external {
        savingCore.autoRenewDeposit(attackDepositId);
    }

    /// @notice Initiates withdrawVault — the callback will try to re-enter.
    function attackWithdrawVault() external {
        vaultManager.withdrawVault(token.balanceOf(address(vaultManager)));
    }

    // ---------- Callback (triggered by ReentrantToken hook) ----------

    /// @notice Called by ReentrantToken after each transfer. Attempts to re-enter the target.
    function onTokenReceived() external {
        if (currentTarget == Target.WithdrawAtMaturity) {
            savingCore.withdrawAtMaturity(attackDepositId);
        } else if (currentTarget == Target.EarlyWithdraw) {
            savingCore.earlyWithdraw(attackDepositId);
        } else if (currentTarget == Target.RenewDeposit) {
            savingCore.renewDeposit(attackDepositId, attackNewPlanId);
        } else if (currentTarget == Target.AutoRenewDeposit) {
            savingCore.autoRenewDeposit(attackDepositId);
        } else if (currentTarget == Target.WithdrawVault) {
            vaultManager.withdrawVault(token.balanceOf(address(vaultManager)));
        }
    }
}
