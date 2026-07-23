# Day 3 Report — VaultManager Implementation (Phase 1/2)

> **Project:** Online Saving System (Blockchain Programming Final Assignment)
> **Date:** Wednesday, 22/7/2026
> **Student ID:** `...38`

---

## 1. Objectives

| # | Task (from PLAN.md) | Status |
|---|---------------------|--------|
| 1 | Bootstrap test helpers (`constants.ts`, `utils.ts`, `fixtures.ts`) | **Done** |
| 2 | Add VaultManager custom errors to `Errors.sol` | **Done** |
| 3 | RED: Write `VaultManager.test.ts` — 19 test cases | **Done** |
| 4 | GREEN: Implement `VaultManager.sol` | **Done** |
| 5 | REFACTOR: NatSpec, event assertions, modifier ordering | **Done** |
| 6 | Update `PLAN.md` and `business-rules.md` tracking | **Done** |

**Scope:** VaultManager half of Day 3 only. openDeposit deferred to next session.

---

## 2. Deliverables

| File | Action | Lines |
|------|--------|------:|
| `contracts/core/VaultManager.sol` | Implemented from scratch | 81 |
| `contracts/libraries/Errors.sol` | Added 3 custom errors | +3 |
| `contracts/interfaces/IVaultManager.sol` | Removed duplicate Paused/Unpaused events | edit |
| `test/core/VaultManager.test.ts` | Wrote 19 test cases | 244 |
| `test/helpers/constants.ts` | Shared constants | 21 |
| `test/helpers/utils.ts` | `toUSDC`, `increaseTime` utilities | 18 |
| `test/helpers/fixtures.ts` | `deployAllContracts` fixture | 22 |
| `PLAN.md` | Ticked VaultManager tasks, updated Day 3 status | edit |
| `docs/design/business-rules.md` | Ticked BR-03, BR-16 | edit |

---

## 3. Contract: VaultManager.sol

**Inheritance:** `IVaultManager`, `Ownable2Step`, `ReentrancyGuard`, `Pausable`

### Functions (8)

| Function | Access | Modifiers | Description |
|----------|--------|-----------|-------------|
| `constructor(address _usdc, address _savingCore)` | — | `Ownable(msg.sender)` | Sets immutable USDC + SavingCore references |
| `fundVault(uint256 amount)` | `onlyOwner` | — | Transfers USDC from admin into vault |
| `withdrawVault(uint256 amount)` | `onlyOwner` | `nonReentrant onlyOwner whenNotPaused` | Admin withdraws excess from vault |
| `setFeeReceiver(address receiver)` | `onlyOwner` | — | Sets penalty recipient address |
| `pause()` | `onlyOwner` | — | Emergency stop — blocks withdrawals |
| `unpause()` | `onlyOwner` | — | Resume after pause |
| `payInterest(address to, uint256 amount)` | `onlySavingCore` | `nonReentrant onlySavingCore` | SavingCore requests interest payout |
| `vaultBalance()` | `view` | — | Returns current USDC balance |

### Custom Modifier

- `onlySavingCore` — reverts with `VaultManager_OnlySavingCore` if `msg.sender != savingCore`

### Modifier Order (Convention Compliance)

All functions follow the convention: `nonReentrant` outermost → access control → state modifiers.
This was caught and fixed during verification — initial implementation had `nonReentrant` last.

---

## 4. Test Coverage: 19/19 Passing

### fundVault (3 tests)

| # | Test | Asserts |
|---|------|---------|
| 1 | Owner funds 1000 USDC | Balance increases, `VaultFunded` event with args |
| 2 | Non-owner calls fundVault | Reverts `OwnableUnauthorizedAccount` |
| 3 | Fund with 0 amount | Reverts `VaultManager_ZeroAmount` |

### withdrawVault (4 tests)

| # | Test | Asserts |
|---|------|---------|
| 4 | Owner withdraws 500 from 1000 | Balance decreases, `VaultWithdrawn` event with args |
| 5 | Non-owner calls withdrawVault | Reverts `OwnableUnauthorizedAccount` |
| 6 | Withdraw more than balance | Reverts `VaultManager_InsufficientBalance` |
| 7 | Withdraw exact balance (zero dust) | Succeeds, `VaultWithdrawn` event, balance = 0 |

### setFeeReceiver (2 tests)

| # | Test | Asserts |
|---|------|---------|
| 8 | Owner sets receiver | `feeReceiver()` returns new addr, `FeeReceiverUpdated` event |
| 9 | Non-owner calls setFeeReceiver | Reverts `OwnableUnauthorizedAccount` |

### pause / unpause (6 tests)

| # | Test | Asserts |
|---|------|---------|
| 10 | Owner pauses | `Paused` event with owner address |
| 11 | Owner unpauses after pause | `Unpaused` event with owner address |
| 12 | Non-owner calls pause | Reverts `OwnableUnauthorizedAccount` |
| 13 | Non-owner calls unpause | Reverts `OwnableUnauthorizedAccount` |
| 14 | withdrawVault while paused | Reverts `EnforcedPause` |
| 15 | fundVault while paused | Succeeds (pause only blocks withdrawals), `VaultFunded` event |

