# code-convention.md — Solidity Style Guide

> Áp dụng cho `MockUSDC.sol`, `SavingCore.sol`, `VaultManager.sol` và mọi contract trong `contracts/`.

## 1. Solidity version & tooling

- Solidity `0.8.28`, dùng `hardhat-toolbox` (TypeScript), không dùng `unchecked` trừ khi có comment giải thích rõ lý do + đã chứng minh không overflow.
- Compile phải sạch, không warning.

## 2. Errors

- Luôn dùng **custom errors**, không dùng `require(cond, "string")`.
- Định nghĩa tập trung trong `Errors.sol`, không khai báo rải rác trong từng contract.
- Đặt tên theo dạng `ContractName_Reason`, ví dụ:
```solidity
  error SavingCore_PlanNotEnabled();
  error SavingCore_AmountBelowMin();
  error VaultManager_InsufficientForObligations();
```
- Nếu cần truyền dữ liệu debug, đưa tham số vào error: `error SavingCore_AmountTooLow(uint256 sent, uint256 min);`

## 3. Events

- Emit event cho **mọi thao tác thay đổi state quan trọng** (mở/đóng deposit, admin action, vault fund/withdraw) — kể cả không bắt buộc trong đề, tính vào "code quality".
- Định nghĩa trong `Events.sol` (library hoặc interface), không rải trong contract logic.
- Đặt tên ở dạng quá khứ: `DepositOpened`, `VaultFunded`, `PlanDisabled` — không dùng thì hiện tại (`OpenDeposit`).
- Index các tham số dùng để filter/tra cứu (địa chỉ user, depositId, planId).

## 4. NatSpec

- Bắt buộc đầy đủ `@notice`, `@param`, `@return` cho **mọi hàm public/external**, kể cả getter đơn giản.
- Interface (`ISavingCore.sol`, `IVaultManager.sol`) viết NatSpec trước, code thân chỉ cần `@inheritdoc`.
- Comment giải thích **lý do**, không lặp lại tên biến. Ví dụ đúng:
```solidity
  /// @notice Nhân trước chia sau để tránh rounding về 0 với số tiền nhỏ
```
  Ví dụ sai: `// tính lãi` (không giải thích gì thêm).

## 5. Function ordering & visibility

Trong 1 contract, theo thứ tự: constructor → external → public → internal → private. Trong mỗi nhóm: state-changing trước, view/pure sau.

- Luôn khai báo visibility tường minh, không để mặc định.
- Ưu tiên `external` thay vì `public` nếu hàm không bị gọi nội bộ.

## 6. State variables

- `immutable`/`constant` cho giá trị không đổi sau deploy (địa chỉ USDC, seconds-per-year...).
- Struct field đặt tên rõ nghĩa, tránh viết tắt tối nghĩa (`aprBpsAtOpen` chứ không `aBps`).
- Mapping đặt tên dạng `keyToValue`: `pendingInterest[depositId]`, không `interestMap`.

## 7. Modifier & guard pattern

- `nonReentrant` đặt **ngoài cùng** trong danh sách modifier (chạy trước `onlyOwner`, custom check).
- Checks-Effects-Interactions bắt buộc: cập nhật state (set status = Withdrawn) **trước** khi gọi `transfer`/`transferFrom` ra ngoài.
- Dùng `SafeERC20` (`safeTransfer`, `safeTransferFrom`) cho mọi thao tác token, không gọi `transfer` trực tiếp trên `IERC20`.

## 8. Boundary & rounding (bám theo Design Questions)

- Boundary tại `maturityAt`: dùng `>=` nhất quán toàn bộ codebase (Design Q5) — không trộn `>` ở chỗ khác.
- Công thức lãi: luôn **nhân trước, chia sau** (Design Q4), viết rõ comment tại từng chỗ tính.
- APR/penalty snapshot tại thời điểm mở deposit (`aprBpsAtOpen`, `penaltyBpsAtOpen`) — không bao giờ đọc lại giá trị hiện tại của Plan sau khi deposit đã mở.

## 9. Formula tập trung

- Mọi công thức lãi/penalty đặt trong `InterestLib.sol`, không lặp lại logic tính toán trong `SavingCore.sol`.
- Hàm trong `InterestLib` phải `pure`, không đọc storage.

## 10. Naming chung

- Contract, struct, enum: `PascalCase`.
- Function, variable, mapping: `camelCase`.
- Event: `PascalCase`, custom error: `PascalCase` có prefix contract.
- Test file khớp tên contract: `SavingCore.sol` → `SavingCore.test.ts`.

## 11. Không làm gì (explicit exclusions)

- Không tối ưu gas sớm nếu làm giảm độ rõ ràng của logic — ưu tiên: đơn giản → đúng business rule → dễ test → sau đó mới tối ưu gas.
- Không dùng `AccessControl` (chỉ 1 role Owner) — giữ `Ownable2Step`.
- Không deploy testnet thật, không cần verify Etherscan.