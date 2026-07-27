# System Architecture

> **Source:** All architectural decisions derive from `assignment.md` §1, §1.1, §2, §3, §4, §5.

## Overview

The Online Saving System is composed of three main smart contracts. The core principle is **separation of funds**: user principal lives in `SavingCore`, while the bank's interest pool lives in `VaultManager`. Interest is always paid from the vault, never from other users' principal.

> *"SavingCore holds the users' principal. VaultManager holds the bank's interest money. Interest always comes from the vault, never from other users' principal. If you mix these two pools, your design is wrong."* — assignment.md §1.1

```
                         ┌─────────────────────────┐
                         │        MockUSDC          │
                         │   (ERC20, 6 decimals)    │
                         └────────┬────────┬────────┘
                                  │        │
                     user approve │        │ admin approve
                     & transferFrom       & transferFrom
                                  │        │
                                  ▼        ▼
      ┌───────────────────────────┐  ┌──────────────────────────────┐
      │       SavingCore          │  │        VaultManager          │
      │────────────────────────── │  │────────────────────────────  │
      │ Holds: user principal     │  │ Holds: bank's interest pool  │
      │ • openDeposit             │  │ • fundVault / withdrawVault  │
      │ • withdraw (principal)    │  │ • pause/unpause              │
      │ • renew, mint NFT         │  │ • setFeeReceiver             │
      └─────────────┬─────────────┘  └───────────────┬──────────────┘
                    │                                 │
        SavingCore → User                  VaultManager → User
        (returns principal, minus          (pays interest on
         penalty if early)                  withdrawAtMaturity)
                    │                                 │
                    ▼                                 ▼
        -----------------------------------------------------
        |withdraw at maturity:                               |
        |Depositor: principal + interest (2 separate sources)|
        |                                                    | 
        |withdraw early                                      |
        |penalty = (principal * penaltyBpsAtOpen) / 10,000   |
        |Depositor : pricipal - penalty                      |
        |feeReciever: penalty                                |
        -----------------------------------------------------


```

---

## Components

### MockUSDC

> **Source:** assignment.md §1 (table), §1.1 ("Real USDC cannot be minted by you"), §7.1

**Purpose:** Simulate USDC for development and testing. Real USDC cannot be minted by you — you need a test token with the same 6 decimals to find decimal bugs early. (§1.1)

**Responsibilities:**

- ERC20 token with **6 decimals** — 1 USDC = 1,000,000 units. (§1 table, §10 tips)
- Public mint function for testing. (§1.1: "anyone can mint it for testing")
- Used only in local testing. (§7.1: "ERC20 token, 6 decimals, mintable for testing")

---

### SavingCore

> **Source:** assignment.md §1 (table), §1.1, §2.1, §2.2, §3, §4, §5, §6, §7.1

**Purpose:** All business logic of the saving system. This is the only contract users interact with directly. (§1 table: "All business logic: plans, open deposit, withdraw, renew (manual + auto), and the ERC721 certificate NFT")

**Responsibilities:**

| Responsibility | Source |
|----------------|--------|
| Plan management: create, update (APR only), enable/disable | §4: createPlan, updatePlan, enablePlan/disablePlan |
| Open deposit: validate plan & amount, transfer tokens, mint NFT | §3.1 points 1-6 |
| Withdraw at maturity: calculate simple interest, pay from vault | §3.2, §6 Rule 2 |
| Early withdrawal: apply penalty, zero interest, send to feeReceiver | §3.3, §6 Rule 3 |
| Manual renew: after maturity, compound interest, new plan rate | §3.4 |
| Auto renew: after grace period, original APR locked, same tenor | §3.5, §6 Rule 4 |
| Claim principal (C1): claim principal without vault dependency, store interest as pending | §8.3 C1 |
| Claim interest (C1): claim interest separately, partial vault payment support | §8.3 C1 |
| Burn NFT: burn certificate after withdrawal, blocked if pending interest exists | §2.2, §3.1 point 5 |
| Pause/unpause: emergency stop for renew/withdraw flows | §4, §6 Rule 6 |
| ERC721 certificates: one NFT per deposit, status tracking | §2.2, §3.1 point 5, §7.1 |
| Holds user principal: separate from vault | §1.1 key idea |