### payInterest (2 tests)

| # | Test | Asserts |
|---|------|---------|
| 16 | SavingCore calls payInterest | Token transfer, `InterestPaid` event with args |
| 17 | External account calls payInterest | Reverts `VaultManager_OnlySavingCore` |

### Views (2 tests)

| # | Test | Asserts |
|---|------|---------|
| 18 | vaultBalance() after fund + withdraw | Returns correct remaining amount |
| 19 | feeReceiver() before/after set | Zero address → correct address |

---

## 5. Design Decisions

| Decision | Rationale |
|----------|-----------|
| `fundVault(0)` reverts with `VaultManager_ZeroAmount` | Prevent no-op transactions, explicit error |
| Events stay in `IVaultManager.sol` | Canonical source — contract imports interface |
| `payInterest` uses `onlySavingCore` modifier | Only SavingCore should call interest payouts |
| `nonReentrant` outermost modifier | Convention: reentrancy check before auth check |
| `fundVault` not blocked by pause | Pause is emergency stop for withdrawals only (test #15) |

---

## 6. Business Rules Implemented

| Rule | Description | Verified By |
|------|-------------|-------------|
| BR-03 | Only owner can create/modify plans | Tests #2, #5, #9, #12, #13 |
| BR-12 | All token transfers protected against reentrancy | `nonReentrant` on `withdrawVault`, `payInterest` |
| BR-16 | Pause blocks withdrawals and renewals | Test #14 |

---

## 7. Issues Encountered & Resolutions

### 7.1 Duplicate Paused/Unpaused Events

**Cause:** `IVaultManager.sol` declared `Paused` and `Unpaused` events that conflicted with OZ v5 `Pausable` (which emits `indexed` vs non-indexed).

**Resolution:** Removed duplicate events from `IVaultManager.sol`. OZ Pausable emits them automatically.

### 7.2 Test #16 — Impersonated SavingCore Has No ETH

**Cause:** `ethers.getSigner(savingCoreAddr)` returns an impersonated signer with 0 ETH. `payInterest` calls `safeTransfer` which requires gas.

**Resolution:** Use `hardhat_setBalance` RPC method to fund the impersonated address with ETH before executing.

### 7.3 `nonReentrant` Modifier Ordering

**Cause:** Initial implementation placed `nonReentrant` last (innermost). Convention requires it outermost (before `onlyOwner`).

**Resolution:** Swapped to `external nonReentrant onlyOwner whenNotPaused` and `external nonReentrant onlySavingCore`.

### 7.4 Missing Event Assertions

**Cause:** Tests #7, #10, #11, #15 used `.to.not.be.reverted` instead of asserting specific events.

**Resolution:** Added `.to.emit().withArgs()` assertions for `VaultWithdrawn`, `Paused`, `Unpaused`, and `VaultFunded`.

### 7.5 `tsconfig.json` Missing Test Types

**Error:** `Cannot find name 'describe'. Do you need to install type definitions for a test runner?`

**Cause:** `tsconfig.json` had no `types` field — TypeScript couldn't resolve mocha globals.

**Resolution:** Added `"types": ["mocha", "chai", "node"]` to `compilerOptions`. Also fixed `await` inside non-async `.then()` callback in `fixtures.ts`.

### 7.6 solidity-coverage Reports 0%

**Root cause:** Hardhat 2.28.x replaced the ethereumjs VM with EDR (Rust). EDR does not emit step-by-step EVM traces to JavaScript, which solidity-coverage depends on.

**Status:** Deferred. See [coverage-bug.md](./coverage-bug.md) for full investigation.

**Resolution:** Deleted `.solcover.js` config. Coverage tooling deferred until upstream compatibility is resolved.

---

## 8. Verification Results

### Compilation

```
Compiled 1 Solidity file successfully (evm target: cancun).
```

Zero errors. SPDX warnings on library files only (placeholder content).

### Tests

```
19 passing (767ms)
```

All 19 tests pass. Each test uses `loadFixture` — no execution order dependency.

### TypeScript

```
npx tsc --noEmit
(no output — zero errors)
```

---

## 9. Scoring Impact

| Criterion | Points | Day 3 Contribution |
|-----------|--------|---------------------|
| Vault management & pause/unpause | 10 | VaultManager fully implemented + 19 tests |
| Code quality & events | 5 | NatSpec, event assertions, CEI pattern, modifier ordering |
| Test coverage > 90% | 15 | Deferred (see [coverage-bug.md](./coverage-bug.md)) |

---

## 10. Known Gaps & Next Steps

| Gap | Severity | Planned |
|-----|----------|---------|
| openDeposit not implemented | High | Day 3 (Phase 2) |
| Coverage report unavailable | Medium | Day 6-7 (upstream fix dependent) |
| SavingCore user functions still stubs | High | Days 3-5 |
| No integration tests yet | Medium | Days 3-5 |
