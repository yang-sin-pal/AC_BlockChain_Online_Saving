// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IVaultManager
/// @notice Interface cho kho tiền lãi của ngân hàng (tách biệt hoàn toàn với tiền gốc của user).
interface IVaultManager {
    /// @notice Admin nạp thêm tiền vào vault để trả lãi cho user.
    /// @param amount Số USDC muốn nạp vào vault.
    function fundVault(uint256 amount) external;

    /// @notice Admin rút bớt tiền khỏi vault (trong giới hạn an toàn — xem Bonus C2).
    /// @param amount Số USDC muốn rút khỏi vault.
    function withdrawVault(uint256 amount) external;

    /// @notice Đặt địa chỉ nhận phí phạt khi user rút trước hạn.
    /// @param receiver Địa chỉ mới nhận phí phạt.
    function setFeeReceiver(address receiver) external;

    /// @notice Tạm dừng khẩn cấp — chặn mọi withdraw/renew.
    function pause() external;

    /// @notice Bật lại hoạt động sau khi pause.
    function unpause() external;

    /// @notice Trả về số dư hiện tại của vault.
    /// @return Số USDC đang giữ trong vault.
    function vaultBalance() external view returns (uint256);

    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event FeeReceiverUpdated(address indexed newReceiver);
}
