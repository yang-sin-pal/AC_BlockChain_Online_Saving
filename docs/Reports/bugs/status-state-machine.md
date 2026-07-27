# Deposit State Machine — Status Enum & Interest Flag

> Auto-generated from `contracts/core/SavingCore.sol` (post-refactor) and verified against
> 142 passing unit tests in `test/unit/SavingCore/`.

---

## 1. Status Enum Reference

| Value | Name               | Semantics                                                        | Set by                                         |
|-------|--------------------|------------------------------------------------------------------|------------------------------------------------|
| 0     | `Active`           | Principal locked in SavingCore. Deposit is live.                 | `_createDeposit` (initial)                     |
| 1     | `Withdrawn`        | Principal + interest fully settled. Terminal state.              | `withdrawAtMaturity`, `earlyWithdraw`, `claimPrincipal` (when interestClaimed), `claimInterest` (when PrincipalClaimed + full payment) |
| 2     | `PrincipalClaimed` | Principal paid out; interest is pending as `pendingInterest`.    | `claimPrincipal`                               |
| 3     | `ManualRenewed`    | User renewed into a new plan. Terminal state.                    | `renewDeposit`                                 |
| 4     | `AutoRenewed`      | Auto-renewed after grace period. Terminal state.                 | `autoRenewDeposit`                             |

### Separated Concern: `interestClaimed` (bool)

| Value | Meaning                                                       | Set by                                                        |
|-------|---------------------------------------------------------------|---------------------------------------------------------------|
| false | Interest has NOT been claimed on this deposit.                | `_createDeposit` (initial)                                    |
| true  | Interest HAS been fully claimed.                              | `claimInterest` (full payment — both Path A and Path B)       |

**Key invariant:** `interestClaimed = true` + `status = Active` means principal is still
locked in SavingCore but interest has been paid out. `withdrawAtMaturity` and `claimPrincipal`
revert with `UseClaimPrincipal` / `UseClaimInterest` to guide users to the correct function.

### Interest Payment Model

Interest can be paid in **two independent steps**:
1. **claimPrincipal** — pays principal from SavingCore balance (no vault). Interest is calculated and stored as `pendingInterest[depositId]`. No `whenNotPaused` (C1 guarantee).
2. **claimInterest** — pays interest from VaultManager. Supports **partial vault payment**: if vault balance < amount, pays what's available, stores remainder as `pendingInterest`, `interestClaimed` stays `false` (allows retry).

The `withdrawAtMaturity` function is a convenience shortcut that pays both principal + interest in one call, but **only when neither has been claimed yet**.

---

## 2. State Diagram

```
                          ┌──────────────────────────────┐
                          │          Active              │
                          │   (interestClaimed=false)    │
                          └──┬─────┬─────┬─────┬─────┬───┘
                             │     │     │     │     │
  withdrawAtMaturity         │     │  renewDeposit  autoRenewDeposit
  (principal+interest)       │     │  (compound)    (compound, anyone)
                             │     │     │     │     │
                             ▼     │     │     │     │
                        Withdrawn  │     │     │     │
                             ✗     │     │     │     │
                          burn OK  │     │     │     │
                                   │     │     │     │
                    claimPrincipal │     │     │     │
                    (C1: principal │     │     │     │
                     only, always  ▼     ▼     ▼     ▼
                     available)  Principal  Manual  Auto
                                  Claimed  Renewed Renewed
                                   ✗         ✗       ✗
                                burn OK*  burn OK  burn OK

  ──────────────────────────────────────────────────────────────────
  INTEREST FLAG (parallel axis, does NOT change Status) :

  claimInterest Path A (Active, mature, not yet claimed):
    Active ──→ Active  [interestClaimed: false → true]

  claimInterest Path B (PrincipalClaimed, pending > 0):
    PrincipalClaimed ──→ Withdrawn  [interestClaimed: true, pending cleared]

  claimInterest partial (any state, vault < amount):
    No status change  [pendingInterest += remainder, interestClaimed stays false]

  * burn blocked when pendingInterest > 0
```

### Transition Table

