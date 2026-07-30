# Online Saving System

Blockchain Programming Final Assignment

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Project Structure](#3-project-structure)
4. [Personal Variant](#4-personal-variant)
5. [Getting Started](#5-getting-started)
6. [Business Rules](#6-business-rules)
7. [Contract APIs](#7-contract-apis)
8. [Design Decisions](#8-design-decisions)
9. [Security Notes](#9-security-notes)
10. [Bonus Features](#10-bonus-features)

Quick check: See PLAN.md

---

# 1. Overview

The Online Saving System is a decentralized banking application built on Ethereum.

The system allows users to:

- Create fixed-term saving deposits.
- Earn interest after maturity.
- Withdraw early with a penalty.
- Automatically renew deposits.
- Receive an ERC721 certificate representing each deposit.

There are two main roles:

- **Admin** – manages saving plans and vault liquidity.
- **Depositor** – opens and manages saving deposits.

---

# 2. System Architecture

The project consists of three main contracts.

| Contract | Responsibility |
|----------|----------------|
| MockUSDC | ERC20 token used for testing |
| SavingCore | Main business logic, hold user principal |
| VaultManager | Holds funds and pays interest |

More details can be found in:

- docs/design/system-architecture.md
- docs/diagrams/sequence-diagram.md
- docs/diagrams/activity-diagram.md

---

# 3. Project Structure

See:

- docs/audit/folder-structure.md

---

# 4. Personal Variant (for AppCyclone mentor)

**Student ID:** `...38`

| Item | Formula | Value |
|------|---------|------:|
| A (last digit) | 8 | 8 |
| B (second last digit) | 3 | 3 |
| Grace Period | (A mod 3) + 2 | **4 days** |
| Default APR | 200 + A × 25 | **400 bps (4.00%)** |
| Early Withdrawal Penalty | 300 + B × 50 | **450 bps (4.50%)** |
| Default Tenor | B odd → 180 days | **180 days** |

---

# 5. Getting Started

## Install dependencies

```bash
npm install
```

## Compile

```bash
npx hardhat compile
```

## Quick Start (one command)

```bash
npm run program
```

> This is a custom script defined in `package.json` — not a built-in npm command. It uses `concurrently` + `wait-on` to orchestrate the 3 services.

This single command starts everything in one terminal:
1. **Hardhat node** — local Ethereum blockchain on `:8545`
2. **Deploy + seed** — deploys contracts and populates demo data
3. **Frontend** — Vite dev server on `http://localhost:3000`

It replaces the manual 3-terminal setup (`npx hardhat node` + `npm run deploy-seed` + `cd frontend && npm run dev`). Output is labeled with `[SmartContract]` and `[Frontend]` prefixes.

---

## Run tests

```bash
npx hardhat test
```

## Coverage

```bash
npx hardhat coverage
```

---

# 6. Business Rules

The complete business rules are documented in:

- docs/design/business-rules.md

This document defines:

- Business constraints
- Security purpose of each rule
- Expected implementation
- Verification strategy

---

# 7. Contract APIs

Contract APIs are documented in:

- docs/design/contract-api.md

---

# 8. Design Decisions (for AppCyclone mentor)

## Q1 — Transferable Certificate

The deposit NFT (ERC721) is transferable by default. If Alice sells her NFT to
Bob before maturity, **Bob** can withdraw — the contract checks the current
NFT owner, not the original depositor.

**Exact location:** `SavingCore.sol:206`:
`if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();`

The check is now extracted into an `onlyDepositOwner(depositId)` modifier (line 205–208)
and applied to `withdrawAtMaturity`, `claimPrincipal`, `claimInterest`, `earlyWithdraw`,
`renewDeposit`. The modifier calls `ownerOf(depositId)` which always returns
the current token holder. After Alice calls `transferFrom(alice, bob, depositId)`, Bob
becomes `ownerOf(depositId)` and can call `withdrawAtMaturity`, `earlyWithdraw`,
`claimPrincipal`, `claimInterest`, or `renewDeposit`. Alice loses all rights
— she cannot withdraw, and any attempt reverts.

**Is this dangerous?** This is **intentional and beneficial**. The NFT acts as
a bearer instrument: transferring the NFT transfers the right to the deposit.
This enables secondary markets for term deposits — a user can sell a
high-APR deposit before maturity without breaking the contract. The risk (Alice
sells then tries to withdraw) is mitigated by the atomicity of OZ ERC721
`transferFrom`: Bob receives the NFT only after Alice loses it, so there is no
window for double-claiming.

**Verified by:** test #11 in `withdrawAtMaturity` — a non-NFT-owner calling
`withdrawAtMaturity` reverts, confirming that only the current `ownerOf`
holder can act on the deposit.

## Q2 — Empty Vault

At maturity, if the vault has fewer USDC tokens than the interest owed,
`withdrawAtMaturity` reverts — and the user cannot withdraw **at all**, not
even their own principal.

**Exact call chain:** `SavingCore.withdrawAtMaturity` (line 245) calls
`vaultManager.payInterest(msg.sender, interest)`. Inside `VaultManager.payInterest`
(line 78), `usdc.safeTransfer(to, amount)` attempts to move USDC from the vault
to the user. If the vault balance is less than `amount`, the ERC20 token reverts
with `ERC20InsufficientBalance` — a standard OpenZeppelin error, not a custom one.

**Problem for the user:** The principal is held by SavingCore (not the vault),
so it IS available. But because the vault cannot pay the interest, the entire
transaction reverts — the user's own money is locked until the admin tops up
the vault. This is unfair: the user fulfilled the contract, yet cannot access
their funds due to the bank's failure to fund the vault.

**Our design choice:** **Revert** (base spec). Justification:
1. Paying principal-only without interest creates accounting complexity — a
   `pendingInterest` debt must be tracked, claimed, and reconciled (this is
   exactly the C1 creative challenge).
2. For v1, revert is simpler and forces the admin to keep the vault funded.
   The admin is the bank — maintaining sufficient vault balance is their
   responsibility.

**Alternative (C1 — "Principal is always safe"):** Pay principal immediately
to the user, record the interest as `pendingInterest`, and let the user claim
it later when the vault is funded. This protects the user but requires a new
mapping, a claim function, and a solvency guard to prevent the vault from
paying out more than it holds.

**Pause philosophy and BR-16 deviation:** Our implementation treats pause as
governing vault-dependent operations, not user principal retrieval. When paused:
`withdrawAtMaturity`, `renewDeposit`, and `autoRenewDeposit` are blocked because
they either commit new funds (renewals compound into fresh terms) or depend on
vault-atomic logic (interest must transfer in the same transaction). However,
`claimPrincipal` and `earlyWithdraw` are NOT blocked — they pay from SavingCore's
own balance with no vault dependency. `claimInterest` IS blocked (vault-dependent).
During pause, `claimPrincipal` defers 100% of interest to `pendingInterest` rather
than attempting partial vault payout — distinguishing routine vault underfunding
(degrade: pay what's available) from an active security incident (block: don't
touch the vault at all, defer everything until the admin unpause and refills it).
Blocking principal retrieval would hold user funds hostage, which we consider a
worse failure mode than a literal reading of BR-16 ("prevents all withdrawals when
paused"). On-chain transparency (`paused()`, `vaultBalance()`, `owner()`) lets
users verify admin behavior and exit before the vault is drained.

**Verified by:** tests #6 and #7 in `withdrawAtMaturity`. Test #6 drains the
vault to 100 units (far less than interest owed) — withdrawal reverts. Test #7
leaves exactly `interest - 1` unit in the vault — even 1 unit short causes a
revert, confirming there is no partial-payment fallback.

## Q3 — Dead Bot

The auto-renew bot goes offline for one month. What happens to deposits
that passed the grace period? Does the user lose anything?

**Answer:** Nothing is lost. Deposits past the grace period remain in
`Active` status — the principal is still held by SavingCore. The user
can always call `withdrawAtMaturity` to get principal + interest back,
or call `renewDeposit` to manually renew into a new plan. The only
inconvenience is that auto-renew did not happen, so the user missed the
compounding opportunity during the offline period.

**Protection:** In our implementation, `autoRenewDeposit` has no owner
check (anyone can call it). So even if the original bot is down, another
bot or the user themselves can trigger auto-renew. The deposit is never
"stuck." Verified by test #1 in `autoRenewDeposit`: any address can
call the function and the deposit renews successfully.

## Q4 — Rounding Dust

Interest is calculated via integer division:
`(principal * aprBps * tenorDays) / (365 * 10_000)`.
Solidity truncates toward zero, so the user receives the slightly smaller
(truncated) interest. The leftover "dust" stays in the vault — it cannot
cause a revert or an incorrect balance. Verified by test #8 in
`withdrawAtMaturity`: an odd principal (10,000,001 units) produces
truncated interest, and the vault retains the 1-unit dust.

## Q5 — Boundary Operators (maturityAt)

The withdrawal check uses `block.timestamp < deposit.maturityAt` to revert
("not yet mature"). This means at the exact `maturityAt` second, the
condition is false and withdrawal is allowed — the `>=` semantics. This is
justified because at the precise second the term ends, the user has fulfilled
the contract and should receive principal + interest without penalty.
Verified by test #1 in `withdrawAtMaturity`: `evm_setNextBlockTimestamp`
set to exactly `maturityAt`, withdrawal succeeds.

## Q6 — Disabled Plan with Active Deposits

The admin disables a plan while many deposits from that plan are still
active. What can those users still do? Can they still manually renew
INTO the disabled plan?

**Answer:** Users can always `withdrawAtMaturity` and `earlyWithdraw`
regardless of plan status — these functions only check the deposit's
status, not the plan's `enabled` flag. This is correct per BR-11:
"A disabled plan does not affect existing deposits."

For **manual renew** (`renewDeposit`): users CANNOT renew INTO a
disabled plan. The function checks `plans[newPlanId].enabled` and
reverts with `PlanNotEnabled` if disabled. This is a deliberate choice —
disabling a plan means the admin does not want new deposits, and a renew
creates a new deposit with new parameters. Users can always withdraw at
maturity and manually open a new deposit into an enabled plan instead.
Verified by test #9 in `renewDeposit`: disabling the target plan causes
the revert.

For **auto renew** (`autoRenewDeposit`): auto-renew uses the old plan's
parameters (same tenor, locked APR). If the old plan is disabled,
auto-renew still works because it reads parameters from the old deposit's
snapshot, not from the plan. The user is never penalized for admin actions
after deposit. Verified by test #3 in `autoRenewDeposit`: updating the
plan APR does not affect the auto-renewed deposit.

## Q7 — Attack Thinking (Reentrancy)

**Attack:** A malicious contract receives USDC during a withdrawal and tries to
call `withdrawAtMaturity` again before the first call completes. If successful,
it could drain the contract by withdrawing the same deposit multiple times.

**Defense 1 — `nonReentrant` modifier:** Every user-facing function
(`withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`,
`claimPrincipal`, `claimInterest`) is protected by OpenZeppelin's `ReentrancyGuard`.
The `nonReentrant` modifier sets a lock (`_status = _ENTERED`) before execution.
Any re-entrant call detects the lock and reverts with `ReentrancyGuardReentrantCall`.
Verified by tests R1–R5 in `SavingCore.test.ts` and `VaultManager.test.ts`, which deploy
`ReentrantAttacker.sol` — a malicious contract that attempts re-entry during the
USDC transfer callback via `ReentrantToken`.

**Defense 2 — Checks-Effects-Interactions (CEI):** State is updated BEFORE
external calls. In `withdrawAtMaturity` (`SavingCore.sol:258`),
`deposits[depositId].status = Status.Withdrawn` is set before `safeTransfer` at
line 260. Even without `nonReentrant`, the double-withdraw would be blocked by
the `AlreadyWithdrawn` check at line 249.

---

# 9. Security Notes

Security considerations will be documented in:

- docs/audit/audit-notes.md

Topics include:

- Access Control
- Reentrancy
- Input Validation
- Custom Errors
- Gas Optimization

---

# 10. Bonus Features (for AppCylone mentor)

## C1 — Principal is always safe

**Problem:** In the base spec, `withdrawAtMaturity` reverts when the vault cannot
pay interest — locking the user's own principal in SavingCore forever. The user
fulfilled the contract, yet cannot access their money due to the bank's failure
to fund the vault.

**Solution:** Added `claimPrincipal(depositId)` — a function **without**
`whenNotPaused` that pays principal immediately from SavingCore's balance and
records any unpaid interest as `pendingInterest`. Users call `claimInterest`
later when the vault is funded. A single `claimInterest(depositId)` handles two
paths: Active deposit → full interest claim at maturity; non-Active deposit →
remaining pending interest from a previous `claimPrincipal`.

**Pause design:** `claimPrincipal` and `earlyWithdraw` have no `whenNotPaused`
modifier — see Q2 for the full rationale. `claimInterest` IS blocked when paused
(vault-dependent). During pause, `claimPrincipal` defers all interest to
`pendingInterest` rather than touching the vault, ensuring the user always
receives their principal even if the admin key is compromised.

**Verified by:** 18 tests in `SavingCore.c1.test.ts` and 15 tests in
`SavingCore.interestClaim.test.ts`.

---

## C2 — Solvency Guard

**Problem:** The base spec lets the admin drain the vault at any time via
`withdrawVault`. Deposits that were safe yesterday can become unpayable today
— the admin can withdraw money already "promised" as interest to active
deposits.

**Solution:** Added `totalOwedInterest` tracking in `SavingCore` — a `uint256`
updated on every deposit action. `withdrawVault` in `VaultManager` now checks
this value: only `balance - totalOwedInterest` is withdrawable, protecting
the interest buffer.

Functions that update `totalOwedInterest`:
- `_createDeposit` — increments by the deposit's calculated interest
- `withdrawAtMaturity` — decrements (interest paid from vault)
- `earlyWithdraw` — decrements (interest forfeited, no longer owed)
- `claimInterest` — decrements by the paid portion (partial payment supported)
- `_collectRenewalPrincipal` — decrements old interest (compounded into new deposit)

`claimPrincipal` intentionally does **not** decrement — the interest moves to
`pendingInterest` and is still owed by the vault. The accounting is safe
because `withdrawAtMaturity` and `earlyWithdraw` are atomic (any revert rolls
back the decrement), and `_calcInterest` is deterministic per depositId
(reads only immutable snapshots).

**Frontend:** `AdminTab.tsx` caps the withdraw amount at `surplus` (vault
balance minus total owed), enforcing the same guard in the UI.

**Verified by:** 9 tests in `SavingCore.c2.test.ts` covering success, revert
when over surplus, per-function accounting, and a multi-step chain (deposit →
`claimPrincipal` → partial `claimInterest` → `fundVault` → full
`claimInterest` → `totalOwedInterest = 0`).



