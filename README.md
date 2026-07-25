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
| SavingCore | Main business logic |
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

# 4. Personal Variant

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

# 8. Design Decisions

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
(`withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`) is
protected by OpenZeppelin's `ReentrancyGuard`. The `nonReentrant` modifier sets
a lock (`_status = _ENTERED`) before execution. Any re-entrant call detects the
lock and reverts with `ReentrancyGuardReentrantCall`. Verified by tests R1–R5
in `SavingCore.test.ts` and `VaultManager.test.ts`, which deploy
`ReentrantAttacker.sol` — a malicious contract that attempts re-entry during the
USDC transfer callback via `ReentrantToken`.

**Defense 2 — Checks-Effects-Interactions (CEI):** State is updated BEFORE
external calls. In `withdrawAtMaturity` (`SavingCore.sol:188`),
`deposit.status = Status.Withdrawn` is set before `safeTransfer` at line 191.
Even without `nonReentrant`, the double-withdraw would be blocked by the
`AlreadyWithdrawn` check at line 175.

---

# 9. Security Notes

Security considerations will be documented in:

- docs/audit-notes.md

Topics include:

- Access Control
- Reentrancy
- Input Validation
- Custom Errors
- Gas Optimization

---

# 10. Bonus Features

## C1 — Principal Protection

_To be implemented._

---

## C2 — Solvency Guard

_To be implemented._



