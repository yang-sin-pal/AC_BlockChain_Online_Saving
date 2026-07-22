# PLAN.md — Đồ án Blockchain: Online Banking System (Term Deposit)

> Deadline demo: **Thứ 4, 29/7/2026**. Ưu tiên: chắc phần chính (90 core + 10 frontend) trước, bonus C1+C2 chỉ làm khi phần chính đã ổn. Tổng điểm cap ở 100.

## Tiến độ thực tế (cập nhật: 22/7/2026)

| Ngày | Trạng thái | Ghi chú |
|------|-----------|---------|
| Ngày 1 | **100% xong** | All 6 tasks done. Fixes: @openzeppelin install, import paths, OZ v5 ReentrancyGuard path, evmVersion cancun, BOM stripped, NatSpec completed. Compile + test pass. |
| Ngày 2 | Chưa bắt đầu | VaultManager.sol trống, openDeposit là stub, tests trống |
| Ngày 3 | Chưa bắt đầu | Interest/withdraw/renew đều là stub |
| Ngày 4 | Chưa bắt đầu | — |
| Ngày 5–10 | Chưa bắt đầu | — |

**Lịch:** Hôm nay là 22/7 (Ngày 3 theo plan). Đang bị trễ ~2 ngày. Blocker Day 1 đã resolve — project compile được.

## Cách dùng file này (dành cho agent)

- Mỗi khi bắt đầu session, đọc file này để biết đang ở ngày nào, task nào đã ☑, task nào chưa.
- Sau khi hoàn thành 1 task, tự động tick `[x]` vào đúng dòng, không tự ý sửa nội dung task khác.
- Nếu 1 ngày chưa xong hết task mà đã hết giờ, KHÔNG tự dồn task sang ngày sau — để nguyên `[ ]`, người dùng sẽ tự quyết định dồn việc.

---

## Ngày 1 — Thứ 2, 20/7 — Setup + MockUSDC + khung SavingCore

- [x] Tính personal variant theo Student ID (mục 8.1), ghi vào đầu README
- [x] `npx hardhat init`, cài `@openzeppelin/contracts`, `solhint`, `hardhat-gas-reporter`, `solidity-coverage`
- [x] Viết `ISavingCore.sol`, `IVaultManager.sol` với NatSpec đầy đủ trước khi code thân
- [x] `MockUSDC.sol`: ERC20 6 decimals, `mint()` public
- [x] Khung `SavingCore.sol`: struct Plan + Deposit, enum Status, kế thừa ERC721 + Ownable2Step + ReentrancyGuard
- [x] Khung README.md với mục lục đầy đủ, điền personal variant

## Ngày 2 — Thứ 3, 21/7 — VaultManager + openDeposit + Bonus C2

- [ ] `VaultManager.sol`: fundVault, withdrawVault, setFeeReceiver, pause/unpause
- [ ] Bonus C2: `totalInterestOwed`, `withdrawVault()` revert nếu rút dưới mức đã hứa trả lãi
- [ ] `BONUS_NOTES.md`: vấn đề / giải pháp / trade-off cho C2
- [ ] `openDeposit(planId, amount)`: check enabled, min/max, transferFrom, mint NFT, snapshot APR/penalty
- [ ] Viết test ngay trong ngày cho VaultManager + openDeposit

## Ngày 3 — Thứ 4, 22/7 — withdrawAtMaturity + earlyWithdraw + Bonus C1

- [ ] Công thức lãi đơn: nhân trước chia sau, comment rõ lý do (Design Q4)
- [ ] Dùng `>=` nhất quán cho boundary tại `maturityAt`, comment lý do (Design Q5)
- [ ] Bonus C1: vault không đủ trả lãi → KHÔNG revert toàn bộ, trả principal ngay, ghi nợ vào `pendingInterest[depositId]`
- [ ] Test rounding dust với số tiền lẻ

## Ngày 4 — Thứ 5, 23/7 — renewDeposit + autoRenewDeposit

- [ ] `renewDeposit(depositId, newPlanId)`: chỉ cho gọi khi `now >= maturityAt`, cộng lãi cũ + pendingInterest vào principal mới, mint NFT mới
- [ ] `autoRenewDeposit(depositId)`: grace period cá nhân hoá, dùng `>=`, APR khoá theo `aprBpsAtOpen` gốc
- [ ] Viết kịch bản "bot chết" vào README (Design Q3)
- [ ] Test 2 luồng renew + case revert khi renew trước hạn

## Ngày 5 — Thứ 6, 24/7 — Attack thinking + bắt đầu coverage

- [ ] Design Q7: chọn 1 kịch bản tấn công cụ thể (reentrancy hoặc double-withdraw), trỏ đúng dòng code phòng thủ
- [ ] Test giả lập contract độc hại cố reentrancy, chứng minh revert
- [ ] Design Q1 (NFT transferable) + Q6 (plan bị disable)
- [ ] Chạy `npx hardhat coverage` lần đầu

## Ngày 6 — Thứ 7, 25/7 — Ngày đệm

- [ ] Hoàn thành phần đang trễ so với kế hoạch (nếu có)
- [ ] Nếu đúng tiến độ: rà lại toàn bộ test, clean install chạy lại từ đầu

## Ngày 7 — Chủ nhật, 26/7 — Design Answers + Coverage > 90%

- [ ] Ghép đủ 7 câu Design Answers vào README, mỗi câu trỏ file + số dòng code
- [ ] Rà tay từng nhánh if/require chưa có test, đặc biệt đường revert

## Ngày 8 — Thứ 2, 27/7 — Frontend đầy đủ 4 luồng

- [ ] Kết nối MetaMask, đọc balance MockUSDC
- [ ] Danh sách plan + form mở deposit (validate min/max UI), approve() tách riêng openDeposit()
- [ ] Danh sách deposit của user: trạng thái, đếm ngược maturityAt, disable nút withdraw nếu chưa tới hạn
- [ ] Withdraw / Renew + thông báo kết quả (đọc từ event Withdrawn)

## Ngày 9 — Thứ 3, 28/7 — README + video + rà soát

- [ ] README hoàn chỉnh: Overview, Personal Variant, hướng dẫn chạy test/deploy, Design Answers đủ 7 câu, BONUS_NOTES
- [ ] Quay video demo + 1-2 phút mở code (snapshot APR, reentrancy guard, solvency guard C2)
- [ ] Đối chiếu bảng Evaluation Criteria: coverage report, đủ 5 event bắt buộc, số liệu khớp Personal Variant
- [ ] Tự vấn đáp thử 7 câu hỏi

## Ngày 10 — Thứ 4, 29/7 — DEMO

- [ ] Push code cuối buổi sáng, kiểm tra repo đúng cấu trúc mục 11
- [ ] Demo trực tiếp

---

## Bảng điểm mục tiêu (tham chiếu nhanh)

| Tiêu chí | Điểm | Ngày chính |
|---|---|---|
| Công thức lãi & penalty | 20 | Ngày 3 |
| Snapshot APR/penalty bất biến | 15 | Ngày 2–4 |
| Auto-renew, khoá APR, grace period | 15 | Ngày 4 |
| Vault management & pause | 10 | Ngày 2 |
| Test coverage > 90% | 15 | Ngày 7 |
| Design questions + vấn đáp | 10 | Ngày 1, 3–7 |
| Frontend demo | 10 | Ngày 8 |
| Code quality & events | 5 | Xuyên suốt |
| Bonus C1 + C2 | +10 (cap 100) | Ngày 2–3 |