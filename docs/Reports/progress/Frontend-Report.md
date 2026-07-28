# Frontend Report — AC Blockchain Online Saving

> **Project:** Hệ thống tiết kiệm trực tuyến (Blockchain Programming Final Assignment)
> **Date:** 29/7/2026
> **Student ID:** ...38
> **Frontend Score Target:** 10/10 (§7.3)

---

## 1. Tổng quan

Frontend là ứng dụng React kết nối MetaMask, cho phép người dùng tương tác với smart contracts SavingCore, VaultManager và MockUSDC trên local Hardhat network (chainId 31337). Giao diện bằng tiếng Việt, phong cách vàng đồng (#D4A017) chủ đạo.

**Flows hỗ trợ:**
1. Kết nối ví — ConnectWallet + network detection
2. Xem kế hoạch + mở tài khoản — PlansTab
3. Danh sách tiền gửi + thao tác — DepositsTab
4. Rút/đáo hạn/C1 — withdrawAtMaturity, claimPrincipal, claimInterest
5. Gia hạn (thủ công) — renewDeposit
6. Quản trị hệ thống — AdminTab

---

## 2. Kiến trúc kỹ thuật

### 2.1 Tech Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Framework | React 18 + TypeScript | Requirement §7.3, type safety |
| Build tool | Vite 6 | Fast HMR, simple config |
| Blockchain | Hardhat localhost (31337) | Local demo, deterministic addresses |
| Wallet | ethers.js v6 + MetaMask | EIP-1193 provider, BrowserProvider |
| Styling | Pure CSS (no framework) | Independent, fast, customizable |
| Linting | oxlint | Already configured, fast |

### 2.2 File Structure

```
frontend/src/
├── abi/                    # ABI-only JSON (3 files)
│   ├── SavingCore.json     # 92 entries
│   ├── VaultManager.json   # 36 entries
│   └── MockUSDC.json       # 19 entries
├── config/
│   └── contracts.json      # Addresses from deployments/
├── hooks/
│   ├── useWallet.ts        # MetaMask connection + event listeners
│   └── useContracts.ts     # Contract instances with signer
├── components/
│   ├── Layout.tsx          # App shell (header, nav, footer)
│   ├── ConnectWallet.tsx   # Wallet connection + USDC balance
│   ├── PlansTab.tsx        # Plan cards + open deposit form
│   ├── DepositsTab.tsx     # Deposit list + actions + modals
│   ├── AdminTab.tsx        # Admin dashboard + vault + plan mgmt
│   └── AuditLog.tsx        # Event log table (queryFilter)
├── utils/
│   ├── format.ts           # formatUSDC, parseUSDC, formatDate, etc.
│   ├── health.ts           # calcTotalInterestObligations, checkFundHealth
│   └── networks.ts         # Chain configs + helpers
├── App.tsx                 # Root: tab routing + toast
├── App.css                 # Shared utilities (btn, card, input, badge, toast)
├── index.css               # Reset + CSS variables + fonts
└── components/
    ├── Layout.css          # App shell layout
    ├── PlansTab.css        # Plan cards + form
    ├── DepositsTab.css     # Deposit cards + modals + filters
    ├── AdminTab.css        # Admin stat cards + forms + tables
    └── AuditLog.css        # Event log table
```

### 2.3 Key Dependencies

```json
{
  "ethers": "^6.17.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "typescript": "^5.7.2",
  "vite": "^6.3.1"
}
```

No UI library, no CSS framework, no state management library — vanilla React + ethers.

---

## 3. Triển khai Deployment

### 3.1 Deploy Script (`scripts/deploy.ts`)

Deploys in fixed order:
1. **MockUSDC** — ERC20 with 6 decimals
2. **VaultManager(MockUSDC, deployer)** — constructor takes token + fee receiver
3. **SavingCore(MockUSDC, VaultManager)** — constructor links core to vault
4. **VaultManager.setSavingCore(SavingCore)** — critical wiring, one-time
5. **VaultManager.setFeeReceiver(deployer)**
6. **Save to `deployments/localhost.json`**

### 3.2 Seed Script (`scripts/seed.ts`)

1. Read deployment artifact
2. Create 3 plans via `SavingCore.createPlan()`:
   - Plan 0: 90 days, 4.00% APR, 4.50% penalty, min 10 USDC, max 100,000 USDC
   - Plan 1: 180 days, 4.00% APR, 4.50% penalty, min 10 USDC, max 100,000 USDC
   - Plan 2: 365 days, 6.00% APR, 4.50% penalty, min 10 USDC, max 100,000 USDC
3. Fund vault with 100,000 USDC via `VaultManager.fundVault()`
4. Mint 10,000 USDC to deployer

### 3.3 Deterministic Addresses

On every fresh `npx hardhat node`:

| Contract | Address |
|----------|---------|
| MockUSDC | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| VaultManager | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| SavingCore | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |

---

## 4. Tính năng giao diện

### 4.1 Kết nối ví (ConnectWallet)

- **useWallet hook**: wraps MetaMask `BrowserProvider`, exposes `address`, `chainId`, `signer`, `isConnected`, `isCorrectNetwork`
- **Event listeners**: `accountsChanged` → reload state, `chainChanged` → reload state
- **Auto-reconnect**: checks `ethereum.isMetaMask` on page load
- **States**: Disconnected ("Kết nối ví" gold button) → Wrong network (red warning + "Chuyển mạng" button) → Connected (green pill, USDC balance, network badge)
- **Error handling**: MetaMask not installed → disabled "Cài MetaMask" button

### 4.2 Kế hoạch tiết kiệm (PlansTab)

- Fetches enabled plans via `SavingCore.plans(i)` loop
- 3-column card grid: tenor, APR (gold), penalty (red), min/max limits, grace period note
- **Skeleton loading** while fetching plans
- **Default plan selection**: 180-day plan pre-selected if available
- **Open deposit form**:
  - Plan selector dropdown
  - Amount input with real-time validation (min/max/balance)
  - Live "Estimated interest" display
  - Two-step flow: Approve USDC → Open deposit
  - Auto-switches to DepositsTab on success + toast notification

### 4.3 Danh sách tiền gửi (DepositsTab)

- Fetches user deposits by iterating `SavingCore.nextDepositId()`, filtering by `ownerOf(i) === address`
- **Deposit card**: ID, principal, plan name, APR (gold), maturity + 4 day grace, countdown, expected interest, status badge
- **Status badges**: 🟢 Active, 🔵 PrincipalClaimed, ⚫ Withdrawn, 🟣 ManualRenewed, 🟠 AutoRenewed
- **Filter pills**: Tất cả / Đang hoạt động / Đã rút gốc / Đã đóng
- **Empty state**: "Chưa có khoản gửi nào" + "Mở tài khoản" button
- **C1 sub-label**: PrincipalClaimed deposits show pending interest amount

### 4.4 Rút tiền

- **Rút khi đáo hạn** (`withdrawAtMaturity`): One-click principal + interest (blocked when paused)
- **Rút trước hạn** (`earlyWithdraw`): Modal shows penalty calculation + reduced amount (not blocked when paused)
- **Nhận gốc** (`claimPrincipal`): C1 flow step 1 — principal returned immediately, interest stored as pending (not blocked when paused)
- **Nhận lãi** (`claimInterest`): C1 flow step 2 — claim from vault (blocked when paused)

### 4.5 C1 (Principal Protection)

C1 là cơ chế bảo vệ tiền gốc: khi vault không đủ khả năng chi trả lãi, người dùng có thể nhận lại tiền gốc ngay lập tức claimPrincipal gọi trong khi `claimInterest` bị chặn bởi `whenNotPaused`. Luồng C1 gồm 2 bước:
1. **Nhận gốc** (`claimPrincipal`) — trả principal từ SavingCore, lưu interest trong `pendingInterest[depositId]`
2. **Nhận lãi** (`claimInterest`) — Path B: thanh toán từ `pendingInterest` khi vault có đủ

### 4.6 Gia hạn (Renew)

- **Gia hạn thủ công**: Modal chọn gói mới, dropdown plans, info panel, xác nhận → `renewDeposit()`
- **Tự động gia hạn**: Xử lý off-chain (bot gọi `autoRenewDeposit()`) không có owner check — bất kỳ ai cũng có thể gọi

### 4.7 Quản trị (AdminTab)

- **Owner gate**: Kiểm tra `SavingCore.owner()` — non-owner thấy "Chỉ admin mới có thể xem trang này"
- **Stat cards**: Số dư quỹ (green), Số dư USDC admin, Tổng khoản gửi
- **Fund health**: Hiển thị banner xanh/đỏ với progress bar, so sánh `vaultBalance ≥ obligations × 110%`
- **Fund vault**: Approve USDC → fundVault flow
- **Create plan**: 5-field form với validation
- **Plan management**: Bảng với toggle switch (enable/disable)
- **Pause/unpause**: Nút cho cả SavingCore + VaultManager với warning banner
- **Audit log**: Bảng events từ `queryFilter` — Deposit, Withdraw, Renew, Interest, Fund với pagination

---

## 5. Thiết kế UI/UX

### 5.1 Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary | `#D4A017` | Header, buttons, active tab |
| Accent | `#F5C242` | Hover, active states |
| Success | `#16A34A` | Active status, balance |
| Danger | `#DC2626` | Errors, early withdraw |
| Text | `#1F1F1F` | Primary text |
| Text secondary | `#6B7280` | Labels, descriptions |
| Background | `#F9F9F7` | Body |
| Card | `#FFFFFF` | Cards, inputs |
| Border | `#ECE8E1` | Cards, inputs |
| Gold text | `#8A6A00` | APR display |

### 5.2 Typography

- **Primary font**: Inter (weights 400-800) — clean, modern sans-serif
- **Monospace font**: JetBrains Mono (weights 400-700) — for addresses, amounts, numerical data
- **Sizes**: 11px (labels) → 28px (page titles)

### 5.3 Layout

- **App shell**: Centered flat layout (max-width 1080px), header solid `#1F1F1F` with brand + ConnectWallet
- **Navigation**: Tab bar (Kế hoạch / Tiền gửi của tôi / Quản trị) with gold underline for active
- **Content**: Padding 32px, card-based UI with rounded corners (18-22px)
- **Responsive**: Desktop 3-column → Tablet 2-column → Mobile single column

### 5.4 Vietnamese Localization

All UI text in Vietnamese:
- Buttons: "Kết nối ví", "Mở tài khoản tiết kiệm", "Rút trước hạn"
- Status: "Đang hoạt động", "Đã đóng", "Đã rút gốc"
- Errors: "Phê duyệt thất bại", "Số dư không đủ", "Giao dịch thất bại"
- Labels: "Kỳ hạn", "Ân hạn", "Lãi dự kiến"

---

## 6. Flow giao dịch

### 6.1 Mở tài khoản tiết kiệm

```
User → PlansTab → select plan → enter amount
  → click "Phê duyệt USDC"
    → MetaMask: approve(SavingCore, amount)
    → success: "Đã phê duyệt ✅"
  → click "Mở tài khoản tiết kiệm"
    → MetaMask: openDeposit(planId, amount)
    → success: toast + auto-switch to DepositsTab
```

### 6.2 Rút khi đáo hạn

```
User → DepositsTab → Active+matured
  → click "Rút khi đáo hạn"
    → MetaMask: withdrawAtMaturity(depositId)
    → status → Withdrawn
    → principal + interest received
```

### 6.3 C1 Flow (Bảo vệ tiền gốc)

```
Path B (when paused):
  → click "Nhận gốc"
    → MetaMask: claimPrincipal(depositId)
    → status → PrincipalClaimed
    → sub-label: "Còn X USDC lãi chờ nhận"
  → click "Nhận lãi"
    → MetaMask: claimInterest(depositId)
    → status → Withdrawn
    → interest claimed from vault/pending
```

### 6.4 Gia hạn

```
User → DepositsTab → Active+matured
  → click "Gia hạn"
    → Modal: select new plan → confirm
    → MetaMask: renewDeposit(depositId, newPlanId)
    → status → ManualRenewed
    → new deposit created
```

### 6.5 Admin: Nạp quỹ

```
Admin → AdminTab → Fund Vault section
  → enter amount → click "Phê duyệt"
    → MetaMask: approve(VaultManager, amount)
    → success: "Đã phê duyệt ✅"
  → click "Nạp tiền vào quỹ"
    → MetaMask: vaultManager.fundVault(amount)
    → vault balance updated
```

### 6.6 Admin: Pause system

```
Admin → AdminTab → click "Tạm dừng hệ thống"
  → MetaMask: savingCore.pause()
  → DepositsTab shows gold pause banner
  → Disabled: withdrawAtMaturity, claimInterest, renewDeposit
  → Active: claimPrincipal, earlyWithdraw, burn
```

### 6.7 Admin: Audit Log

```
Admin → AdminTab → Audit log section
  → Auto-fetches events via queryFilter from 5 event types
  → Default: 10 rows, newest first
  → Pagination: < Trước / Trang X / Y / Sau >
  → Page size: 10 / 25 / 50 dòng
  → Events: 🟢 Deposit, 🔴 Withdraw, 🔵 Renew, 🟡 Interest, ⚪ Fund
```

---

## 7. Demo Video Script (3-5 phút)

### Segment 1: Setup (30s)

```
1. Show terminal: npx hardhat node
2. Show terminal: npx hardhat run scripts/deploy.ts --network localhost
3. Show terminal: npx hardhat run scripts/seed.ts --network localhost
4. Show terminal: cd frontend && npm run dev
5. Open browser at localhost:3000
```

### Segment 2: Connect Wallet (30s)

```
1. Click "Kết nối ví"
2. MetaMask popup → select account → connect
3. Show green pill with address + USDC balance
4. Switch to wrong network → show warning → switch back
```

### Segment 3: Open Deposit (60s)

```
1. PlansTab: 3 plan cards visible
2. Select 180-day plan
3. Enter 1000 USDC in amount field
4. Show validation: min/max hints, estimated interest
5. Click "Phê duyệt USDC" → MetaMask → confirm
6. Button changes to "Đã phê duyệt ✅"
7. Click "Mở tài khoản tiết kiệm" → MetaMask → confirm
8. Toast: "Mở tài khoản thành công!"
9. Auto-switch to DepositsTab: card visible with 🟢 Active badge
```

### Segment 4: C1 + Withdraw (60s)

```
1. Fast-forward time or show pre-matured deposit
2. Click "Nhận gốc" → MetaMask → confirm
3. Status becomes 🔵 PrincipalClaimed
4. Sub-label: "Còn X USDC lãi chờ nhận"
5. Click "Nhận lãi" → MetaMask → confirm
6. Status becomes ⚫ Withdrawn
```

### Segment 5: Admin (60s)

```
1. Import deployer private key in MetaMask
2. Switch to AdminTab → 3 stat cards visible
3. Fund vault: enter 50000 → approve → fund
4. Vault balance increases, health bar improves
5. Create plan: 30 days, 2.00% APR, 3.00% penalty
6. New plan appears in table
7. Toggle plan off/on → check PlansTab
8. Pause system → check DepositsTab pause banner
9. Audit log: show event table with pagination
```

### Segment 6: Wrap-up (30s)

```
1. Summary of flows demonstrated
2. Code quality: 160 Solidity tests passing
3. Coverage: SC 93.06%, VM 96.67%
4. Frontend: React + TypeScript + ethers v6
```

---

## 8. Vấn đề gặp phải & Giải pháp

| # | Vấn đề | Giải pháp |
|---|--------|-----------|
| 1 | **Sai tên trường struct**: `deposit.amount` không tồn tại trong contract | Dùng `deposit.principal`, `deposit.startAt`, `deposit.aprBpsAtOpen` theo đúng ISavingCore struct |
| 2 | **Công thức nợ lãi thiếu pendingInterest**: Chỉ tính interest cho Active deposits | Cộng thêm `pendingInterest(depositId)` cho PrincipalClaimed deposits trong `calcTotalInterestObligations()` |
| 3 | **queryFilter TypeScript errors**: ethers v6 EventLog type thiếu `logIndex` | Dùng event counter làm unique key thay vì `logIndex` |
| 4 | **Skeleton flash trên refresh**: Mỗi lần refresh, skeleton cards hiển thị làm mất danh sách deposit | Dùng `useRef` để phân biệt initial load vs refresh — skeleton chỉ hiển thị lần đầu |
| 5 | **Pause semantics phức tạp**: Không phải tất cả actions đều bị block khi paused | Implement mapping riêng dựa trên `whenNotPaused` modifier của từng function |
| 6 | **AdminTab owner check phải gọi on-chain `owner()` mỗi lần mount**: Có thể chậm | Gọi một lần trong `fetchData`, dùng `isOwner` state để gate UI |
| 7 | **Allowance edge case**: `approved` state không được cập nhật khi allowance đã đủ | Auto-detect allowance khi amount thay đổi, set `approvedRef.current` tương ứng |
| 8 | **Deterministic addresses không thay đổi khi restart node**: Dễ gây nhầm lẫn | Document rõ ràng trong manual guide, không cần re-copy contracts.json khi restart |

---

## 9. Kết quả

### 9.1 Smart Contract Coverage

| Contract | Coverage |
|----------|----------|
| SavingCore | 93.06% |
| VaultManager | 96.67% |

### 9.2 Test Suite

- **160 Solidity tests** passing (via `npx hardhat test`)
- All user flows verified: open, withdraw, early withdraw, C1, renew, auto-renew, admin actions
- Dual-pause architecture tested for both SavingCore and VaultManager

### 9.3 Frontend Build

| Metric | Value |
|--------|-------|
| Modules | 184 |
| JS bundle | ~510 KB |
| CSS bundle | ~17 KB |
| Lint | 0 warnings (oxlint) |
| TypeScript | strict mode, 0 errors |
| Build time | ~220ms (vite incremental) |

### 9.4 Features Delivered

| Feature | Status | Notes |
|---------|--------|-------|
| Wallet connection | ✅ | MetaMask, auto-reconnect, network switching |
| Plan viewing | ✅ | 3 plans, enabled filter, skeleton loading |
| Open deposit | ✅ | Approve + deposit two-step flow |
| Deposit list | ✅ | Filter pills, status badges, C1 labels |
| Withdraw at maturity | ✅ | Combined principal + interest |
| Early withdraw | ✅ | Penalty modal calculation |
| C1 principal protection | ✅ | claimPrincipal + claimInterest |
| Manual renew | ✅ | Plan selector modal |
| Admin dashboard | ✅ | Stat cards, health check, fund vault |
| Plan management | ✅ | Create, enable/disable |
| Pause/unpause | ✅ | Dual pause with warning banners |
| Audit log | ✅ | Event query with pagination |
| Vietnamese UI | ✅ | Full Vietnamese localization |
| Responsive design | ✅ | Desktop → tablet → mobile |
| Fund health monitoring | ✅ | Client-side obligation calculation |

### 9.5 Scoring Contribution

| Criterion | Points | Achieved |
|-----------|--------|----------|
| Smart contracts | 70 | 160 tests, 93-97% coverage |
| Design docs | 10 | Architecture, code convention, business rules |
| Code quality & events | 5 | Clean code, proper event usage |
| Frontend demo | 10 | All flows, Vietnamese UI, responsive |
| Design questions | 10 | Oral defense (prepared) |
| C1 bonus | +5 | Principal protection implemented |
| C2 bonus | +5 | Not attempted (time) |
| **Total** | **100 + 5 bonus** | **95 secured + 5 pending (C2)** |

---

*End of report. Frontend implementation complete per §7.3 requirements.*
