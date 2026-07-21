// Errors.sol
// Thay vì require(x, "Deposit too small");
// sẽ dùng error DepositTooSmall();
//====> GAS RẺ HƠN.

// Giải thích:
// Vì string rất tốn bộ nhớ, còn custom error chỉ mã hóa một selector 4 byte.
// Custom error không có tham số → chỉ cần 4-byte selector.
// Custom error có tham số → trả về 4-byte selector + ABI-encoded parameters.
// Dù có tham số, thường vẫn rẻ hơn require(..., "string") vì không phải nhúng và trả về chuỗi ký tự.

// Ví dụ:
// Cách cũ:
// require(amount >= min, "Deposit too small");
// Khi revert, EVM phải trả về cả chuỗi "Deposit too small".
// Cách mới:
// error DepositTooSmall();
// if (amount < min) revert DepositTooSmall();
// Chỉ trả về error selector, không cần lưu chuỗi dài.
// Mental model
// require("Deposit too small")
//         ↓
// Lưu & trả về cả chuỗi
//         ↓
// Tốn gas hơn

// revert DepositTooSmall()
//         ↓
// Chỉ trả về mã lỗi
//         ↓
// Ít dữ liệu hơn → tiết kiệm gas

// 👉 Từ Solidity 0.8.4+, custom errors được khuyến khích dùng thay cho require(..., "message") trong các contract production.
// Nguồn thông tin: https://docs.soliditylang.org/en/latest/contracts.html?utm_source=chatgpt.com#custom-errors