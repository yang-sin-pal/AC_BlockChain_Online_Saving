# Deployment Guide — Local Development

> For localhost demo on Hardhat node (chainId 31337).

---

## 1. Prerequisites

```bash
npm install          # install all dependencies (from project root)
npx hardhat compile  # generate typechain-types (if not already done)
```

---

## 2. Start Local Blockchain

```bash
npx hardhat node
```

Node starts at `http://127.0.0.1:8545`. Keeps running in foreground.

---

## 3. Deploy Contracts

In a **new terminal** (node must be running):

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Deploys in order:
1. MockUSDC → VaultManager(usdc) → SavingCore(usdc, vaultManager)
2. Wires `VaultManager.setSavingCore(SavingCore)` — one-time call
3. Sets fee receiver to deployer
4. Saves artifact to `deployments/localhost.json` + `frontend/src/config/contracts.json`

---

## 4. Seed Demo Data

```bash
npx hardhat run scripts/seed.ts --network localhost
```

Creates:
- 3 saving plans: 90d/4%, 180d/4%, 365d/6%
- 100,000 USDC funded into vault (interest pool)
- 10,000 USDC in deployer wallet (for demo deposits)

---

## 5. (Optional) AutoRenew Demo Data

Creates time-shifted deposits that have already matured and auto-renewed:

```bash
npx hardhat run scripts/seed-demo.ts --network localhost
```

See §Expected Output for terminal output.

---

## 6. Start Frontend

```bash
cd frontend && npm run dev
```

---

## 7. MetaMask Setup

| Step | Action |
|------|--------|
| 1 | Add network: **http://127.0.0.1:8545** (chain ID **31337**) |
| 2 | Import wallet: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 3 | Open `http://localhost:3000` |
| 4 | Click "Kết nối MetaMask" — confirm connection |

---

## Walkthrough — Step 1: PlansTab — View Plans & Open Deposit

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to "Kế hoạch" tab | 3 plan cards: "90 ngày" (4.00%), "180 ngày" (4.00%), "365 ngày" (6.00%) |
| 2 | Click plan card | Card expands, form appears with Principal, APR, Penalty details |
| 3 | Enter principal (e.g. 500 USDC) and click "Mở tài khoản" | MetaMask popup for **approve** (first time only) |
| 4 | Confirm approve tx | UI shows "Tài khoản đã được phê duyệt" |
| 5 | Auto-switch to **openDeposit** | MetaMask popup for deposit |
| 6 | Confirm deposit tx | Success toast: "Mở tài khoản thành công!" → auto-navigates to "Tiền gửi của tôi" tab |
| 7 | If principal > allowance | Approve step repeats; after approval, openDeposit fires automatically |

**Verification checks:**
- Insufficient balance form: enter >10,000 USDC → error "Số dư USDC không đủ"
- Approve once, deposit multiple times: second deposit skips approve step
- Empty USDC balance (switch to a new wallet): error "Số dư USDC không đủ"

---

## Walkthrough — Step 2: DepositsTab — View & Manage Deposits

### 2a. Deposit List

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to "Tiền gửi của tôi" tab | Loading skeleton (first load only), then deposit card(s) appear |
| 2 | Verify card info | `#1`, principal, plan name, APR, maturity date, countdown, expected interest |
| 3 | Check badge | 🟢 "Đang hoạt động" badge (green) |
| 4 | Check grace row | "Ân hạn: 4 ngày" visible |
| 5 | Test "Đang hoạt động" filter | Only active deposits shown |
| 6 | Test "Đã đóng" filter | Terminal deposits only |
| 7 | Test "Tất cả" | Full list returns |
| 8 | Empty state (no deposits) | "Chưa có khoản gửi nào" + "Mở tài khoản" → navigates to PlansTab |

### 2b. Action Buttons Per Status

| Status | Buttons | What to do |
|--------|---------|------------|
| Active + not matured | 🔴 "Rút trước hạn" | Click → modal shows penalty → confirm → status = Withdrawn |
| Active + matured | 🟢 "Rút khi đáo hạn" + 🟢 "Nhận gốc" + 🟢 "Nhận lãi" + "Gia hạn" | Test C1 flow below |
| PrincipalClaimed | 🟢 "Nhận lãi" + "Gia hạn" | Sub-label: "còn X USDC lãi chờ nhận" |
| Withdrawn / ManualRenewed / AutoRenewed | "Đốt NFT" | Click → confirm → NFT burned |

