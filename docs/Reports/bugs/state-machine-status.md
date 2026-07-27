# Deposit State Machine — Status Enum & Interest Flag

> Auto-generated from `contracts/core/SavingCore.sol` (post-refactor) and verified against
> 123 passing unit tests in `test/unit/SavingCore/`.

---

## 1. Status Enum Reference

| Value | Name             | Semantics                                                       | Set by                                      |
|-------|------------------|-----------------------------------------------------------------|---------------------------------------------|
| 0     | `Active`         | Principal locked in SavingCore. Deposit is live.                | `_createDeposit` (initial)                  |
| 1     | `Withdrawn`      | Principal + interest fully settled. Terminal state.             | `withdrawAtMaturity`, `earlyWithdraw`       |
| 2     | `PrincipalClaimed` | Principal paid out; interest may still be pending.           | `claimPrincipal`                            |
| 3     | `ManualRenewed`  | User renewed into a new plan. Terminal state.                   | `renewDeposit`                              |
| 4     | `AutoRenewed`    | Auto-renewed after grace period. Terminal state.                | `autoRenewDeposit`                          |

### Separated Concern: `interestClaimed` (bool)

| Value | Meaning                                                       | Set by                                 |
|-------|---------------------------------------------------------------|----------------------------------------|
| false | Interest has NOT been claimed on this deposit.                | `_createDeposit` (initial)             |
| true  | Interest HAS been claimed. Status stays `Active`.             | `claimInterest` (Path A)               |

**Key invariant:** `interestClaimed = true` + `status = Active` means principal is still
locked in SavingCore but interest has been paid out. This combination blocks `withdrawAtMaturity`,
`claimPrincipal`, and causes `autoRenewDeposit` / `renewDeposit` to renew with principal-only (no compound).

---

## 2. State Diagram

```
                            ┌──────────────────────────────┐
                            │          Active              │
                            │   (interestClaimed=false)    │
                            └──┬──────┬──────┬──────┬──────┘
                               │      │      │      │
        withdrawAtMaturity     │      │   renewDeposit  autoRenewDeposit
        (vault pays int)       │      │   (compound)    (compound, anyone)
                               │      │      │      │
                               ▼      │      │      │
                          Withdrawn   │      │      │
                               ✗      │      │      │
                            burn OK   │      │      │
                                      │      │      │
                    claimPrincipal    │      │      │
                    (C1: safe exit)   │      │      │
                                      ▼      ▼      ▼
                               Principal  Manual   Auto
                                Claimed  Renewed  Renewed
                                  ✗        ✗        ✗
                               burn OK   burn OK  burn OK

  ──────────────────────────────────────────────────────────────────
  INTEREST FLAG (parallel axis, does NOT change Status) :

  claimInterest Path A (Active, not yet claimed):
    Active ──→ Active  [interestClaimed: false → true]

  claimInterest Path B (after PrincipalClaimed, pending > 0):
    PrincipalClaimed ──→ PrincipalClaimed  [pendingInterest cleared to 0]
```

### Transition Table

| From State | Guard(s)                              | Function              | To State        | interestClaimed |
|------------|---------------------------------------|-----------------------|-----------------|-----------------|
| Active     | `>= maturityAt`                       | `withdrawAtMaturity`  | Withdrawn       | —               |
| Active     | `>= maturityAt`                       | `claimPrincipal`      | PrincipalClaimed| —               |
| Active     | `>= maturityAt`, `!interestClaimed`   | `claimInterest` (A)   | Active          | true            |
| Active     | `feeReceiver set`                     | `earlyWithdraw`       | Withdrawn       | —               |
| Active     | `>= maturityAt`                       | `renewDeposit`        | ManualRenewed   | —               |
| Active     | `>= maturityAt + 4 days`              | `autoRenewDeposit`    | AutoRenewed     | —               |
| Active     | `interestClaimed=true`                | `renewDeposit`        | ManualRenewed   | — (principal only) |
| Active     | `interestClaimed=true`, `>= maturityAt + 4 days` | `autoRenewDeposit` | AutoRenewed | — (principal only) |
| Active     | `interestClaimed=true`                | `withdrawAtMaturity`  | **REVERT**      | —               |
| Active     | `interestClaimed=true`                | `claimPrincipal`      | **REVERT**      | —               |

---

## 3. Function Activity Diagrams

### 3.1 `openDeposit(planId, amount)`

