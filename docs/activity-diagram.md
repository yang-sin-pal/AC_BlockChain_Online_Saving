# Activity Diagrams

This document describes the activity diagrams for the **Blockchain-Based Online Saving System**. Each diagram covers one major user flow or admin operation, using Mermaid `flowchart TD` with swimlanes.

---

## System Parameters (Personal Variant — ID ending in 38)

| Parameter | Value |
|-----------|-------|
| Grace Period | 4 days |
| Default APR | 400 bps (4.00%) |
| Early Withdrawal Penalty | 450 bps (4.50%) |
| Default Tenor | 180 days |

---

## 1. Open Deposit Flow

```mermaid
flowchart TD
    subgraph User
        A1([Start]) --> A2[Approve MockUSDC spending\nfor SavingCore]
        A2 --> A3[Call openDeposit\nplanId, amount]
    end

    subgraph SavingCore
        A4{Plan enabled?}
        A5{amount >= minDeposit?}
        A6{amount <= maxDeposit?}
        A7[Transfer tokens from User\nto SavingCore]
        A8[Snapshot aprBps &\npenaltyBps at open]
        A9[Mint ERC721 NFT\nto User]
        A10[Set status = Active]
        A11[Calculate maturityAt =\nblock.timestamp + tenorDays * 86400]
        A12[Emit DepositOpened]
    end

    subgraph MockUSDC
        A13[Transfer tokens from\nUser to SavingCore]
    end

    A3 --> A4
    A4 -- No --> A4R([Revert: Plan disabled])
    A4 -- Yes --> A5
    A5 -- No --> A5R([Revert: Below minimum])
    A5 -- Yes --> A6
    A6 -- No --> A6R([Revert: Above maximum])
    A6 -- Yes --> A13
    A13 --> A7
    A7 --> A8
    A8 --> A9
    A9 --> A10
    A10 --> A11
    A11 --> A12
    A12 --> A14([End])
```

---

## 2. Withdraw at Maturity Flow

```mermaid
flowchart TD
    subgraph User
        B1([Start]) --> B2[Call withdrawAtMaturity\ndepositId]
    end

    subgraph SavingCore
        B3{Paused?}
        B4{status == Active?}
        B5{now >= maturityAt?}
        B6[Calculate interest =\nprincipal * aprBpsAtOpen * tenorSeconds\n/ 365 * 86400 * 10000]
        B7[Transfer principal\nfrom SavingCore to User]
        B8[Set status = Withdrawn]
        B9[Emit Withdrawn\nisEarly = false]
    end

    subgraph VaultManager
        B10{Vault balance >= interest?}
        B11[Transfer interest\nfrom VaultManager to User]
    end

    B2 --> B3
    B3 -- Yes --> BR1([Revert: System paused])
    B3 -- No --> B4
    B4 -- No --> BR2([Revert: Not active])
    B4 -- Yes --> B5
    B5 -- No --> BR3([Revert: Not yet mature])
    B5 -- Yes --> B6
    B6 --> B7
    B7 --> B10
    B10 -- No --> BR4([Revert: Vault insufficient])
    B10 -- Yes --> B11
    B11 --> B8
    B8 --> B9
    B9 --> B12([End])
```

---

## 3. Early Withdraw Flow

```mermaid
flowchart TD
    subgraph User
        C1([Start]) --> C2[Call withdrawAtMaturity\ndepositId]
    end

    subgraph SavingCore
        C3{Paused?}
        C4{status == Active?}
        C5{now < maturityAt?}
        C6[Calculate penalty =\nprincipal * penaltyBpsAtOpen / 10000]
        C7[Transfer principal - penalty\nfrom SavingCore to User]
        C8[Transfer penalty\nto feeReceiver]
        C9[Set status = Withdrawn]
        C10[Emit Withdrawn\nisEarly = true]
    end

    subgraph feeReceiver
        C11[Receive penalty]
    end

    C2 --> C3
    C3 -- Yes --> CR1([Revert: System paused])
    C3 -- No --> C4
    C4 -- No --> CR2([Revert: Not active])
    C4 -- Yes --> C5
    C5 -- No --> CR3([Use maturity path])
    C5 -- Yes --> C6
    C6 --> C7
    C6 --> C8
    C7 --> C9
    C8 --> C11
    C9 --> C10
    C10 --> C12([End])
```

---

## 4. Manual Renew Flow