**Admin functions (restricted):**

| Function | Description | Source |
|----------|-------------|--------|
| `createPlan(...)` | Create plan with tenor, APR, limits, penalty | §4 |
| `updatePlan(planId, newAprBps)` | Change APR (only affects new deposits) | §4, §6 Rule 1 |
| `enablePlan(planId)` | Toggle plan availability on | §4 |
| `disablePlan(planId)` | Toggle plan availability off | §4, §6 Rule 7 |

---

### VaultManager

> **Source:** assignment.md §1 (table), §1.1, §3.2, §4, §6 Rule 5, §7.1

**Purpose:** Hold the bank's interest money, separate from user principal. Provides all admin controls for fund management. (§1.1: "Holds the bank's own money (the interest pool). Admin can fund it, withdraw from it, set the fee receiver, and pause the system.")

**Responsibilities:**

| Responsibility | Source |
|----------------|--------|
| Hold liquidity: stores interest pool funded by admin | §1.1 table |
| Pay interest: transfer on SavingCore's request | §3.2: "interest is paid from the VaultManager", §6 Rule 5 |
| Solvency check: verify sufficient balance before paying | §6 Rule 5, §10 tips |
| Pause/unpause: emergency stop for vault withdrawals | §4, §6 Rule 6 |

**Admin functions (restricted):**

| Function | Description | Source |
|----------|-------------|--------|
| `fundVault(amount)` | Deposit tokens into the interest pool | §4 |
| `withdrawVault(amount)` | Remove tokens (within safe limits) | §4 |
| `setFeeReceiver(address)` | Set address receiving early-withdrawal penalties | §4 |
| `setSavingCore(address)` | Set SavingCore address (one-shot setter) | §4 |
| `pause()` | Emergency stop — blocks `withdrawVault` | §4, §6 Rule 6 |
| `unpause()` | Resume VaultManager operations | §4, §6 Rule 6 |

**Core-facing functions:**

| Function | Description | Source |
|----------|-------------|--------|
| `payInterest(address to, uint256 amount)` | Transfer interest from vault to recipient (user on withdraw, SavingCore on renew) | §3.2, §6 Rule 5 |
| `feeReceiver() → address` | Return the feeReceiver address (for early withdrawal penalty routing) | §3.3, §4 |
| `vaultBalance() → uint256` | Return current USDC held in the vault | §4, frontend display |

**Note:** `payInterest` has **no** `whenNotPaused` — SavingCore can always pay interest to users even when VaultManager is paused.

---

## Contract Relationships

> **Source:** assignment.md §1.1, §3.1, §3.2, §3.3, §3.4, §3.5

The interaction flow for each major operation:

### Open Deposit

> **Source:** assignment.md §3.1 points 1-6

```
User → approve(SavingCore, amount)              [§3.1 point 1]
            │
            ▼
SavingCore.openDeposit(planId, amount)          [§3.1 point 2]
            │
            ├── Validate: plan enabled, amount within limits  [§3.1 point 3]
            ├── transferFrom(user → SavingCore)              [§3.1 point 4]
            ├── _safeMint(user, depositId)                   [§3.1 point 5]
            ├── maturityAt = block.timestamp + tenorDays * 86400  [§3.1 point 6]
            └── Snapshot APR and penalty                     [§3.1 point 7]
```

### Withdraw at Maturity

> **Source:** assignment.md §3.2, §6 Rules 2, 5

```
User → SavingCore.withdrawAtMaturity(depositId)
            │
            ├── Verify: block.timestamp >= maturityAt        [§3.2]
            ├── Calculate interest (simple interest)         [§3.2 formula]
            ├── Check vault has sufficient balance           [§6 Rule 5]
            ├── SavingCore → transfer(user, principal)       [§3.1 point 4]
            ├── SavingCore → VaultManager.payInterest(user, interest)  [§3.2]
            ├── Update deposit status → Withdrawn           [§3.2]
            └── emit Withdrawn(depositId, owner, principal, interest, isEarly=false)
```

### Early Withdrawal

> **Source:** assignment.md §3.3, §6 Rules 3, 5