```mermaid
flowchart TD
    A[openDeposit] --> B{planId < nextPlanId?}
    B -- No --> R1[revert PlanNotFound]
    B -- Yes --> C{plan.enabled?}
    C -- No --> R2[revert PlanNotEnabled]
    C -- Yes --> D{amount == 0?}
    D -- Yes --> R3[revert ZeroAmount]
    D -- No --> E{amount < minDeposit?}
    E -- Yes --> R4[revert DepositBelowMin]
    E -- No --> F{amount > maxDeposit?}
    F -- Yes --> R5[revert DepositAboveMax]
    F -- No --> G[safeTransferFrom user -> SavingCore]
    G --> H[_createDeposit: status=Active, interestClaimed=false, mint NFT]
    H --> I[emit DepositOpened]
    I --> J[return depositId]
```

**Test coverage:** `SavingCore.openDeposit.test.ts` — 11 tests
- #1  — happy path: deposit created, NFT minted, tokens transferred
- #2  — emits DepositOpened with correct args
- #3  — APR snapshot: updatePlan after open does not change deposit's aprBpsAtOpen
- #4  — disabled plan → reverts PlanNotEnabled
- #5  — amount below minDeposit → reverts DepositBelowMin
- #6  — amount above maxDeposit → reverts DepositAboveMax
- #7  — zero amount → reverts ZeroAmount
- #8  — nonexistent planId → reverts PlanNotFound
- #9  — maturityAt equals block.timestamp + tenorDays * 86400
- #10 — multiple deposits: nextDepositId increments, each gets unique NFT
- #11 — tokens go to SavingCore, not VaultManager

---

### 3.2 `withdrawAtMaturity(depositId)`

```mermaid
flowchart TD
    A[withdrawAtMaturity] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == Active?}
    C -- No --> R2[revert AlreadyWithdrawn]
    C -- Yes --> D{interestClaimed?}
    D -- Yes --> R2
    D -- No --> E{timestamp >= maturityAt?}
    E -- No --> R3[revert NotYetMature]
    E -- Yes --> F[principal = deposit.principal]
    F --> G[interest = _calcInterest]
    G --> H[CEI: _settlePrincipal Withdrawn]
    H --> I[safeTransfer principal to user]
    I --> J[vaultManager.payInterest interest to user]
    J --> K[emit Withdrawn]
```

**Test coverage:** `SavingCore.withdrawAtMaturity.test.ts` — 12 tests
- #1  — happy path: withdraw at exact maturityAt → principal + interest paid
- #2  — withdraw after maturityAt (+1 day) → same result
- #3  — interest formula proof: 10,000 USDC, 180 days, 400 bps → 197,260,273 units
- #4  — before maturity → reverts NotYetMature
- #5  — double withdraw → reverts AlreadyWithdrawn
- #6  — vault insufficient → reverts
- #7  — vault insufficient exact boundary: vault = interest - 1 → reverts
- #8  — rounding dust: odd principal → truncated interest, dust stays in vault
- #9  — Withdrawn event: isEarly=false, correct principal + interest
- #10 — deposit status changes to Withdrawn after withdraw
- #11 — non-NFT-owner calls → reverts (OZ ERC721 check)
- #12 — APR snapshot: updatePlan after open → interest uses old APR

---

### 3.3 `claimPrincipal(depositId)`

```mermaid
flowchart TD
    A[claimPrincipal] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == Active?}
    C -- No --> R2[revert AlreadyWithdrawn]
    C -- Yes --> D{interestClaimed?}
    D -- Yes --> R2
    D -- No --> E{timestamp >= maturityAt?}
    E -- No --> R3[revert NotYetMature]
    E -- Yes --> F[principal = deposit.principal]
    F --> G[interest = _calcInterest]
    G --> H[CEI: _settlePrincipal PrincipalClaimed]
    H --> I[safeTransfer principal to user]
    I --> J{paused?}

    J -- Yes --> K[pendingInterest = interest]
    J -- No --> L{vaultBalance >= interest?}

    L -- Yes --> M[vault.payInterest full interest]
    M --> N[pendingInterest = 0]
    L -- No --> O{vaultBalance > 0?}
    O -- Yes --> P[vault.payInterest vaultBal]
    P --> Q[pendingInterest = interest - vaultBal]
    O -- No --> K

    K --> R[emit Withdrawn]
    N --> R
    Q --> R
```

