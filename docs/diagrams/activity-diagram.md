# Activity Diagrams

This document describes the activity diagrams for the **Blockchain-Based Online Saving System**. Each diagram covers one major user flow or admin operation, using Mermaid `flowchart TD` with swimlanes.

---

## System Parameters (Personal Variant — ID ending in 38)

| Parameter | Value | Source |
|-----------|-------|--------|
| Grace Period | 4 days | §8.1 |
| Default APR | 400 bps (4.00%) | §8.1 |
| Early Withdrawal Penalty | 450 bps (4.50%) | §8.1 |
| Default Tenor | 180 days | §8.1 |

---

## Modifier Reference

| Function | `nonReentrant` | `whenNotPaused` | `onlyDepositOwner` | `onlyOwner` |
|----------|:-:|:-:|:-:|:-:|
| `openDeposit` | ✅ | — | — | — |
| `withdrawAtMaturity` | ✅ | ✅ | ✅ | — |
| `claimPrincipal` | ✅ | — | ✅ | — |
| `claimInterest` | ✅ | ✅ | ✅ | — |
| `burn` | — | — | ✅ | — |
| `earlyWithdraw` | ✅ | — | ✅ | — |
| `renewDeposit` | ✅ | ✅ | ✅ | — |
| `autoRenewDeposit` | ✅ | ✅ | — | — |
| `createPlan` | — | — | — | ✅ |
| `updatePlan` | — | — | — | ✅ |
| `enablePlan` / `disablePlan` | — | — | — | ✅ |
| `pause` / `unpause` | — | — | — | ✅ |
| `fundVault` | — | — | — | ✅ |
| `withdrawVault` | ✅ | ✅ | — | ✅ |
| `setFeeReceiver` | — | — | — | ✅ |
| `setSavingCore` | — | — | — | ✅ |
| `payInterest` | ✅ | ✅ | — | — |

---

## 1. Open Deposit Flow — §3.1

```mermaid
flowchart TD
    subgraph User
        A1([Start]) --> A2[Approve MockUSDC spending<br/>for SavingCore]
        A2 --> A3[Call openDeposit<br/>planId, amount]
    end

    subgraph SavingCore
        A4{Plan exists?}
        A5{Plan enabled?}
        A6{"amount &gt; 0?"}
        A7{"amount &gt;= minDeposit?"}
        A8{"amount &lt;= maxDeposit?"}
        A9[Transfer tokens from User<br/>to SavingCore]
        A10[Snapshot aprBps &<br/>penaltyBps at open]
        A11[Set status = Active,<br/>maturityAt = now + tenorDays * 86400]
        A12[Mint ERC721 NFT<br/>to User]
        A13[Emit DepositOpened]
    end

    subgraph MockUSDC
        A14[Transfer tokens from<br/>User to SavingCore]
    end

    A3 --> A4
    A4 -- No --> A4R([Revert: PlanNotFound])
    A4 -- Yes --> A5
    A5 -- No --> A5R([Revert: PlanNotEnabled])
    A5 -- Yes --> A6
    A6 -- No --> A6R([Revert: ZeroAmount])
    A6 -- Yes --> A7
    A7 -- No --> A7R([Revert: DepositBelowMin])
    A7 -- Yes --> A8
    A8 -- No --> A8R([Revert: DepositAboveMax])
    A8 -- Yes --> A14
    A14 --> A9
    A9 --> A10
    A10 --> A11
    A11 --> A12
    A12 --> A13
    A13 --> A15([End])
```

---

## 2. Withdraw at Maturity Flow — §3.2

```mermaid
flowchart TD
    subgraph User
        B1([Start]) --> B2[Call withdrawAtMaturity<br/>depositId]
    end

    subgraph SavingCore
        B3{Paused?}
        B4{Status?}
        B5{"now &gt;= maturityAt?"}
        B6[Calculate interest via<br/>InterestLib.calculateInterest]
        B7[Set status = Withdrawn]
        B8[Transfer principal<br/>from SavingCore to User]
        B9[Emit Withdrawn<br/>isEarly = false]
    end

    subgraph VaultManager
        B10[Transfer interest<br/>from Vault to User]
    end

    B2 --> B3
    B3 -- Yes --> BR1([Revert: EnforcedPause])
    B3 -- No --> B4
    B4 -- Active --> B5
    B4 -- PrincipalClaimed --> BR2([Revert: UseClaimInterest])
    B4 -- interestClaimed = true --> BR3([Revert: UseClaimPrincipal])
    B4 -- Withdrawn/ManualRenewed/AutoRenewed --> BR4([Revert: AlreadyWithdrawn])
    B5 -- No --> BR5([Revert: NotYetMature])
    B5 -- Yes --> B6
    B6 --> B7
    B7 --> B8
    B7 --> B10
    B8 --> B9
    B10 --> B9
    B9 --> B11([End])
```