### 2c. C1 Flow (Active + Matured)

**Path A — withdrawAtMaturity (recommended):**
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Rút khi đáo hạn" | MetaMask popup |
| 2 | Confirm | Status → Withdrawn. Principal + interest received. |

**Path B — claimPrincipal → claimInterest (C1 principal protection):**
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Nhận gốc" | MetaMask popup → confirm → Status → PrincipalClaimed |
| 2 | Verify sub-label | "còn X USDC lãi chờ nhận" shown |
| 3 | Click "Nhận lãi" | MetaMask popup → confirm → Status → Withdrawn |
| 4 | Verify interest paid | Interest received from vault |

### 2d. Renew Modal

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Gia hạn" on Active+matured card | Modal with plan dropdown |
| 2 | Select 365d plan | Info panel updates (tenor + APR) |
| 3 | Click "Gia hạn" | MetaMask → confirm → card → ManualRenewed, new deposit created |

### 2e. AutoRenew Button (Condition: past grace period `≥ maturityAt + 4 days`)

Requires `seed-demo.ts` to have been run (creates time-shifted deposits).

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run `seed-demo.ts` then refresh frontend | Deposit #1 & #2 show 🟠 "Đã tự gia hạn" badge |
| 2 | Find Deposit #3 (compounded, Active, matured, past grace) | "Tự động gia hạn" outline button visible |
| 3 | Click button | MetaMask → confirm |
| 4 | After confirm | Deposit #3 → AutoRenewed. New deposit created with compounded principal |
| 5 | Verify Deposit #4 (180d, not matured) | No autoRenew button — not past maturity |

### 2f. Burn Modal

| Step | Action | Expected |
|------|--------|----------|
| 1 | Find a Withdrawn/AutoRenewed deposit | "Đốt NFT" button visible |
| 2 | Click "Đốt NFT" | Modal: "Bạn có chắc muốn đốt NFT #X?" |
| 3 | Click "Xác nhận" | MetaMask → confirm → card may disappear (NFT burned) |

### 2g. Pause State (cross-tab)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Switch to AdminTab, pause SavingCore | Returns to DepositsTab |
| 2 | Gold banner visible | "Hệ thống đang tạm dừng..." |
| 3 | Check disabled buttons | "Rút khi đáo hạn", "Nhận lãi", "Gia hạn" greyed out (opacity 0.45) |
| 4 | Check enabled buttons | "Rút trước hạn", "Nhận gốc", "Đốt NFT" remain clickable |
| 5 | Return to AdminTab, unpause | Banner gone, all buttons re-enabled |

---

## Walkthrough — Step 3: AdminTab — System Administration

### Prerequisite: Use Deployer Account