```mermaid
flowchart TD
    subgraph User
        D1([Start]) --> D2[Call renewDeposit\ndepositId, newPlanId]
    end

    subgraph SavingCore
        D3{Paused?}
        D4{status == Active?}
        D5{now >= maturityAt?}
        D6[Calculate interest on\nold deposit]
        D7[newPrincipal =\nprincipal + interest]
        D8[Snapshot new plan's\nAPR & penalty]
        D9[Mint new ERC721 NFT\nwith newPrincipal]
        D10[Set old status =\nManualRenewed]
        D11[Emit Renewed\noldId, newId,\nnewPrincipal, newPlanId]
    end

    D2 --> D3
    D3 -- Yes --> DR1([Revert: System paused])
    D3 -- No --> D4
    D4 -- No --> DR2([Revert: Not active])
    D4 -- Yes --> D5
    D5 -- No --> DR3([Revert: Not yet mature])
    D5 -- Yes --> D6
    D6 --> D7
    D7 --> D8
    D8 --> D9
    D9 --> D10
    D10 --> D11
    D11 --> D12([End])
```

---

## 5. Auto-Renew Flow

```mermaid
flowchart TD
    subgraph Bot
        E1([Start]) --> E2[Call autoRenewDeposit\ndepositId]
    end

    subgraph SavingCore
        E3{status == Active?}
        E4{now >= maturityAt +\ngracePeriod?}
        E5[Calculate interest on\nold deposit]
        E6[newPrincipal =\nprincipal + interest]
        E7[Reuse original\naprBpsAtOpen\nNOT current plan APR]
        E8[Mint new ERC721 NFT\nsame tenor, locked APR]
        E9[Set old status =\nAutoRenewed]
        E10[Emit Renewed\noldId, newId,\nnewPrincipal, samePlanId]
    end

    E2 --> E3
    E3 -- No --> ER1([Revert: Not active])
    E3 -- Yes --> E4
    E4 -- No --> ER2([Revert: Grace period\nnot yet expired])
    E4 -- Yes --> E5
    E5 --> E6
    E6 --> E7
    E7 --> E8
    E8 --> E9
    E9 --> E10
    E10 --> E11([End])
```

---

## 6. Admin — Plan Management

```mermaid
flowchart TD
    subgraph BankAdmin
        F1([Start: Create Plan]) --> F2[Call createPlan\ntenor, apr, min, max, penalty]
        F3([Start: Update Plan]) --> F4[Call updatePlan\nplanId, newAprBps]
        F5([Start: Enable/Disable]) --> F6[Call enablePlan /\ndisablePlan planId]
    end

    subgraph SavingCore
        F7[Validate inputs\ntenor > 0, apr > 0]
        F8[Store plan with\nnextPlanId]
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
    F10 -- No --> FR1([Revert: Plan not found])
    F10 -- Yes --> F11
    F11 --> F12
    F12 --> F15([End])

    F6 --> F13
    F13 --> F16([End])
```

---

## 7. Admin — Vault & System Management

```mermaid
flowchart TD
    subgraph BankAdmin
        G1([Start: Fund Vault]) --> G2[Call fundVault\namount]
        G3([Start: Withdraw Vault]) --> G4[Call withdrawVault\namount]
        G5([Start: Set Fee Receiver]) --> G6[Call setFeeReceiver\naddress]
        G7([Start: Pause]) --> G8[Call pause]
        G9([Start: Unpause]) --> G10[Call unpause]
    end

    subgraph VaultManager
        G11[Transfer tokens from\nAdmin to VaultManager]
        G12{amount <= vaultBalance?}
        G13[Transfer tokens from\nVaultManager to Admin]
        G14[Update feeReceiver address]
        G15[Set paused = true]
        G16[Set paused = false]
    end

    subgraph MockUSDC
        G17[Transfer tokens]
    end

    G2 --> G11
    G11 --> G18([End])

    G4 --> G12
    G12 -- No --> GR1([Revert: Insufficient balance])
    G12 -- Yes --> G13
    G13 --> G19([End])

    G6 --> G14
    G14 --> G20([End])

    G8 --> G15
    G15 --> G21([End])

    G10 --> G16
    G16 --> G22([End])
```

---

## Bonus Challenges

### C1: Principal Protection (Vault Empty)

Extends Diagram 2 (Withdraw at Maturity). When the vault cannot pay full interest:

```mermaid
flowchart TD
    subgraph User
        H1([Start]) --> H2[Call withdrawAtMaturity\ndepositId]
    end

    subgraph SavingCore
        H3[Calculate interest]
        H4{Vault balance >= interest?}
        H5[Pay principal + interest\nfrom SavingCore + VaultManager]
        H6[Pay principal NOW\nfrom SavingCore]
        H7[Record debt = interest\nin pendingInterest depositId]
        H8[Set status = Withdrawn]
        H9[Emit Withdrawn\nisEarly = false]
    end

    subgraph VaultManager
        H10[Transfer interest if\nfunded]
        H11[Later: user calls\nclaimPendingInterest]
    end

    H2 --> H3
    H3 --> H4
    H4 -- Yes --> H5
    H5 --> H8
    H4 -- No --> H6
    H6 --> H7
    H7 --> H8
    H8 --> H9
    H9 --> H12([End])

    H7 -.-> H11
```

---

### C2: Solvency Guard (Vault Withdraw Check)

Extends Diagram 7 (Admin — Withdraw Vault):

```mermaid
flowchart TD
    subgraph BankAdmin
        I1([Start]) --> I2[Call withdrawVault\namount]
    end

    subgraph VaultManager
        I3[Calculate totalOwedInterest =\nsum of all active deposits interest]
        I4{vaultBalance - amount >=\ntotalOwedInterest?}
        I5[Transfer amount to Admin]
        I6[Revert: Would break\ninterest obligations]
    end

    I2 --> I3
    I3 --> I4
    I4 -- Yes --> I5
    I5 --> I7([End])
    I4 -- No --> I6
```

---

### C3: Partial Early Withdraw

Extends Diagram 3 (Early Withdraw):

```mermaid
flowchart TD
    subgraph User
        J1([Start]) --> J2[Call partialEarlyWithdraw\ndepositId, withdrawAmount]
    end

    subgraph SavingCore
        J3{withdrawAmount <=\ndeposit.principal?}
        J4[Calculate penalty =\nwithdrawAmount * penaltyBpsAtOpen / 10000]
        J5[Transfer withdrawAmount - penalty\nto User]
        J6[Transfer penalty\nto feeReceiver]
        J7[Update deposit.principal -=\nwithdrawAmount]
        J8{deposit.principal == 0?}
        J9[Set status = Withdrawn]
        J10[Deposit remains Active\nwith reduced principal]
    end

    J2 --> J3
    J3 -- No --> JR1([Revert: Amount exceeds principal])
    J3 -- Yes --> J4
    J4 --> J5
    J4 --> J6
    J5 --> J7
    J6 --> J7
    J7 --> J8
    J8 -- Yes --> J9
    J9 --> JR2([End])
    J8 -- No --> J10
    J10 --> JR3([End])
```

---

### C4: Top-up Deposit

```mermaid
flowchart TD
    subgraph User
        K1([Start]) --> K2[Approve MockUSDC spending]
        K2 --> K3[Call topUpDeposit\ndepositId, addAmount]
    end

    subgraph SavingCore
        K4{status == Active?}
        K5{now < maturityAt?}
        K6[Transfer addAmount from User\nto SavingCore]
        K7[Recalculate fair interest\nfor combined principal]
        K8[Update deposit.principal +=\naddAmount]
        K9[Emit DepositToppedUp\ndepositId, addAmount,\nnewPrincipal]
    end

    subgraph MockUSDC
        K10[Transfer tokens]
    end

    K3 --> K4
    K4 -- No --> KR1([Revert: Not active])
    K4 -- Yes --> K5
    K5 -- No --> KR2([Revert: Already mature])
    K5 -- Yes --> K10
    K10 --> K6
    K6 --> K7
    K7 --> K8
    K8 --> K9
    K9 --> K11([End])
```

---

## Flow Summary Table

| # | Flow | Actor | Key Decision Points |
|---|------|-------|---------------------|
| 1 | Open Deposit | User | Plan enabled, min/max bounds |
| 2 | Withdraw at Maturity | User | Paused, active, mature, vault funded |
| 3 | Early Withdraw | User | Paused, active, before maturity |
| 4 | Manual Renew | User | Paused, active, at/past maturity |
| 5 | Auto-Renew | Bot | Active, grace period expired |
| 6 | Plan Management | Admin | Plan exists, valid inputs |
| 7 | Vault & System | Admin | Balance check, pause state |
| C1 | Principal Protection | User | Vault insufficient -> pay principal only |
| C2 | Solvency Guard | Admin | Withdraw would break obligations |
| C3 | Partial Early Withdraw | User | Amount within principal, partial penalty |
| C4 | Top-up Deposit | User | Active, not yet mature |
