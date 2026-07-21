// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Token ERC20 giả lập USDC (6 decimals) — CHỈ dùng để test, không phải USDC thật.
/// @dev Thật USDC không tự mint được, nên contract này cho phép ai cũng mint để test dễ dàng.
///      6 decimals (thay vì 18 mặc định) để bắt lỗi giả định sai decimals sớm.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    /// @notice Trả về số decimals là 6, giống USDC thật (khác 18 decimals mặc định của ERC20).
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint token cho mục đích test — bất kỳ ai cũng gọi được.
    /// @dev Đây là điểm khác biệt CHÍNH so với USDC thật — không dùng contract này ngoài môi trường test.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
