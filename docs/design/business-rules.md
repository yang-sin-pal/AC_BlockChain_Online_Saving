# Business Rules

This document defines the core business rules of the Online Saving System.

Each rule describes:

- the business requirement,
- what it protects,
- how it should be implemented,
- how it should be verified,
- the source requirement in `assignment.md`.

---

| ID | Business Rule | Protects | Implementation | Verification | Source |
|----|---------------|----------|----------------|--------------|--------|
| BR-01 | Deposit amount must be within the plan's minimum and maximum limits. | Prevent invalid deposits. | Validate `minDeposit <= amount <= maxDeposit`. | Unit test valid and invalid deposit amounts. | §3.1 point 3 |
| BR-02 | Users can only open deposits for enabled plans. | Prevent using inactive plans. | Check `plan.enabled`. | Attempt to deposit into a disabled plan. | §3.1 point 3 |
| BR-03 | Only the owner can create or modify saving plans. | Prevent unauthorized administration. | `onlyOwner` modifier. | Non-owner transaction must revert. | §4 Admin Functions |
| BR-04 | Deposit parameters (APR and penalty) are fixed when a deposit is opened. | Existing deposits are unaffected by future plan updates. | Store APR and penalty inside `Deposit`. | Update a plan and verify existing deposits remain unchanged. | §3.1 point 7, §6 Rule 1 |
| BR-05 | Each successful deposit must mint exactly one ERC721 certificate. | Ensure ownership tracking. | `_safeMint()` once per deposit. | Verify NFT ownership and mint event. | §3.1 point 5 |
| BR-06 | Only the certificate owner can withdraw or renew a deposit. | Prevent unauthorized access. | `ownerOf(tokenId) == msg.sender`. | Non-owner transaction must revert. | §3.2, §3.3, §3.4 (implied) |
| BR-07 | A deposit cannot be withdrawn more than once. | Prevent double spending. | Update deposit status before transferring funds. | Second withdrawal must revert. | §10 Hints |
| BR-08 | Early withdrawal applies the configured penalty and pays zero interest. | Ensure penalty enforcement. | Calculate penalty using stored value; set interest = 0. | Compare payout before maturity. | §3.3, §6 Rule 3 |
| BR-09 | Mature withdrawal returns principal plus simple interest. | Ensure correct interest payment. | Calculate using simple interest formula: `(principal * aprBps * tenorDays) / (365 * 10_000)`. See `InterestLib.sol`. | Compare expected and actual payout. | §3.2, §6 Rule 2 |
| BR-10 | Vault must have sufficient balance before paying users. | Prevent failed payouts or insolvency. | Check vault balance before transfer; revert if insufficient. | Simulate insufficient vault balance. | §6 Rule 5 |
| BR-11 | A disabled plan does not affect existing deposits. | Preserve user rights after plan updates. | Only block new deposits. | Existing deposits remain withdrawable. | §6 Rule 7 |
| BR-12 | All token transfers must be protected against reentrancy. | Prevent reentrancy attacks. | `ReentrancyGuard`. | Reentrancy attack test. | §10 Hints |
| BR-13 | Manual renew is only allowed on or after maturityAt. It compounds interest into the new principal and mints a new NFT using the new plan's rate. The old deposit status is set to ManualRenewed. | Ensure renew is only possible after term ends; old deposit is properly retired. | Check `block.timestamp >= maturityAt`; calculate interest; new principal = old principal + interest; mint new NFT with newPlanId; update old deposit status. | Attempt renew before maturity (must revert); verify new principal, new plan rate, and old status. | §3.4 |
| BR-14 | Auto-renew is only allowed after the grace period has elapsed since maturity. | Prevent premature auto-renewal. | Check `block.timestamp >= maturityAt + gracePeriod * 86400`. | Attempt auto-renew before grace period ends (must revert). | §3.5, §8.1 |
| BR-15 | Auto-renew preserves the original deposit's APR (aprBpsAtOpen), not the current plan's APR. The tenor is also the same as the original deposit. | Protect users from rate decreases after deposit is opened. | Use stored `aprBpsAtOpen` and `tenorDays` from old deposit, not from plan. | Update plan APR after deposit; verify auto-renew uses old APR. | §3.5, §6 Rule 4 |
| BR-16 | When the system is paused, no withdrawals or renewals (manual or auto) are allowed. VaultManager pause also blocks `payInterest` — no money leaves the vault during emergency. | Emergency protection against exploits or unexpected behavior. | Check `_paused()` before withdraw and renew functions; revert if paused. VaultManager pause blocks `withdrawVault` and `payInterest`. | Pause system; attempt withdraw, renew, and interest payment (all must revert). | §6 Rule 6 |
| BR-17 | Early withdrawal penalty is sent to the feeReceiver address set by the admin. | Ensure penalties are properly collected. | Transfer penalty amount to `feeReceiver`; revert if feeReceiver is not set. | Verify feeReceiver balance increases by penalty amount. | §3.3, §4 setFeeReceiver |
| BR-18 | User can always claim principal after maturity, regardless of vault balance (C1). | Principal safety is paramount — users can always reclaim their principal. | `claimPrincipal()` has no `whenNotPaused` modifier. Calculates interest and stores in `pendingInterest`. | Attempt claimPrincipal when vault is empty — should succeed. | §8.3 C1 |
| BR-19 | Interest can be claimed separately with partial vault payment support (C1). | Users get interest when vault has funds; remainder stored as pending for retry. | `claimInterest()` checks vault balance. If vault >= interest → pays full. If vault < interest → pays partial, stores remainder in `pendingInterest`. | Simulate partial vault balance; verify partial payment and pending storage. | §8.3 C1 |
| BR-20 | Renewal is allowed from `PrincipalClaimed` status. | Users can still renew even after claiming principal. | `renewDeposit()` and `autoRenewDeposit()` allow `PrincipalClaimed` status. Uses remaining principal only. | Renew a deposit after principal claim; verify new deposit has correct principal. | §8.3 C1 |
| BR-21 | NFT cannot be burned if `pendingInterest > 0`. | Prevent losing track of unpaid interest. | `_update()` override reverts with `SavingCore_PendingInterestExists()` when `pendingInterest[tokenId] > 0` and transfer is to address(0). | Attempt to burn NFT with pending interest — should revert. | §8.3 C1 |

