# Deployment Guide — Local Development

> For localhost demo on Hardhat node (chainId 31337).

---

## Quick Demo Script (5 min)

```bash
# Terminal 1: Start blockchain
npx hardhat node

# Terminal 2: Deploy + seed + start frontend
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/seed.ts --network localhost
cd frontend && npm run dev
```

1. Open `http://localhost:3000` in browser
2. **MetaMask:** Add network `http://127.0.0.1:8545` (chain ID 31337)
3. **Import wallet:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
4. **Demo flow:** PlansTab → open a deposit → DepositsTab → AdminTab (pause, fund vault, create plan)
5. **Switch wallets** (MetaMask) to see non-admin view / user view

---

## Prerequisites

```bash
npm install          # install all dependencies (from project root)
npx hardhat compile  # generate typechain-types (if not already done)
```

## Start Local Blockchain

```bash
npx hardhat node
```

Node starts at `http://127.0.0.1:8545`. Keeps running in foreground.

## Deploy Contracts

In a **new terminal** (node must be running):

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Deploys in order:
1. MockUSDC → 2. VaultManager(usdc) → 3. SavingCore(usdc, vaultManager)
4. Wires VaultManager.setSavingCore(SavingCore) — one-time call
5. Sets fee receiver to deployer
6. Saves artifact to `deployments/localhost.json`

## Seed Demo Data

After deploy completes:

```bash
npx hardhat run scripts/seed.ts --network localhost
```

Creates:
- 3 saving plans (90d/4%, 180d/4%, 365d/6%)
- 100,000 USDC funded into vault (interest pool)
- 10,000 USDC in deployer wallet (for demo deposits)

## Contract Addresses (deterministic)

On a fresh `npx hardhat node`, these are always the same:

| Contract | Address |
|----------|---------|
| MockUSDC | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| VaultManager | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| SavingCore | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |

Addresses reset to these values every time you restart `npx hardhat node` and re-deploy.

## Reset / Re-deploy

```bash
# 1. Stop hardhat node (Ctrl+C)
# 2. Restart
npx hardhat node

# 3. Re-deploy + seed
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/seed.ts --network localhost
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED 127.0.0.1:8545` | Hardhat node not running — start it first |
| `EADDRINUSE: port 8545` | Another process using port — stop it or use different port |
| Seed fails with `CALL_REVERT` | Deploy not run yet or artifact missing — re-run deploy first |
| Stale data after restart | Node resets state on restart — re-run deploy + seed |

---

## Manual Verification — Deposit List (DepositsTab)

### Prerequisite: Open a Deposit

Before testing, open at least one deposit via PlansTab (select plan → approve USDC → open deposit). The app auto-switches to DepositsTab after success.

### 6a. Deposit List — Step-by-Step

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to "Tiền gửi của tôi" tab | Loading skeleton appears briefly (initial load only). Subsequent tab switches show cached data instantly |
| 2 | Wait for data load | Deposit card(s) appear with: `#1`, principal amount, plan name (e.g. "180 ngày"), APR (e.g. "4.00%"), maturity date, countdown ("còn X ngày" or "đã đáo hạn"), expected interest |
| 3 | Verify status badge | 🟢 "Đang hoạt động" badge (green) for live deposits |
| 4 | Check maturity date + grace period | Date shown + "Ân hạn: 4 ngày" row visible |
| 5 | Test filter pills | Click "Đang hoạt động" → only Active deposits shown. Click "Đã đóng" → only terminal deposits shown |
| 6 | Test "Tất cả" | Returns full list |
| 7 | Empty state (no deposits) | If no deposits match address: "Chưa có khoản gửi nào" + "Mở tài khoản" button → clicking navigates back to PlansTab |

### 6b. Action Buttons — Per Status

| Deposit Status | Buttons Visible | Test Steps |
|----------------|----------------|------------|
| **Active + not matured** | 🔴 "Rút trước hạn" | 1. Click → modal appears with penalty warning<br>2. Shows principal, penalty (X.XX%), amount received<br>3. Click "Xác nhận rút" → MetaMask popup → confirm → status becomes Withdrawn |
| **Active + matured** (fast-forward time or wait) | 🟢 "Rút khi đáo hạn" + 🟢 "Nhận gốc" + 🟢 "Nhận lãi" + outline "Gia hạn" | Test C1 flow separately below |
| **PrincipalClaimed** | 🟢 "Nhận lãi" + outline "Gia hạn" | "Nhận lãi" → MetaMask → interest from vault. Sub-label "còn X USDC lãi chờ nhận" visible while pending > 0 |
| **Withdrawn** | outline "Đốt NFT" | Click "Đốt NFT" → confirmation modal → "Xác nhận" → NFT burned |
| **ManualRenewed / AutoRenewed** | outline "Đốt NFT" | Same as Withdrawn |

### 6c. C1 Flow Verification (Active + matured)

**Path A — withdrawAtMaturity (recommended):**
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Rút khi đáo hạn" | MetaMask popup |
| 2 | Confirm tx | Deposit status → Withdrawn. Principal + interest received |

**Path B — claimPrincipal → claimInterest:**
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Nhận gốc" | MetaMask popup |
| 2 | Confirm | Status → PrincipalClaimed. Sub-label: "còn X USDC lãi chờ nhận" |
| 3 | Click "Nhận lãi" | MetaMask popup |
| 4 | Confirm | Status → Withdrawn, interest received from vault |

