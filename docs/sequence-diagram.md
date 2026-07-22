# Sequence Diagrams

This document describes the main workflows of the Online Saving System.

---

# 1. Open Deposit

```mermaid
sequenceDiagram
    actor User
    participant USDC as MockUSDC
    participant Core as SavingCore
    participant Vault as VaultManager

    User->>USDC: approve(amount)
    User->>Core: openDeposit(planId, amount)

    Core->>USDC: transferFrom(user, Core, amount)
    USDC-->>Core: USDC transferred

    Core->>Core: Validate plan
    Core->>Core: Create Deposit
    Core->>Core: Mint ERC721 Certificate

    Core-->>User: Deposit Created
```

---

# 2. Withdraw at Maturity

```mermaid
sequenceDiagram
    actor User
    participant Core as SavingCore
    participant Vault as VaultManager
    participant USDC as MockUSDC

    User->>Core: withdrawAtMaturity(depositId)

    Core->>Core: Check maturity
    Core->>Core: Calculate interest

    Core->>USDC: transfer(user, principal)
    Core->>Vault: payInterest(user, interest)
    Vault->>USDC: transfer(user, interest)

    Core-->>User: Receive principal + interest
```

---

# 3. Early Withdrawal

```mermaid
sequenceDiagram
    actor User
    participant Core as SavingCore
    participant USDC as MockUSDC

    User->>Core: earlyWithdraw(depositId)

    Core->>Core: Check deposit status
    Core->>Core: Calculate penalty

    Core->>USDC: transfer(user, principal - penalty)
    Core->>USDC: transfer(feeReceiver, penalty)

    Core-->>User: Receive principal - penalty
```

---

# 4. Renew Deposit

```mermaid
sequenceDiagram
    actor User
    participant Core as SavingCore
    participant Vault as VaultManager
    participant USDC as MockUSDC

    User->>Core: renewDeposit(depositId, newPlanId)

    Core->>Core: Verify maturity
    Core->>Core: Calculate interest

    Core->>Vault: payInterest(SavingCore, interest)
    Vault->>USDC: transfer(SavingCore, interest)

    Core->>Core: newPrincipal = old + interest
    Core->>Core: Create new deposit
    Core->>Core: Update old deposit status to ManualRenewed

    Core-->>User: Deposit Renewed
```

---

# 5. Admin Creates a Saving Plan

```mermaid
sequenceDiagram
    actor Admin
    participant Core as SavingCore

    Admin->>Core: createPlan(...)

    Core->>Core: Validate parameters
    Core->>Core: Store new plan

    Core-->>Admin: Plan Created
```

---

# 6. Admin Funds the Vault

```mermaid
sequenceDiagram
    actor Admin
    participant USDC as MockUSDC
    participant Vault as VaultManager

    Admin->>USDC: approve(amount)
    Admin->>Vault: fundVault(amount)

    Vault->>USDC: transferFrom(admin, Vault, amount)

    Vault-->>Admin: Fund Successful
```

---

# Notes

- All deposits are stored in `SavingCore`.
- User funds (principal) are held by `SavingCore`. Bank interest pool is held by `VaultManager`.
- `MockUSDC` is used only for local testing.
- Each successful deposit mints an ERC721 certificate representing ownership.