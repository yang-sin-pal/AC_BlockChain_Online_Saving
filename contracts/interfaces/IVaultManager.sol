// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVaultManager
/// @notice Interface for the bank's interest vault (completely separate from user principal).
interface IVaultManager {
    /// @notice Admin funds the vault to pay interest to users.
    /// @dev Only callable by the contract owner.
    /// @param amount Amount of USDC to deposit into the vault.
    function fundVault(uint256 amount) external;

    /// @notice Admin withdraws excess funds from the vault (within safe limits — see Bonus C2).
    /// @dev Only callable by the contract owner.
    /// @param amount Amount of USDC to withdraw from the vault.
    function withdrawVault(uint256 amount) external;

    /// @notice Sets the address that receives early-withdrawal penalties.
    /// @dev Only callable by the contract owner.
    /// @param receiver New address to receive penalties.
    function setFeeReceiver(address receiver) external;

    /// @notice Sets the SavingCore address. Can only be called once.
    /// @dev Only callable by the contract owner.
    /// @param _savingCore The address of the SavingCore contract.
    function setSavingCore(address _savingCore) external;

    /// @notice Emergency pause — blocks all withdrawals and renewals.
    /// @dev Only callable by the contract owner.
    function pause() external;

    /// @notice Resumes operations after a pause.
    /// @dev Only callable by the contract owner.
    function unpause() external;

    /// @notice SavingCore calls this to request interest payout from the vault.
    /// @dev Only callable by the SavingCore contract.
    /// @param to Address to receive tokens (user on withdraw, SavingCore on renew).
    /// @param amount Amount of USDC to transfer.
    function payInterest(address to, uint256 amount) external;

    /// @notice Returns the current vault balance.
    /// @return Amount of USDC held in the vault.
    function vaultBalance() external view returns (uint256);

    /// @notice Returns the feeReceiver address (for early withdrawal penalty routing).
    /// @return The address currently set to receive penalties.
    function feeReceiver() external view returns (address);

}