**Test coverage:** `SavingCore.c1.test.ts` — 15 tests (C1: principal is always safe)
- #1  — claimPrincipal: vault funded → pays principal + full interest, no pending
- #2  — claimPrincipal: vault empty → pays principal only, pendingInterest = full interest
- #3  — claimPrincipal: vault partial → pays partial interest, pending = remainder
- #4  — claimInterest: after partial claim → pays remainder, pending = 0
- #5  — claimInterest: no pending interest → reverts NoPendingInterest
- #6  — claimPrincipal by non-owner → reverts NotOwner
- #7  — claimInterest by non-owner → reverts NotOwner
- #8  — double claimPrincipal → reverts AlreadyWithdrawn
- #9  — double claimInterest → reverts NoPendingInterest
- #10 — claimPrincipal when paused → succeeds (C1 guarantee)
- #11 — claimInterest when paused → reverts EnforcedPause
- #12 — NFT transferred after claimPrincipal → new owner can claimInterest
- #13 — burn with pending interest → reverts PendingInterestExists
- #14 — burn after full claimInterest → succeeds
- #15 — claimPrincipal when paused + vault funded → principal paid, full interest deferred

---

### 3.4 `claimInterest(depositId)`

```mermaid
flowchart TD
    A[claimInterest] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == Active AND !interestClaimed?}

    C -- Yes --> D{timestamp >= maturityAt?}
    D -- No --> R2[revert NotYetMature]
    D -- Yes --> E[amount = _calcInterest]
    E --> F[CEI: interestClaimed = true]

    C -- No --> G[amount = pendingInterest]
    G --> H{amount == 0?}
    H -- Yes --> R3[revert NoPendingInterest]
    H -- No --> I[pendingInterest = 0]

    F --> J[vaultManager.payInterest amount]
    I --> J
    J --> K[emit InterestClaimed]
```

**Test coverage:** `SavingCore.interestClaim.test.ts` — 10 tests
- #1  — claimInterest: pays interest from vault, principal stays in SavingCore
- #2  — claimInterest: sets interestClaimed=true, status stays Active (0)
- #3  — claimInterest: NFT stays with caller
- #4  — claimInterest: double claim → reverts NoPendingInterest
- #5  — claimInterest: not mature → reverts NotYetMature
- #6  — claimInterest by non-owner → reverts NotOwner
- #7  — claimInterest when paused → reverts EnforcedPause
- #8  — claimInterest: emits InterestClaimed event
- #9  — renewDeposit after claimInterest → new principal = old principal (no interest)
- #10 — withdrawAtMaturity after claimInterest → reverts AlreadyWithdrawn

---

### 3.5 `earlyWithdraw(depositId)`

```mermaid
flowchart TD
    A[earlyWithdraw] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == Active?}
    C -- No --> R2[revert AlreadyWithdrawn]
    C -- Yes --> D{feeReceiver set?}
    D -- No --> R3[revert FeeReceiverNotSet]
    D -- Yes --> E[principal = deposit.principal]
    E --> F[penalty = principal * penaltyBps / 10000]
    F --> G[userAmount = principal - penalty]
    G --> H[CEI: status = Withdrawn]
    H --> I[safeTransfer userAmount to user]
    I --> J[safeTransfer penalty to feeReceiver]
    J --> K[emit Withdrawn isEarly=true]
```

**Note:** No interest is paid. No vault interaction. No maturity check.
**Test coverage:** `SavingCore.earlyWithdraw.test.ts` — 9 tests
- #1  — happy path: penalty deducted, user gets principal - penalty
- #2  — zero interest: vault balance unchanged (no payInterest called)
- #3  — feeReceiver balance increases by exact penalty amount
- #4  — feeReceiver not set → reverts FeeReceiverNotSet
- #5  — double early withdraw → reverts AlreadyWithdrawn
- #6  — Withdrawn event: isEarly=true, correct principal + interest=0
- #7  — deposit status changes to Withdrawn after earlyWithdraw
- #8  — penalty formula proof: 10,000 USDC, 450 bps → penalty = 450 USDC
- #9  — non-NFT-owner calls earlyWithdraw → reverts

---

### 3.6 `renewDeposit(depositId, newPlanId)`

```mermaid
flowchart TD
    A[renewDeposit] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == Active?}
    C -- No --> R2[revert AlreadyWithdrawn]
    C -- Yes --> D{timestamp >= maturityAt?}
    D -- No --> R3[revert NotYetMature]
    D -- Yes --> E{newPlanId exists AND enabled?}
    E -- No --> R4[revert PlanNotFound / PlanNotEnabled]
    E -- Yes --> F[interest = _calcInterest]

    F --> G{interestClaimed?}
    G -- Yes --> H[newPrincipal = principal only]
    G -- No --> I[newPrincipal = principal + interest]
    I --> J[vault.payInterest interest to SavingCore]

    H --> K[CEI: _settlePrincipal ManualRenewed]
    J --> K
    K --> L[_createDeposit with new plan params]
    L --> M[emit Renewed]
    M --> N[return newDepositId]
```

