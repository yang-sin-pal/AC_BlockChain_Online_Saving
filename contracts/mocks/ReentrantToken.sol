// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ReentrantToken
/// @notice ERC20 with a transfer hook that triggers a callback on the receiver side.
/// @dev Used exclusively for reentrancy attack tests. The hook calls into a
///      ReentrantAttacker contract, which attempts to re-enter SavingCore/VaultManager.
///      NOT for production use.
interface IReentrantAttacker {
    function onTokenReceived() external;
}

contract ReentrantToken is ERC20 {
    bool public hookEnabled;
    address public hookTarget;

    constructor() ERC20("Reentrant Token", "RT") {}

    /// @notice Enables or disables the post-transfer callback hook.
    /// @param _enabled Whether the hook should fire on the next transfer.
    /// @param _target Address to call via `onTokenReceived()` after each transfer.
    function setHook(bool _enabled, address _target) external {
        hookEnabled = _enabled;
        hookTarget = _target;
    }

    /// @notice Mints tokens — anyone can mint (for testing only).
    /// @param to The address that receives the minted tokens.
    /// @param amount The number of tokens to mint (in 6-decimal units).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Overrides transfer() to fire the callback hook after the transfer completes.
    ///      OZ v5's _transfer is not virtual, so we override the public functions instead.
    function transfer(address to, uint256 value) public virtual override returns (bool) {
        bool result = super.transfer(to, value);
        _fireHook();
        return result;
    }

    /// @dev Overrides transferFrom() to fire the callback hook after the transfer completes.
    function transferFrom(address from, address to, uint256 value) public virtual override returns (bool) {
        bool result = super.transferFrom(from, to, value);
        _fireHook();
        return result;
    }

    /// @dev Fires the reentrancy hook once, then disables it to prevent infinite recursion.
    function _fireHook() private {
        if (hookEnabled && hookTarget != address(0)) {
            hookEnabled = false;
            IReentrantAttacker(hookTarget).onTokenReceived();
        }
    }

    /// @notice Returns 6 decimals, matching MockUSDC convention.
    /// @return The number of decimals, always 6.
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