### 6d. Renew Modal

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Gia hạn" on Active+matured card | Modal opens with plan dropdown |
| 2 | Select different plan (e.g. 365 ngày) | Info panel updates with new tenor + APR |
| 3 | Click "Gia hạn" | MetaMask popup → confirm → card changes to ManualRenewed, new deposit appears |

### 6e. Pause State

| Step | Action | Expected |
|------|--------|----------|
| 1 | As admin, pause SavingCore | Gold banner appears: "Hệ thống đang tạm dừng..." |
| 2 | Check disabled buttons | "Rút khi đáo hạn", "Nhận lãi", "Gia hạn" are greyed out (opacity 0.45) |
| 3 | Check enabled buttons | "Rút trước hạn", "Nhận gốc", "Đốt NFT" remain clickable |
| 4 | Unpause system | Banner disappears, all buttons re-enabled |

### 6f. Burn Modal

| Step | Action | Expected |
|------|--------|----------|
| 1 | Find a Withdrawn deposit | "Đốt NFT" button visible |
| 2 | Click "Đốt NFT" | Modal: "Bạn có chắc muốn đốt NFT #X?" |
| 3 | Click "Xác nhận" | MetaMask popup → confirm → card may disappear (NFT no longer exists) |

---

## Manual Verification — AdminTab (Quản trị hệ thống)

### Prerequisite: Use Deployer Account

AdminTab requires the **deployer wallet** (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`) — the owner of the contracts. In MetaMask, import the Hardhat test private key:
```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 7a. Owner Gate & System Info

| Step | Action | Expected |
|------|--------|----------|
| 1 | Connect a non-owner wallet | Shows: "Chỉ admin mới có thể xem trang này." |
| 2 | Switch to deployer wallet | Page reloads with admin dashboard |
| 3 | Wait for data load | 3 stat cards visible: "Số dư quỹ" (green), "Số dư USDC", "Tổng khoản gửi" |
| 4 | Verify vault balance | Matches the 100,000 USDC funded in seed |
| 5 | Verify admin USDC balance | Matches 10,000 USDC minted to deployer |
| 6 | Check total deposits | Shows 0 initially (or count after opening deposits) |

### 7b. Fund Health Warning

| Step | Action | Expected |
|------|--------|----------|
| 1 | With only vault funded, check banner | Should show 🟢 **green** "Quỹ an toàn — Đủ khả năng trả lãi" (no deposits = no obligations) |
| 2 | Check progress bar | Full green bar (ratio = 100%) |
| 3 | Open several large deposits (via PlansTab) then return to Admin | Banner may turn 🔴 **red** "CẢNH BÁO: Quỹ không đủ trả lãi!" with deficit amount |
| 4 | Check red progress bar | Bar width shows `vaultBalance / (obligations × 110%)` ratio |

### 7c. Fund Vault

| Step | Action | Expected |
|------|--------|----------|
| 1 | Enter amount (e.g. 50000) in "Nạp tiền vào quỹ" input | Input accepts the number |
| 2 | Click "Phê duyệt" | MetaMask popup → confirm → button becomes "Đã phê duyệt ✅" |
| 3 | Click "Nạp tiền vào quỹ" | MetaMask popup → confirm → vault balance increases by 50,000 |
| 4 | Verify stat card | "Số dư quỹ" shows updated total |
| 5 | Verify health bar | Ratio improves (closer to 100%) |

### 7d. Create Plan

| Step | Action | Expected |
|------|--------|----------|
| 1 | Fill form: Kỳ hạn = 30, APR = 200, Phạt = 300, Min = 10, Max = 10000 | All fields populated |
| 2 | Click "Tạo kế hoạch" | MetaMask popup → confirm |
| 3 | Verify plan table | New row appears: "Gói #3", "30 ngày", "2.00%", "3.00%", etc. |
| 4 | Validation: leave APR = 0 and click Create | Error toast: "Kỳ hạn và APR phải lớn hơn 0" |

### 7e. Plan Management (Enable/Disable)

| Step | Action | Expected |
|------|--------|----------|
| 1 | In plan table, click toggle on "Gói #0" (90 ngày) | Toggle animates to gray "Tắt" |
| 2 | Go to PlansTab | "90 ngày" card no longer shown (plan disabled) |
| 3 | Return to Admin, toggle "Gói #0" back on | Toggle animates to green "Bật" |
| 4 | Check PlansTab | "90 ngày" card re-appears |

### 7f. Pause/Unpause System

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Tạm dừng hệ thống" (red button) | MetaMask → confirm → button changes to "Tiếp tục hệ thống" (green) |
| 2 | Check DepositsTab | Gold banner: "Hệ thống đang tạm dừng..." |
| 3 | Check action buttons | "Rút khi đáo hạn", "Nhận lãi", "Gia hạn" disabled |
| 4 | Verify "Rút trước hạn", "Nhận gốc", "Đốt NFT" still clickable | Buttons remain active |
| 5 | Return to AdminTab, click "Tiếp tục hệ thống" | MetaMask → confirm → button reverts to "Tạm dừng hệ thống" |
| 6 | Check DepositsTab | Gold banner gone, all buttons re-enabled |
| 7 | Test "Tạm dừng quỹ" / "Tiếp tục quỹ" similarly | VaultManager pause toggles independently |
