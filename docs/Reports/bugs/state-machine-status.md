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
`claimPrincipal`, and causes `renewDeposit` to renew with principal-only (no compound).

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

---

### 3.7 `autoRenewDeposit(depositId)`

```mermaid
flowchart TD
    A[autoRenewDeposit] --> B{status == Active?}
    B -- No --> R1[revert AlreadyWithdrawn]
    B -- Yes --> C{timestamp >= maturityAt + 4 days?}
    C -- No --> R2[revert GracePeriodNotElapsed]
    C -- Yes --> D[interest = _calcInterest]
    D --> E[newPrincipal = principal + interest]
    E --> F[CEI: _settlePrincipal AutoRenewed]
    F --> G[vault.payInterest interest to SavingCore]
    G --> H[_createDeposit same plan, same APR, same tenor]
    H --> I[emit Renewed]
    I --> J[return newDepositId]
```

**Key difference from `renewDeposit`:**
- No owner check (anyone/bot can call)
- No `interestClaimed` check (auto-renew always compounds)
- Same plan, same APR (locked to snapshot), different caller model

**Test coverage:** `SavingCore.autoRenew.test.ts` — 9 tests

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
**Test coverage:** `SavingCore.c1.test.ts` — 2 tests (#13, #14)

---

## 4. Key Business Invariants Preserved

1. **C1 — Principal is always safe:** `claimPrincipal` has no `whenNotPaused` modifier. User can always recover principal regardless of system state.

2. **Interest never double-paid:** `interestClaimed=true` blocks `withdrawAtMaturity` and `claimPrincipal`. The `claimInterest` Path A sets the flag before any external call.

3. **APR immutability:** All interest calculations use `aprBpsAtOpen` (snapshotted at deposit time), never the current plan APR.

4. **Boundary at `maturityAt`:** `>=` consistently — at the exact maturity second, all maturity-gated functions are allowed.

5. **CEI compliance:** `_settlePrincipal()` and `_calcInterest()` are free of external calls. State is always updated before `safeTransfer`/`payInterest`.

6. **Vault separation:** Principal always from SavingCore balance. Interest always from VaultManager. `earlyWithdraw` penalty goes to `feeReceiver`, not vault.