---

# Rule Lifecycle

```text
Business Rule
        │
        ▼
Implementation
        │
        ▼
Unit Test
        │
        ▼
Integration Test
```

Every business rule should have at least one corresponding test case.

---

# Implementation Checklist

| Rule | Status | Code | Search |
|------|--------|------|--------|
| BR-01 | ☑ | `SavingCore.sol:223-226` | `minDeposit`, `maxDeposit` checks in `openDeposit` |
| BR-02 | ☑ | `SavingCore.sol:221` | `plan.enabled` check in `openDeposit` |
| BR-03 | ☑ | `SavingCore.sol:62,89,98,106,113,118` `VaultManager.sol:36,43,51,59,65,70` | `onlyOwner` |
| BR-04 | ☑ | `SavingCore.sol:149-150` | `aprBpsAtOpen`, `penaltyBpsAtOpen` snapshot in `_createDeposit` |
| BR-05 | ☑ | `SavingCore.sol:155` | `_safeMint` in `_createDeposit` |
| BR-06 | ☑ | `SavingCore.sol:205-213` | `onlyDepositOwner` modifier in `withdrawAtMaturity`, `claimPrincipal`, `claimInterest`, `earlyWithdraw`, `renewDeposit`, `burn` |
| BR-07 | ☑ | `SavingCore.sol:248,250,361` | `status` check in `withdrawAtMaturity`, `claimPrincipal`, `earlyWithdraw` |
| BR-08 | ☑ | `SavingCore.sol:367-368,375` | Penalty calc + interest=0 in `earlyWithdraw` |
| BR-09 | ☑ | `InterestLib.sol:12-20`, `SavingCore.sol:165-173` | `calculateInterest` in `_calcInterest` |
| BR-10 | ☑ | `VaultManager.sol:77-79` | `payInterest` reverts on insufficient vault balance |
| BR-11 | ☑ | `SavingCore.sol:245,358` | `withdrawAtMaturity`, `earlyWithdraw` do NOT check plan.enabled — existing deposits unaffected |
| BR-12 | ☑ | `SavingCore.sol:217,245,272,304,358,385,431` | `nonReentrant` on all user-facing functions |
| BR-13 | ☑ | `SavingCore.sol:385-429` | `renewDeposit`: owner check, maturity check, interest calc, compound, new plan params |
| BR-14 | ☑ | `SavingCore.sol:437-438` | `autoRenewDeposit`: `block.timestamp < gracePeriodEnd` reverts `GracePeriodNotElapsed` |
| BR-15 | ☑ | `SavingCore.sol:443,453-456` | `autoRenewDeposit`: uses `oldDeposit.aprBpsAtOpen` and old tenor, not current plan |
| BR-16 | ☑ | `SavingCore.sol:113-120` `VaultManager.sol:51,77` | `pause()`/`unpause()` on both contracts; `whenNotPaused` on `withdrawVault`, `payInterest`, `withdrawAtMaturity`, `claimInterest`, `renewDeposit`, `autoRenewDeposit` |
| BR-17 | ☑ | `SavingCore.sol:365,375` | `feeReceiver` check + `safeTransfer` penalty in `earlyWithdraw` |
| BR-18 | ☑ | `SavingCore.sol:270-302` | `claimPrincipal`: no `whenNotPaused`, stores interest as `pendingInterest`, status → `PrincipalClaimed` |
| BR-19 | ☑ | `SavingCore.sol:304-347` | `claimInterest`: partial vault payment, Path A (Active) and Path B (PrincipalClaimed) |
| BR-20 | ☑ | `SavingCore.sol:393,405` | `renewDeposit` allows `PrincipalClaimed` status via `_collectRenewalPrincipal` |
| BR-21 | ☑ | `SavingCore.sol:46-58` | `_update()` override reverts when `pendingInterest[tokenId] > 0` and transfer is to address(0) |