```
User → SavingCore.earlyWithdraw(depositId)
            │
            ├── Verify: block.timestamp < maturityAt         [§3.3]
            ├── Calculate penalty: (principal * penaltyBpsAtOpen) / 10000  [§3.3]
            ├── User receives: principal - penalty           [§3.3]
            ├── Transfer penalty to feeReceiver              [§3.3]
            ├── Interest = 0                                 [§3.3, §6 Rule 3]
            ├── Update deposit status → Withdrawn
            └── emit Withdrawn(depositId, owner, principal, interest=0, isEarly=true)
```

### Manual Renew

> **Source:** assignment.md §3.4

```
User → SavingCore.renewDeposit(depositId, newPlanId)
            │
            ├── Verify: block.timestamp >= maturityAt        [§3.4 point 1]
            ├── Calculate interest on old deposit            [§3.4 point 2]
            ├── SavingCore → VaultManager.payInterest(SavingCore, interest)  [§3.2, §6 Rule 5]
            ├── New principal = old principal + interest     [§3.4 point 3]
            ├── _safeMint(user, newDepositId)                [§3.4 point 4]
            ├── Old deposit status → ManualRenewed           [§3.4 point 5]
            └── emit Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId)
```

### Auto Renew (bot-triggered)

> **Source:** assignment.md §3.5, §6 Rule 4, §8.1

```
Bot → SavingCore.autoRenewDeposit(depositId)
            │
            ├── Verify: block.timestamp >= maturityAt + gracePeriod * 86400  [§3.5, §8.1]
            ├── Use original aprBpsAtOpen (NOT current plan) [§3.5, §6 Rule 4]
            ├── Same tenor as original deposit               [§3.5]
            ├── SavingCore → VaultManager.payInterest(SavingCore, interest)  [§3.2, §6 Rule 5]
            ├── New principal = old principal + interest     [§3.5]
            ├── _safeMint(user, newDepositId)                [§3.5]
            ├── Old deposit status → AutoRenewed
            └── emit Renewed(oldDepositId, newDepositId, newPrincipal, samePlanId)
```

### Claim Principal (C1 — Principal Protection)

> **Source:** assignment.md §8.3 C1

```
User → SavingCore.claimPrincipal(depositId)
            │
            ├── Verify: block.timestamp >= maturityAt       [§8.3 C1]
            ├── Verify: interestClaimed == false            [§8.3 C1]
            ├── Calculate interest (simple interest)        [§8.3 C1]
            ├── Store interest in pendingInterest[depositId] [§8.3 C1]
            ├── SavingCore → transfer(user, principal)      [§8.3 C1]
            ├── If status == Active → status = PrincipalClaimed  [§8.3 C1]
            ├── If status == Withdrawn → status = Withdrawn     [§8.3 C1]
            └── emit Withdrawn(depositId, owner, principal, interest, isEarly=false)
```

**Key design:** No `whenNotPaused` — user can always reclaim principal regardless of pause state.

### Claim Interest (C1 — Partial Vault Payment)

> **Source:** assignment.md §8.3 C1

```
User → SavingCore.claimInterest(depositId)
            │
            ├── Path A (status == Active):
            │       ├── Calculate interest (simple interest)
            │       ├── Check vault balance
            │       ├── If vault >= interest:
            │       │       ├── VaultManager → transfer(user, interest)
            │       │       ├── interestClaimed = true
            │       │       └── status → Withdrawn
            │       └── If vault < interest:
            │               ├── VaultManager → transfer(user, vault_balance)
            │               └── pendingInterest += (interest - vault_balance)
            │
            └── Path B (status == PrincipalClaimed):
                    ├── Check pendingInterest[depositId]
                    ├── If pendingInterest == 0 → revert NoPendingInterest
                    ├── If pendingInterest > 0:
                    │       ├── VaultManager → transfer(user, pendingInterest)
                    │       ├── pendingInterest = 0
                    │       ├── interestClaimed = true
                    │       └── status → Withdrawn
                    └── If vault < pendingInterest:
                            ├── VaultManager → transfer(user, vault_balance)
                            └── pendingInterest -= vault_balance
```

**Key design:** Supports partial vault payment. If vault insufficient, pays what's available and stores remainder for retry.

### Burn NFT

> **Source:** assignment.md §2.2, §3.1 point 5, §8.3 C1