**Test coverage:** `SavingCore.renewDeposit.test.ts` — 10 tests
- #1  — happy path: renew at exact maturityAt → new NFT minted, old status ManualRenewed
- #2  — compound math: new principal = old principal + interest
- #3  — new deposit uses NEW plan's APR (600), not old plan's (400)
- #4  — new deposit uses NEW plan's tenor (90 days), not old plan's (180)
- #5  — before maturity (maturityAt - 1 second) → reverts NotYetMature
- #6  — non-NFT-owner calls renewDeposit → reverts
- #7  — double renew → reverts AlreadyWithdrawn
- #8  — nonexistent newPlanId → reverts PlanNotFound
- #9  — disabled new plan → reverts PlanNotEnabled
- #10 — emits Renewed event with correct args

---

### 3.7 `autoRenewDeposit(depositId)`

```mermaid
flowchart TD
    A[autoRenewDeposit] --> B{status == Active?}
    B -- No --> R1[revert AlreadyWithdrawn]
    B -- Yes --> C{timestamp >= maturityAt + 4 days?}
    C -- No --> R2[revert GracePeriodNotElapsed]
    C -- Yes --> D[interest = _calcInterest]

    D --> G{interestClaimed?}
    G -- Yes --> H[newPrincipal = principal only]
    G -- No --> I[newPrincipal = principal + interest]
    I --> J[vault.payInterest interest to SavingCore]

    H --> K[CEI: _settlePrincipal AutoRenewed]
    J --> K
    K --> L[_createDeposit same plan, same APR, same tenor]
    L --> M[emit Renewed]
    M --> N[return newDepositId]
```

**Key difference from `renewDeposit`:**
- No owner check (anyone/bot can call)
- Handles `interestClaimed` same as `renewDeposit` — renews with principal only if interest was already claimed
- Same plan, same APR (locked to snapshot), different caller model

**Test coverage:** `SavingCore.autoRenew.test.ts` — 10 tests
- #1  — happy path: auto-renew after grace period → new NFT minted, old status AutoRenewed
- #2  — compound math: new principal = old principal + interest
- #3  — APR lock: updatePlan after open → new deposit uses old APR (400), not updated (800)
- #4  — tenor preserved: new deposit tenor = 180 days (same as original)
- #5  — before grace period (gracePeriodEnd - 1 second) → reverts GracePeriodNotElapsed
- #6  — at exact grace period second (maturityAt + gracePeriod) → not reverted by GracePeriodNotElapsed
- #7  — old deposit status changes to AutoRenewed (enum 4)
- #8  — double auto-renew → reverts AlreadyWithdrawn
- #9  — emits Renewed event with correct args
- #10 — autoRenewDeposit after claimInterest → principal only, no vault call

---

### 3.8 `burn(depositId)`

```mermaid
flowchart TD
    A[burn] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == Active?}
    C -- Yes --> R2[revert AlreadyWithdrawn]
    C -- No --> D{pendingInterest > 0?}
    D -- Yes --> R3[revert PendingInterestExists]
    D -- No --> E[_burn NFT]
```

**Note:** `pendingInterest` check is in `_update` override, not in `burn` directly.
**Test coverage:** `SavingCore.c1.test.ts` — 2 tests
- #13 — burn with pending interest → reverts PendingInterestExists
- #14 — burn after full claimInterest → succeeds

---

## 4. Key Business Invariants Preserved

1. **C1 — Principal is always safe:** `claimPrincipal` has no `whenNotPaused` modifier. User can always recover principal regardless of system state.

2. **Interest never double-paid:** `interestClaimed=true` blocks `withdrawAtMaturity`, `claimPrincipal`, and causes `autoRenewDeposit` to renew with principal-only (no vault call). The `claimInterest` Path A sets the flag before any external call.

3. **APR immutability:** All interest calculations use `aprBpsAtOpen` (snapshotted at deposit time), never the current plan APR.

4. **Boundary at `maturityAt`:** `>=` consistently — at the exact maturity second, all maturity-gated functions are allowed.

5. **CEI compliance:** `_settlePrincipal()` and `_calcInterest()` are free of external calls. State is always updated before `safeTransfer`/`payInterest`.

6. **Vault separation:** Principal always from SavingCore balance. Interest always from VaultManager. `earlyWithdraw` penalty goes to `feeReceiver`, not vault.
