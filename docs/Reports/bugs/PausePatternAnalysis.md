# Pause Pattern Analysis

> Scan of Solidity contracts for `pause`/`whenNotPaused` patterns.
> Generated: 2026-07-27

---

## 1. Who Can Pause / Unpause?

| Function | File:Line | Access Control |
|----------|-----------|----------------|
| `VaultManager.pause()` | `VaultManager.sol:65` | `onlyOwner` |
| `VaultManager.unpause()` | `VaultManager.sol:70` | `onlyOwner` |
| `SavingCore.pause()` | `SavingCore.sol:100` | `onlyOwner` |
| `SavingCore.unpause()` | `SavingCore.sol:105` | `onlyOwner` |

---

## 2. Every Public/External Function — Pause Status

### VaultManager (`contracts/core/VaultManager.sol`)

| Function | File:Line | Blocked when paused? | Should it be blocked? |
|----------|-----------|---------------------|----------------------|
| `withdrawVault(amount)` | `VaultManager.sol:51` | Yes (`whenNotPaused`) | Yes — prevents admin from draining vault |
| `fundVault(amount)` | `VaultManager.sol:43` | No | No — admin should always be able to fund |
| `payInterest(to, amount)` | `VaultManager.sol:77` | No | See note below |
| `setSavingCore(addr)` | `VaultManager.sol:36` | No | No — one-time setup |
| `setFeeReceiver(addr)` | `VaultManager.sol:59` | No | No — admin config |

### SavingCore (`contracts/core/SavingCore.sol`)

| Function | File:Line | Blocked when paused? | Should it be blocked? |
|----------|-----------|---------------------|----------------------|
| `openDeposit(...)` | `SavingCore.sol:153` | No | No — opening deposits is safe |
| `withdrawAtMaturity(id)` | `SavingCore.sol:180` | Yes (`whenNotPaused`) | Yes |
| `earlyWithdraw(id)` | `SavingCore.sol:210` | Yes (`whenNotPaused`) | Yes |
| `renewDeposit(...)` | `SavingCore.sol:237` | Yes (`whenNotPaused`) | Yes |
| `autoRenewDeposit(id)` | `SavingCore.sol:292` | Yes (`whenNotPaused`) | Yes |
| `updatePlan(...)` | `SavingCore.sol:77` | No | No — admin config |
| `enablePlan(id)` | `SavingCore.sol:86` | No | No — admin config |
| `disablePlan(id)` | `SavingCore.sol:94` | No | No — admin config |

---

## 3. Key Finding: `payInterest` design consideration

`VaultManager.payInterest` (`VaultManager.sol:77`) has **no `whenNotPaused`** modifier.

This means even when the vault is paused, SavingCore can still call `payInterest` and drain interest to users. The pause only blocks the admin from withdrawing vault funds (`withdrawVault`), but does not prevent the vault from paying out to users.

**Impact:** If the intent of pausing is to freeze all fund movement, `payInterest` should also be blocked. However, this would mean users cannot withdraw their principal + interest even when the vault has funds — which may be undesirable.

**Current behavior when paused:**
- Admin cannot drain vault (`withdrawVault` reverts)
- Admin can still fund vault (`fundVault` works)
- SavingCore can still pay interest to users (`payInterest` works)
- Users can still withdraw, renew, early-withdraw (SavingCore has no pause)

---

## 4. Gap Summary

> **Status: FIXED** (2026-07-27)

SavingCore now inherits `Pausable`. `withdrawAtMaturity`, `earlyWithdraw`,
`renewDeposit`, and `autoRenewDeposit` all have the `whenNotPaused` modifier.
10 new tests verify the behavior in `SavingCore.pause.test.ts`.