---

## 3. Early Withdraw Flow — §3.3

> **Note:** `earlyWithdraw` has **NO** `whenNotPaused` — users can always exit early, even during pause.

```mermaid
flowchart TD
    subgraph User
        C1([Start]) --> C2[Call earlyWithdraw<br/>depositId]
    end

    subgraph SavingCore
        C3{Status == Active?}
        C4{"feeReceiver<br/>!= address(0)?"}
        C5[Calculate penalty =<br/>principal * penaltyBpsAtOpen / 10000]
        C6[Set status = Withdrawn]
        C7[Transfer principal - penalty<br/>from SavingCore to User]
        C8[Transfer penalty<br/>to feeReceiver]
        C9[Emit Withdrawn<br/>isEarly = true]
    end

    subgraph feeReceiver
        C10[Receive penalty]
    end

    C2 --> C3
    C3 -- No --> CR1([Revert: AlreadyWithdrawn])
    C3 -- Yes --> C4
    C4 -- No --> CR2([Revert: FeeReceiverNotSet])
    C4 -- Yes --> C5
    C5 --> C6
    C6 --> C7
    C6 --> C8
    C7 --> C9
    C8 --> C10
    C9 --> C11([End])
```

---

## 4. Manual Renew Flow — §3.4

> **Note:** Allows `PrincipalClaimed` status — user can renew even after claiming principal.

```mermaid
flowchart TD
    subgraph User
        D1([Start]) --> D2[Call renewDeposit<br/>depositId, newPlanId]
    end

    subgraph SavingCore
        D3{Paused?}
        D4{Status?}
        D5{"now &gt;= maturityAt?"}
        D6{"newPlanId<br/>&lt; nextPlanId?"}
        D7{new plan<br/>enabled?}
        D8[Collect renewal principal<br/>via _collectRenewalPrincipal]
        D9[Create new deposit<br/>with newPlanId]
        D10[Set old status =<br/>ManualRenewed]
        D11[Emit Renewed<br/>oldId, newId,<br/>newPrincipal, newPlanId]
    end

    D2 --> D3
    D3 -- Yes --> DR1([Revert: EnforcedPause])
    D3 -- No --> D4
    D4 -- Active --> D5
    D4 -- PrincipalClaimed --> D5
    D4 -- Withdrawn/ManualRenewed/AutoRenewed --> DR2([Revert: AlreadyWithdrawn])
    D5 -- No --> DR3([Revert: NotYetMature])
    D5 -- Yes --> D6
    D6 -- No --> DR4([Revert: PlanNotFound])
    D6 -- Yes --> D7
    D7 -- No --> DR5([Revert: PlanNotEnabled])
    D7 -- Yes --> D8
    D8 --> D9
    D9 --> D10
    D10 --> D11
    D11 --> D12([End])
```

---

## 5. Auto-Renew Flow — §3.5

> **Note:** `autoRenewDeposit` has `whenNotPaused` — blocked during pause. No owner check — anyone (bot) can call.

```mermaid
flowchart TD
    subgraph Bot
        E1([Start]) --> E2[Call autoRenewDeposit<br/>depositId]
    end

    subgraph SavingCore
        E3{Paused?}
        E4{Status?}
        E5{"now &gt;= maturityAt +<br/>gracePeriod?"}
        E6[Collect renewal principal<br/>via _collectRenewalPrincipal]
        E7[Create new deposit<br/>with same plan, locked APR]
        E8[Set old status =<br/>AutoRenewed]
        E9[Emit Renewed<br/>oldId, newId,<br/>newPrincipal, samePlanId]
    end

    E2 --> E3
    E3 -- Yes --> ER1([Revert: EnforcedPause])
    E3 -- No --> E4
    E4 -- Active --> E5
    E4 -- PrincipalClaimed --> E5
    E4 -- Withdrawn/ManualRenewed/AutoRenewed --> ER2([Revert: AlreadyWithdrawn])
    E5 -- No --> ER3([Revert: GracePeriodNotElapsed])
    E5 -- Yes --> E6
    E6 --> E7
    E7 --> E8
    E8 --> E9
    E9 --> E10([End])
```