```
User → SavingCore.burn(depositId)
            │
            ├── Verify: deposit is withdrawn (status != Active)  [§2.2]
            ├── Verify: pendingInterest[depositId] == 0          [§8.3 C1]
            └── _burn(depositId)                                 [§2.2]
```

**Key design:** Blocked if `pendingInterest > 0` — enforced via `_update()` override to prevent losing track of unpaid interest.

### Admin: Fund Vault

> **Source:** assignment.md §4

```
Admin → approve(VaultManager, amount) → VaultManager.fundVault()
                                            │
                                            └── transferFrom(admin → VaultManager)
```

---

## Fund Separation Principle

> **Source:** assignment.md §1.1 ("Key idea"), §6 Rule 5

This is the most important architectural rule in the system:

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│        SavingCore           │     │       VaultManager          │
│─────────────────────────────│     │─────────────────────────────│
│                             │     │                             │
│  User Principal Pool        │     │  Bank Interest Pool         │
│  (tokens from deposits)     │     │  (funded by admin)          │
│                             │     │                             │
│  → Owned by users           │     │  → Owned by bank            │
│  → Returned on withdraw     │     │  → Pays interest to users   │
│  → Never touches interest   │     │  → Never holds principal    │
│                             │     │                             │
└─────────────────────────────┘     └─────────────────────────────┘
```

**Rules:**

| Rule | Source |
|------|--------|
| Interest **always** comes from `VaultManager`, never from other users' principal | §1.1 key idea |
| If vault has insufficient funds, maturity withdrawal must revert | §6 Rule 5 |
| Admin cannot drain vault if it would break interest obligations | §8.3 C2 (Solvency Guard) |
| User can always get principal back, even if vault is empty | §8.3 C1 (Principal Protection) |

---

## Events

> **Source:** assignment.md §5

All contracts must emit these events for frontend/indexer integration:

| Event | Contract | When | Source |
|-------|----------|------|--------|
| `PlanCreated(planId, tenorDays, aprBps)` | SavingCore | Admin creates a plan | §5 |
| `PlanUpdated(planId, newAprBps)` | SavingCore | Admin updates plan APR | §5 |
| `PlanEnabled(planId)` | SavingCore | Admin enables a plan | §4 |
| `PlanDisabled(planId)` | SavingCore | Admin disables a plan | §4 |
| `DepositOpened(depositId, owner, planId, principal, maturityAt, aprBpsAtOpen)` | SavingCore | User opens a deposit | §5 |
| `Withdrawn(depositId, owner, principal, interest, isEarly)` | SavingCore | User withdraws (maturity, early, or claimPrincipal) | §5 |
| `InterestClaimed(depositId, to, amount)` | SavingCore | User claims interest (C1) | §8.3 C1 |
| `Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId)` | SavingCore | Manual or auto renew | §5 |
| `VaultFunded(from, amount)` | VaultManager | Admin deposits tokens into the vault | §4 |
| `VaultWithdrawn(to, amount)` | VaultManager | Admin withdraws tokens from the vault | §4 |
| `FeeReceiverUpdated(newReceiver)` | VaultManager | Admin sets a new fee receiver address | §4 |
| `InterestPaid(to, amount)` | VaultManager | SavingCore requests interest payout | §3.2, §6 Rule 5 |

**Note:** `Paused` and `Unpaused` events are emitted by OpenZeppelin's `Pausable` internally but are not defined in `Events.sol`.

---

## Design Principles

> **Source:** assignment.md §1.1, §6, §10, §8.2 Q7, §8.3 C1

| Principle | Rationale | Source |
|-----------|-----------|--------|
| **Fund Separation** | User principal and bank interest pool are in separate contracts. Mixing them is a design error. | §1.1 key idea |
| **Snapshot Immutability** | APR and penalty are fixed at deposit open. Admin plan changes never affect existing deposits. | §6 Rule 1, §8.2 Q1 |
| **Admin Cannot Alter Active Deposits** | Once opened, only the certificate owner can withdraw or renew. | §6 Rule 7 |
| **Checks-Effects-Interactions** | Status updates happen before fund transfers to prevent reentrancy. | §8.2 Q7, §10 hints |
| **Interface-First Development** | All contracts implement defined interfaces (`ISavingCore`, `IVaultManager`). | §1.1 table structure |
| **Principal Safety (C1)** | Users can always reclaim principal, even during pauses or when vault is empty. `claimPrincipal` has no `whenNotPaused`. | §8.3 C1 |
| **Partial Vault Payment** | Interest claims support partial payment when vault is insufficient. Remainder stored in `pendingInterest` for retry. | §8.3 C1 |

---

## Dual-Pause Architecture

> **Source:** assignment.md §6 Rule 6, §8.3 C1

The system has **two independent pause states** — one for SavingCore and one for VaultManager. They serve different security purposes and can be toggled independently.

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│         SavingCore.pause()          │     │        VaultManager.pause()         │
│─────────────────────────────────────│     │─────────────────────────────────────│
│ Blocks:                             │     │ Blocks:                             │
│   • withdrawAtMaturity              │     │   • withdrawVault                   │
│   • claimInterest                   │     │                                     │
│   • renewDeposit                    │     │ Does NOT block:                     │
│   • autoRenewDeposit                │     │   • payInterest ( SavingCore can    │
│                                     │     │     always pay interest to users)   │
│ Does NOT block:                     │     │                                     │
│   • claimPrincipal (always safe)    │     └─────────────────────────────────────┘
│   • earlyWithdraw (always safe)     │
│   • burn (no transfers)             │
│   • openDeposit (new deposits OK)   │
└─────────────────────────────────────┘
```

