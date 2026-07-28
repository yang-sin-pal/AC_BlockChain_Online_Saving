# Audit Notes

> Security observations and design decisions for `SavingCore.sol` and `VaultManager.sol`.
> Verified against 142 passing unit tests.

---

## 1. Access Control

| Function | Access | Mechanism | Notes |
|----------|--------|-----------|-------|
| `createPlan`, `updatePlan`, `enablePlan`, `disablePlan` | Contract admin | `onlyOwner` (OZ `Ownable2Step`) | — |
| `pause`, `unpause` | Contract admin | `onlyOwner` | — |
| `fundVault`, `withdrawVault`, `setFeeReceiver`, `setSavingCore` | Contract admin | `onlyOwner` (VaultManager) | — |
| `openDeposit` | Anyone | — | — |
| `withdrawAtMaturity`, `claimPrincipal`, `claimInterest`, `earlyWithdraw`, `renewDeposit` | NFT holder | `onlyDepositOwner(depositId)` modifier | Checks `msg.sender == ownerOf(depositId)` |
| `autoRenewDeposit` | Anyone | — | Bot-triggerable by design (§3.5) |

**Finding:** Two distinct "owner" concepts exist — contract admin (`onlyOwner`) vs NFT deposit holder (`onlyDepositOwner`). These must not be confused. `autoRenewDeposit` is intentionally open to anyone.

---

## 2. Reentrancy Protection

All external state-changing functions use `nonReentrant` from OpenZeppelin's `ReentrancyGuard`:
- `openDeposit`, `withdrawAtMaturity`, `claimPrincipal`, `claimInterest`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`

**Verified:** Reentrancy tests confirm `ReentrancyGuardReentrantCall` on all attack surfaces (`SavingCore.reentrancy.test.ts`).

---

## 3. CEI (Checks-Effects-Interactions)

All functions follow CEI — state is updated before external calls:

| Function | State update before | External calls after |
|----------|--------------------|--------------------|
| `withdrawAtMaturity` | `status = Withdrawn` | `safeTransfer`, `payInterest` |
| `claimPrincipal` | `status = Withdrawn` or `PrincipalClaimed`, `pendingInterest = interest` | `safeTransfer` |
| `claimInterest` | `pendingInterest`, `interestClaimed`, `status` | `payInterest` |
| `earlyWithdraw` | `status = Withdrawn` | `safeTransfer` × 2 |
| `renewDeposit` | `status = ManualRenewed` | `_createDeposit` (mint) |
| `autoRenewDeposit` | `status = AutoRenewed` | `_createDeposit` (mint) |

---

## 4. Principal Safety (C1)

`claimPrincipal` has **no `whenNotPaused` modifier** — users can always recover their principal regardless of system state. Interest is stored as `pendingInterest` for later claim when the system resumes.

**Tested:** `SavingCore.c1.test.ts` — 18 tests covering:
- Principal paid when paused
- Interest deferred to pending when vault is empty or paused
- Partial vault payment with retry

---

## 5. Interest Double-Pay Prevention

Three mechanisms prevent interest from being paid twice:

1. **`interestClaimed` flag** — set to `true` only on full payment. `claimInterest` checks this before any calculation.
2. **`pendingInterest` mapping** — cleared to 0 on Path B claim. Re-claiming hits `InterestAlreadyClaimed` or `NoPendingInterest`.
3. **`withdrawAtMaturity` specific reverts** — when `interestClaimed=true`, reverts with `UseClaimPrincipal`; when `status=PrincipalClaimed`, reverts with `UseClaimInterest`.

---

## 6. Partial Vault Payment

`claimInterest` gracefully handles insufficient vault balance:
- Pays what the vault has (`payAmount = min(amount, vaultBal)`)
- Stores remainder as `pendingInterest[depositId]`
- `interestClaimed` stays `false` — allows retry after vault is refunded
- When `status == PrincipalClaimed` and full payment completes → status transitions to `Withdrawn`

---

## 7. Renewal from Partial Claim States

Both `renewDeposit` and `autoRenewDeposit` allow renewal when `status == PrincipalClaimed`:
- `_collectRenewalPrincipal` compounds whatever remains (interest only if principal was already claimed)
- Terminal states (`Withdrawn`, `ManualRenewed`, `AutoRenewed`) always revert

---

## 8. Snapshot Immutability

All interest and penalty calculations use values snapshotted at deposit open time:
- `aprBpsAtOpen` — never re-read from `plans[planId].aprBps`
- `penaltyBpsAtOpen` — never re-read from `plans[planId].earlyWithdrawPenaltyBps`
- `plans[deposit.planId].tenorDays` — read for interest formula, but plan changes don't affect existing deposits

**Tested:** `updatePlan` after `openDeposit` → existing deposit uses old APR.

---

## 9. Boundary Conditions

- **`maturityAt` boundary:** `>=` consistently — at the exact maturity second, all maturity-gated functions are allowed (Design Q5).
- **Grace period:** `maturityAt + personalGracePeriod * 86400` — `autoRenewDeposit` requires `>=` this value.
- **Vault insufficient:** `withdrawAtMaturity` reverts (no partial payment). `claimInterest` supports partial payment with retry.
- **Rounding dust:** Integer division truncates interest. Dust stays in vault — no rounding exploit.

---

## 10. Custom Errors

All errors defined in `Errors.sol`, named `ContractName_Reason`. No `require(cond, "string")` used.

| Error | Used by |
|-------|---------|
| `SavingCore_PrincipalAlreadyClaimed` | `claimPrincipal` (double claim) |
| `SavingCore_InterestAlreadyClaimed` | `claimInterest` (double claim) |
| `SavingCore_UseClaimInterest` | `withdrawAtMaturity` (principal already claimed) |
| `SavingCore_UseClaimPrincipal` | `withdrawAtMaturity` (interest already claimed) |
| `SavingCore_NoPendingInterest` | `claimInterest` Path B (empty pending) |

---

## 11. Known Limitations

1. **`withdrawAtMaturity` does NOT support partial payment** — if vault < interest, it reverts entirely. Users should use `claimPrincipal` + `claimInterest` for graceful degradation.
2. **`autoRenewDeposit` mints to `msg.sender`** — if a bot triggers it, the new NFT goes to the bot, not the original depositor. The bot must transfer the NFT back.
3. **`earlyWithdraw` does not check maturity** — allowed at any time, but penalizes the user.
4. **No interest accrual beyond maturity** — interest is calculated once using `tenorDays`, not from `startAt` to `now`.