| From State       | Guard(s)                                       | Function              | To State        | Notes                    |
|------------------|------------------------------------------------|-----------------------|-----------------|--------------------------|
| Active           | `>= maturityAt`                                | `withdrawAtMaturity`  | Withdrawn       | principal + interest     |
| Active           | `>= maturityAt`                                | `claimPrincipal`      | PrincipalClaimed| interest → pending       |
| Active           | `>= maturityAt`                                | `claimInterest` (A)   | Active          | interestClaimed=true     |
| Active           | `feeReceiver set`                              | `earlyWithdraw`       | Withdrawn       | penalty only, no vault   |
| Active           | `>= maturityAt`                                | `renewDeposit`        | ManualRenewed   | compound principal+int   |
| Active           | `>= maturityAt + 4 days`                       | `autoRenewDeposit`    | AutoRenewed     | compound, anyone can call|
| Active           | `interestClaimed=true` + `>= maturityAt`       | `withdrawAtMaturity`  | → reverts UseClaimPrincipal | |
| Active           | `interestClaimed=true` + `>= maturityAt`       | `claimPrincipal`      | Withdrawn       | principal only, no vault |
| PrincipalClaimed | `>= maturityAt`                                | `claimInterest` (B)   | Withdrawn       | pays pending, full → Withdrawn |
| PrincipalClaimed | `>= maturityAt`                                | `renewDeposit`        | ManualRenewed   | renew with interest only |
| PrincipalClaimed | `>= maturityAt + 4 days`                       | `autoRenewDeposit`    | AutoRenewed     | renew with interest only |
| PrincipalClaimed | `interestClaimed=true`                         | `claimInterest`       | → reverts InterestAlreadyClaimed | |
| Withdrawn        | any                                            | any state change      | → reverts AlreadyWithdrawn | terminal |
| ManualRenewed    | any                                            | any state change      | → reverts AlreadyWithdrawn | terminal |
| AutoRenewed      | any                                            | any state change      | → reverts AlreadyWithdrawn | terminal |

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
    B -- Yes --> C{status == PrincipalClaimed?}
    C -- Yes --> R2[revert UseClaimInterest]
    C -- No --> D{status != Active?}
    D -- Yes --> R3[revert AlreadyWithdrawn]
    D -- No --> E{interestClaimed?}
    E -- Yes --> R4[revert UseClaimPrincipal]
    E -- No --> F{timestamp >= maturityAt?}
    F -- No --> R5[revert NotYetMature]
    F -- Yes --> G[CEI: _settlePrincipal Withdrawn]
    G --> H[safeTransfer principal to user]
    H --> I[vaultManager.payInterest interest to user]
    I --> J[emit Withdrawn isEarly=false]
```

**Test coverage:** `SavingCore.withdrawAtMaturity.test.ts` — 14 tests

---

### 3.3 `claimPrincipal(depositId)`

```mermaid
flowchart TD
    A[claimPrincipal] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{status == PrincipalClaimed?}
    C -- Yes --> R2[revert PrincipalAlreadyClaimed]
    C -- No --> D{status != Active?}
    D -- Yes --> R3[revert AlreadyWithdrawn]
    D -- No --> E{timestamp >= maturityAt?}
    E -- No --> R4[revert NotYetMature]
    E -- Yes --> F{interestClaimed?}

    F -- Yes --> G[CEI: _settlePrincipal Withdrawn]
    G --> H[safeTransfer principal to user]
    H --> I[emit Withdrawn interest=0]

    F -- No --> J[interest = _calcInterest]
    J --> K[CEI: pendingInterest = interest]
    K --> L[CEI: _settlePrincipal PrincipalClaimed]
    L --> M[safeTransfer principal to user]
    M --> N[emit Withdrawn interest=0]

    I --> O[done]
    N --> O
```

**Key design:** `claimPrincipal` never touches the vault. Interest is always stored as `pendingInterest`. No `whenNotPaused` modifier — C1 guarantee.

**Test coverage:** `SavingCore.c1.test.ts` — 18 tests

---

### 3.4 `claimInterest(depositId)`

```mermaid
flowchart TD
    A[claimInterest] --> B{msg.sender == ownerOf?}
    B -- No --> R1[revert NotOwner]
    B -- Yes --> C{interestClaimed?}
    C -- Yes --> R2[revert InterestAlreadyClaimed]
    C -- No --> D{status?}

    D -- Active --> E{timestamp >= maturityAt?}
    E -- No --> R3[revert NotYetMature]
    E -- Yes --> F[amount = _calcInterest]

    D -- PrincipalClaimed --> G[amount = pendingInterest]
    G --> H{amount == 0?}
    H -- Yes --> R4[revert NoPendingInterest]
    H -- No --> I[pendingInterest = 0]

    D -- Other --> R5[revert AlreadyWithdrawn]

    F --> J[CEI: vaultBal = vaultManager.vaultBalance]
    I --> J
    J --> K{vaultBal >= amount?}
    K -- Yes --> L[payAmount = amount, remainder = 0]
    K -- No --> M[payAmount = vaultBal, remainder = amount - vaultBal]
    L --> N[pendingInterest = remainder]
    M --> N
    N --> O{remainder == 0?}
    O -- Yes --> P[interestClaimed = true]
    O -- No --> Q[interestClaimed stays false]
    P --> R{status == PrincipalClaimed?}
    R -- Yes --> S[deposit.status = Withdrawn]
    R -- No --> T[status stays Active]
    Q --> U[payAmount > 0?]
    S --> U
    T --> U
    U -- Yes --> V[vaultManager.payInterest payAmount]
    U -- No --> W[emit InterestClaimed payAmount]
    V --> W