**Why two pause states?**

1. **SavingCore pause** protects users from exploits in renew/withdraw flows while allowing principal reclaim (`claimPrincipal` has no `whenNotPaused`).
2. **VaultManager pause** protects the vault from draining while allowing interest payments to continue (`payInterest` has no `whenNotPaused`).
3. They serve different security purposes and may need to be toggled independently.

---

## Personal Variant (Student ID ending in 38)

> **Source:** assignment.md §8.1

| Parameter | Formula | Computed Value | Source |
|-----------|---------|----------------|--------|
| Grace Period | (A mod 3) + 2 days, A=8 | **4 days** | §8.1 |
| Default APR | (200 + A * 25) bps, A=8 | **400 bps (4.00%)** | §8.1 |
| Early Withdrawal Penalty | (300 + B * 50) bps, B=3 | **450 bps (4.50%)** | §8.1 |
| Default Tenor | B is odd → 180 days, B=3 | **180 days** | §8.1 |

---

## Creative Challenges (Bonus)

> **Source:** assignment.md §8.3 (up to +10 points)

| ID | Challenge | Problem It Solves | Status | Source |
|----|-----------|-------------------|--------|--------|
| C1 | **Principal Protection** | If vault is empty at maturity, user can still withdraw principal; interest paid later when vault is funded. | ✅ **Implemented** | §8.3 C1 |
| C2 | **Solvency Guard** | Block `withdrawVault()` if it would make the vault unable to pay interest to active deposits. | ❌ Deferred | §8.3 C2 |
| C3 | **Partial Early Withdrawal** | Allow withdrawing part of principal early; penalty applies only to withdrawn portion. | ❌ Not implemented | §8.3 C3 |
| C4 | **Top-Up Deposit** | Allow adding more principal to an active deposit with fair interest calculation. | ❌ Not implemented | §8.3 C4 |
| C5 | **Your Own Idea** | Any real gap in the spec you identify and fix. | ❌ Not implemented | §8.3 C5 |

**Rules for bonus:** (1) base flows in §3 must still pass all tests; (2) each challenge needs its own tests; (3) each needs a README note. (§8.3)

---

## Evaluation Criteria

> **Source:** assignment.md §9

| Criteria | Points | Source |
|----------|--------|--------|
| Correct interest & penalty math | 20 | §9 |
| APR/penalty snapshot (immutable per deposit) | 15 | §9 |
| Auto-renew with APR lock & grace period | 15 | §9 |
| Vault management & pause/unpause | 10 | §9 |
| Test coverage > 90% | 15 | §9 |
| Open questions + oral defense | 10 | §9 |
| Frontend demo | 10 | §9 |
| Code quality & event emissions | 5 | §9 |
| **Total** | **100** | §9 |
| Creative challenges | +5 each, max +10 | §9 |