---

## 6. Admin — Plan Management — §4

```mermaid
flowchart TD
    subgraph BankAdmin
        F1([Start: Create Plan]) --> F2[Call createPlan<br/>tenor, apr, min, max, penalty]
        F3([Start: Update Plan]) --> F4[Call updatePlan<br/>planId, newAprBps]
        F5([Start: Enable/Disable]) --> F6[Call enablePlan /<br/>disablePlan planId]
    end

    subgraph SavingCore
        F7[Validate inputs<br/>tenor > 0, apr > 0,<br/>min <= max]
        F8[Store plan with<br/>nextPlanId]
        F9[Emit PlanCreated]
        F10{Plan exists?}
        F11[Update plan.aprBps]
        F12[Emit PlanUpdated]
        F13[Toggle plan.enabled]
    end

    F2 --> F7
    F7 --> F8
    F8 --> F9
    F9 --> F14([End])

    F4 --> F10
    F10 -- No --> FR1([Revert: PlanNotFound])
    F10 -- Yes --> F11
    F11 --> F12
    F12 --> F15([End])

    F6 --> F13
    F13 --> F16([End])
```

---

## 7. Admin — Vault & System Management — §4

```mermaid
flowchart TD
    subgraph BankAdmin
        G1([Start: Fund Vault]) --> G2[Call fundVault<br/>amount]
        G3([Start: Withdraw Vault]) --> G4[Call withdrawVault<br/>amount]
        G5([Start: Set Fee Receiver]) --> G6[Call setFeeReceiver<br/>address]
        G7([Start: Pause SavingCore]) --> G8[Call savingCore.pause]
        G9([Start: Unpause SavingCore]) --> G10[Call savingCore.unpause]
        G11([Start: Pause VaultManager]) --> G12[Call vaultManager.pause]
        G13([Start: Unpause VaultManager]) --> G14[Call vaultManager.unpause]
        G15([Start: Set SavingCore]) --> G16[Call setSavingCore<br/>address]
    end

    subgraph VaultManager
        G17[Transfer tokens from<br/>Admin to VaultManager]
        G18{"amount &lt;= vaultBalance?"}
        G19[Transfer tokens from<br/>VaultManager to Admin]
        G20[Update feeReceiver address]
        G21[Set paused = true]
        G22[Set paused = false]
        G23[Set savingCore address<br/>one-time setter]
    end

    subgraph SavingCore
        G24[Set paused = true]
        G25[Set paused = false]
    end

    G2 --> G17
    G17 --> G26([End])

    G4 --> G18
    G18 -- No --> GR1([Revert: InsufficientBalance])
    G18 -- Yes --> G19
    G19 --> G27([End])

    G6 --> G20
    G20 --> G28([End])

    G8 --> G24
    G24 --> G29([End])

    G10 --> G25
    G25 --> G30([End])

    G12 --> G21
    G21 --> G31([End])

    G14 --> G22
    G22 --> G32([End])

    G16 --> G23
    G23 --> G33([End])
```

---

## 8. Claim Principal (C1 — Principal Protection) — §8.3

> **Key design:** No `whenNotPaused` — user can **always** reclaim principal, even during pause or when vault is empty.

```mermaid
flowchart TD
    subgraph User
        H1([Start]) --> H2[Call claimPrincipal<br/>depositId]
    end

    subgraph SavingCore
        H3{"now &gt;= maturityAt?"}
        H4{interestClaimed?}
        H5[Calculate interest via<br/>InterestLib.calculateInterest]
        H6[Store interest in<br/>pendingInterest depositId]
        H7[Transfer principal<br/>from SavingCore to User]
        H8{Status?}
        H9[Set status =<br/>PrincipalClaimed]
        H10[Set status = Withdrawn]
        H11[Emit Withdrawn<br/>isEarly = false]
    end

    H2 --> H3
    H3 -- No --> HR1([Revert: NotYetMature])
    H3 -- Yes --> H4
    H4 -- Yes --> HR2([Revert: PrincipalAlreadyClaimed])
    H4 -- No --> H5
    H5 --> H6
    H6 --> H7
    H7 --> H8
    H8 -- Active --> H9
    H8 -- Withdrawn --> H10
    H9 --> H11
    H10 --> H11
    H11 --> H12([End])
```