```

**Key design:** Supports partial vault payment. If vault < full interest, pays what's available, stores remainder as `pendingInterest`. User can retry after vault is refunded. `interestClaimed` only set to `true` on full payment.

**Test coverage:** `SavingCore.interestClaim.test.ts` — 15 tests

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
    B -- Yes --> C{status is Terminal?}
    C -- "Withdrawn/ManualRenewed/AutoRenewed" --> R2[revert AlreadyWithdrawn]
    C -- "Active or PrincipalClaimed" --> D{timestamp >= maturityAt?}
    D -- No --> R3[revert NotYetMature]
    D -- Yes --> E{newPlanId exists AND enabled?}
    E -- No --> R4[revert PlanNotFound/PlanNotEnabled]
    E -- Yes --> F{status != PrincipalClaimed?}

    F -- Yes --> G[newPrincipal += deposit.principal]
    F -- No --> H[skip principal, already claimed]

    G --> I{!interestClaimed?}
    H --> I
    I -- Yes, Active --> J[interest = _calcInterest]
    J --> K[vault.payInterest interest to SavingCore]
    K --> L[newPrincipal += interest]
    I -- Yes, PrincipalClaimed --> M[interest = pendingInterest]
    M --> N[pendingInterest = 0]
    N --> O[vault.payInterest interest to SavingCore]
    O --> P[newPrincipal += interest]
    I -- No --> Q[skip interest, already claimed]

    L --> R{newPrincipal > 0?}
    P --> R
    Q --> R
    R -- No --> R5[revert AlreadyWithdrawn]
    R -- Yes --> S[CEI: _settlePrincipal ManualRenewed]
    S --> T[_createDeposit with new plan params]
    T --> U[emit Renewed]
    U --> V[return newDepositId]
```

**Key design:** Allows renewal from `Active` or `PrincipalClaimed` status. Compounds whatever remains (principal and/or interest). Terminal states (`Withdrawn`, `ManualRenewed`, `AutoRenewed`) revert.

**Test coverage:** `SavingCore.renewDeposit.test.ts` — 14 tests

---

### 3.7 `autoRenewDeposit(depositId)`

```mermaid
flowchart TD
    A[autoRenewDeposit] --> B{status is Terminal?}
    B -- "Withdrawn/ManualRenewed/AutoRenewed" --> R1[revert AlreadyWithdrawn]
    B -- "Active or PrincipalClaimed" --> C{timestamp >= maturityAt + 4 days?}
    C -- No --> R2[revert GracePeriodNotElapsed]
    C -- Yes --> D{status != PrincipalClaimed?}

    D -- Yes --> E[newPrincipal += deposit.principal]
    D -- No --> F[skip principal, already claimed]

    E --> G{!interestClaimed?}
    F --> G
    G -- Yes, Active --> H[interest = _calcInterest]
    H --> I[vault.payInterest interest to SavingCore]
    I --> J[newPrincipal += interest]
    G -- Yes, PrincipalClaimed --> K[interest = pendingInterest]
    K --> L[pendingInterest = 0]
    L --> M[vault.payInterest interest to SavingCore]
    M --> N[newPrincipal += interest]
    G -- No --> O[skip interest, already claimed]

    J --> P{newPrincipal > 0?}
    N --> P
    O --> P
    P -- No --> R3[revert AlreadyWithdrawn]
    P -- Yes --> Q[CEI: _settlePrincipal AutoRenewed]
    Q --> R[_createDeposit same plan, same APR, same tenor]
    R --> S[emit Renewed]
    S --> T[return newDepositId]
```

**Key differences from `renewDeposit`:**
- No owner check — anyone/bot can call
- Same plan, same APR (locked to snapshot), different caller model
- Grace period required (`maturityAt + 4 days`)

**Test coverage:** `SavingCore.autoRenew.test.ts` — 14 tests

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

1. **C1 — Principal is always safe:** `claimPrincipal` has no `whenNotPaused` modifier. User can always recover principal regardless of system state. Interest is stored as `pendingInterest` for later claim.

2. **Interest never double-paid:** `interestClaimed=true` is only set on full payment. `claimInterest` checks `interestClaimed` before any calculation. Partial payments leave `interestClaimed=false` for retry.

3. **Specific revert guidance:** When a function is blocked by partial claim state, reverts with `UseClaimInterest` or `UseClaimPrincipal` to guide the user to the correct function.

4. **APR immutability:** All interest calculations use `aprBpsAtOpen` (snapshotted at deposit time), never the current plan APR.

5. **Boundary at `maturityAt`:** `>=` consistently — at the exact maturity second, all maturity-gated functions are allowed.

6. **CEI compliance:** `_settlePrincipal()` and `_calcInterest()` are free of external calls. State is always updated before `safeTransfer`/`payInterest`.

7. **Vault separation:** Principal always from SavingCore balance. Interest always from VaultManager. `earlyWithdraw` penalty goes to `feeReceiver`, not vault.

8. **Partial vault payment:** `claimInterest` gracefully handles insufficient vault balance — pays what's available, stores remainder as `pendingInterest` for retry after vault is refunded.

9. **Renewal flexibility:** `renewDeposit` and `autoRenewDeposit` allow renewal from `PrincipalClaimed` status — compounds whatever remains (interest only if principal was already claimed).