AdminTab requires the **owner wallet** (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`). Import the Hardhat test private key in MetaMask:
```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 3a. Owner Gate

| Step | Action | Expected |
|------|--------|----------|
| 1 | Connect a **non-owner** wallet | "Chỉ admin mới có thể xem trang này." |
| 2 | Switch to deployer wallet | Page reloads with admin dashboard |

### 3b. Stat Cards & Fund Health

| Step | Action | Expected |
|------|--------|----------|
| 1 | Wait for data load | 3 stat cards: "Số dư quỹ" (green), "Số dư USDC", "Tổng khoản gửi" |
| 2 | Verify vault balance | Matches 100,000 USDC from seed |
| 3 | Verify admin USDC | Matches 10,000 USDC minted to deployer |
| 4 | Check health banner (no deposits) | 🟢 Green "Quỹ an toàn — Đủ khả năng trả lãi" |
| 5 | Check progress bar | Full green bar (ratio = 100%) |
| 6 | Open large deposits via PlansTab, return to Admin | Banner may turn 🔴 red "CẢNH BÁO: Quỹ không đủ trả lãi!" with deficit |

### 3c. Fund Vault

| Step | Action | Expected |
|------|--------|----------|
| 1 | Enter 50000 in "Nạp tiền vào quỹ" input | Input accepts number |
| 2 | Click "Phê duyệt" | MetaMask → confirm → "Đã phê duyệt ✅" |
| 3 | Click "Nạp tiền vào quỹ" | MetaMask → confirm → vault balance +50,000 |
| 4 | Verify stat card | "Số dư quỹ" updated |
| 5 | Verify health bar | Ratio improves |

### 3d. Create Plan

| Step | Action | Expected |
|------|--------|----------|
| 1 | Fill form: Kỳ hạn=30, APR=200, Phạt=300, Min=10, Max=10000 | Fields populated |
| 2 | Click "Tạo kế hoạch" | MetaMask → confirm |
| 3 | Verify plan table | New row: "Gói #3", "30 ngày", "2.00%", "3.00%" |
| 4 | Validation: APR=0 → click Create | Error toast: "Kỳ hạn và APR phải lớn hơn 0" |

### 3e. Enable/Disable Plans

| Step | Action | Expected |
|------|--------|----------|
| 1 | Toggle "Gói #0" (90 ngày) off | Toggle → gray "Tắt" |
| 2 | Go to PlansTab | "90 ngày" card hidden |
| 3 | Return to AdminTab, toggle back on | Toggle → green "Bật" |
| 4 | Check PlansTab | "90 ngày" card re-appears |

### 3f. Pause/Unpause

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Tạm dừng hệ thống" (red) | MetaMask → confirm → button → "Tiếp tục hệ thống" (green) |
| 2 | Check DepositsTab | Gold banner, disabled buttons |
| 3 | Return to AdminTab, click "Tiếp tục hệ thống" | Button reverts |
| 4 | Toggle "Tạm dừng quỹ" independently | VaultManager pause works independently of SavingCore pause |

### 3g. Audit Log

Queries 5 event types from SavingCore + VaultManager at the bottom of AdminTab.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Scroll to "Nhật ký hệ thống" | Table: Thời gian, Loại, Mô tả, Giao dịch |
| 2 | Initial load | Spinner → rows appear |
| 3 | Verify event badges | DepositOpened 🟢, Withdrawn ⚫, Renewed 🟣, InterestClaimed 🔵, VaultFunded 🟡 |
| 4 | Click "Sau ›" | Advances to next page |
| 5 | Click "‹ Trước" | Goes back |
| 6 | Change page size to 25/50 | More rows per page |
| 7 | Click 🔗 link | Opens `http://localhost:8545/tx/0x...` |
| 8 | Perform action (open deposit), then refresh | New row at top |

---

## Reference: Contract Addresses (deterministic)

On a fresh `npx hardhat node`, these are always the same:

| Contract | Address |
|----------|---------|
| MockUSDC | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| VaultManager | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| SavingCore | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |

Addresses reset to these values every time you restart `npx hardhat node` and re-deploy.

---

## Reference: Reset / Re-deploy

```bash
# 1. Stop hardhat node (Ctrl+C)
# 2. Restart
npx hardhat node

# 3. Re-deploy + seed
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/seed.ts --network localhost
```

---

## Reference: Expected Output (seed-demo.ts)

```
Found 3 plans. Creating demo deposits...
--- Deposit #1: 90-day plan, auto-renewed ---
Opened deposit #1: 1,000 USDC, 90-day plan
  Fast-forwarded 94 days → past maturity + grace
  ✅ Deposit #1 auto-renewed → Deposit #2
  New deposit #2 : 1,010 USDC, status: 0 (Active)
--- Deposit #2: auto-renew again (compounding) ---
  Fast-forwarded another 94 days
  ✅ Deposit #2 auto-renewed → Deposit #3
  New deposit #3 : 1,020.1 USDC (compounded principal + interest)
--- Deposit #3: Active deposit for manual demo ---
Opened deposit #4: 500 USDC, 180-day plan (Active)
--- Demo Summary ---
Total deposits: 4
  #1: AutoRenewed (status=4)
  #2: AutoRenewed (status=4)
  #3: Active (status=0) — compounded principal
  #4: Active (status=0) — 500 USDC, 180-day plan (manual demo)
```

---

## Reference: Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED 127.0.0.1:8545` | Hardhat node not running — start it first |
| `EADDRINUSE: port 8545` | Another process using port — stop it or use different port |
| Seed fails with `CALL_REVERT` | Deploy not run yet or artifact missing — re-run deploy first |
| Stale data after restart | Node resets state on restart — re-run deploy + seed |
| MetaMask "Nonce too high" | Settings → Advanced → Clear activity tab data |
| MetaMask "Already processing" error | Wait for pending tx or restart MetaMask |