---

## 9. Claim Interest (C1 — Partial Vault Payment) — §8.3

> **Note:** `claimInterest` has `whenNotPaused` on SavingCore. If VaultManager is also paused, `payInterest` reverts.

```mermaid
flowchart TD
    subgraph User
        I1([Start]) --> I2[Call claimInterest<br/>depositId]
    end

    subgraph SavingCore
        I3{Paused?}
        I4{interestClaimed?}
        I5{Status?}
        I6[Path A: Calculate interest<br/>via InterestLib]
        I7{"vault balance<br/>&gt;= interest?"}
        I8[Path A: Pay full interest<br/>via payInterest]
        I9[Path A: Set interestClaimed = true,<br/>status = Withdrawn]
        I10[Path A: Pay partial interest,<br/>store remainder in pendingInterest]
        I11[Path B: Read pendingInterest]
        I12{"pendingInterest &gt; 0?"}
        I13[Path B: Pay pendingInterest<br/>via payInterest]
        I14[Path B: Clear pendingInterest,<br/>set interestClaimed = true,<br/>status = Withdrawn]
        I15[Path B: Pay partial pending,<br/>update pendingInterest]
        I16[Emit InterestClaimed]
    end

    subgraph VaultManager
        I17[Transfer interest<br/>to User]
    end

    I2 --> I3
    I3 -- Yes --> IR1([Revert: EnforcedPause])
    I3 -- No --> I4
    I4 -- Yes --> IR2([Revert: InterestAlreadyClaimed])
    I4 -- No --> I5
    I5 -- Active --> I6
    I5 -- PrincipalClaimed --> I11
    I5 -- Withdrawn/ManualRenewed/AutoRenewed --> IR3([Revert: AlreadyWithdrawn])
    I6 --> I7
    I7 -- Yes --> I8
    I8 --> I17
    I17 --> I9
    I9 --> I16
    I7 -- No --> I10
    I10 --> I16
    I11 --> I12
    I12 -- No --> IR4([Revert: NoPendingInterest])
    I12 -- Yes --> I13
    I13 --> I17
    I17 --> I14
    I14 --> I16
    I12 -- vault insufficient --> I15
    I15 --> I16
    I16 --> I18([End])
```

---

## 10. Burn NFT — §2.2, §8.3 C1

> **Note:** `burn` has no `nonReentrant` (safe — only burns token). Blocked if `pendingInterest > 0` via `_update` override.

```mermaid
flowchart TD
    subgraph User
        J1([Start]) --> J2[Call burn<br/>depositId]
    end

    subgraph SavingCore
        J3{"deposit status<br/>!= Active?"}
        J4{pendingInterest<br/>depositId == 0?}
        J5[Burn ERC721 NFT]
    end

    J2 --> J3
    J3 -- No --> JR1([Revert: Cannot burn active deposit])
    J3 -- Yes --> J4
    J4 -- No --> JR2([Revert: PendingInterestExists])
    J4 -- Yes --> J5
    J5 --> JR3([End])
```

---

## Flow Summary Table

| # | Flow | Actor | Paused? | Status Allowed | Key Decision Points | Source |
|---|------|-------|:-------:|----------------|---------------------|--------|
| 1 | Open Deposit | User | No check | N/A | Plan exists/enabled, amount > 0, min/max | §3.1 |
| 2 | Withdraw at Maturity | User | ✅ Blocked | Active only | Mature, status, interestClaimed | §3.2 |
| 3 | Early Withdraw | User | No check | Active only | feeReceiver set | §3.3 |
| 4 | Manual Renew | User | ✅ Blocked | Active, PrincipalClaimed | Mature, newPlanId exists/enabled | §3.4 |
| 5 | Auto-Renew | Bot | ✅ Blocked | Active, PrincipalClaimed | Grace period expired | §3.5 |
| 6 | Plan Management | Admin | No check | N/A | Plan exists, valid inputs | §4 |
| 7 | Vault & System | Admin | Partial | N/A | Balance check, one-shot setter | §4 |
| 8 | Claim Principal | User | No check | Active, Withdrawn | Mature, interestClaimed | §8.3 C1 |
| 9 | Claim Interest | User | ✅ Blocked | Active, PrincipalClaimed | interestClaimed, vault balance, pending | §8.3 C1 |
| 10 | Burn NFT | User | No check | Withdrawn+ | pendingInterest == 0 | §2.2, §8.3 C1 |
