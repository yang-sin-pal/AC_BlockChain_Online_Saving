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
    Note right of User: §3.1 step 1

    User->>Core: openDeposit(planId, amount)
    Note right of User: §3.1 step 2

    Core->>USDC: transferFrom(user, Core, amount)
    Note right of Core: §3.1 step 4 — holds the principal
    USDC-->>Core: USDC transferred

    Core->>Core: Validate plan
    Note right of Core: §3.1 step 3 — plan enabled, min/max check

    Core->>Core: Create Deposit
    Note right of Core: §3.1 step 6 — status = Active, maturityAt set

    Core->>Core: Snapshot APR and penalty
    Note right of Core: §3.1 — locked at open, never changes

    Core->>Core: Mint ERC721 Certificate
    Note right of Core: §3.1 step 5 — NFT with unique depositId

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
    Note right of User: §3.2 — calls withdrawAtMaturity(depositId)

    Core->>Core: Check maturity
    Note right of Core: §3.1 step 6 — maturityAt = block.timestamp + tenorDays * 86400

    Core->>Core: Calculate interest
    Note right of Core: §3.2 formula — (principal * aprBpsAtOpen * tenorSeconds) / (365 * 24 * 3600 * 10,000)

    Core->>USDC: transfer(user, principal)
    Note right of Core: §1.1 Key idea — SavingCore holds the users' principal

    Core->>Vault: payInterest(user, interest)
    Note right of Core: §3.2 — interest is paid from the VaultManager
    Note right of Vault: §6 Rule 5 — Interest is always paid from the vault

    Vault->>USDC: transfer(user, interest)

    Core-->>User: Receive principal + interest
    Note right of User: §3.2 — Alice receives: 1,000 + 6.16 = 1,006.16 USDC
```

---

# 3. Early Withdrawal

```mermaid
sequenceDiagram
    actor User
    participant Core as SavingCore
    participant USDC as MockUSDC

    User->>Core: earlyWithdraw(depositId)
    Note right of User: §3.3 — user withdraws before maturity date

    Core->>Core: Check deposit status
    Note right of Core: §3.3 — they receive no interest

    Core->>Core: Calculate penalty
    Note right of Core: §3.3 formula — penalty = (principal * penaltyBpsAtOpen) / 10,000

    Core->>USDC: transfer(user, principal - penalty)
    Note right of Core: §3.3 — user receives = principal - penalty

    Core->>USDC: transfer(feeReceiver, penalty)
    Note right of Core: §3.3 — penalty goes to feeReceiver (set by admin)

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
    Note right of User: §3.4 step 1 — calls renewDeposit on or after maturityAt

    Core->>Core: Verify maturity
    Note right of Core: §3.4 step 1 — must be on or after maturityAt

    Core->>Core: Calculate interest
    Note right of Core: §3.4 step 2 — interest earned on the old deposit

    Core->>Vault: payInterest(SavingCore, interest)
    Note right of Core: §3.2 — interest is paid from the VaultManager
    Note right of Vault: §6 Rule 5 — Interest is always paid from the vault

    Vault->>USDC: transfer(SavingCore, interest)

    Core->>Core: newPrincipal = old + interest
    Note right of Core: §3.4 step 3 — interest is compounded into the principal

    Core->>Core: Create new deposit
    Note right of Core: §3.4 step 4 — new deposit NFT minted using new plan's rate

    Core->>Core: Update old deposit status to ManualRenewed
    Note right of Core: §3.4 step 5 — old deposit status set to ManualRenewed

    Core-->>User: Deposit Renewed
```

---

# 5. Admin Creates a Saving Plan

```mermaid
sequenceDiagram
    actor Admin
    participant Core as SavingCore

    Admin->>Core: createPlan(...)
    Note right of Admin: §4 — createPlan: tenor, APR, limits, penalty

    Core->>Core: Validate parameters
    Note right of Core: §2.1 — tenorDays, aprBps, minDeposit, maxDeposit, enabled

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
    Note right of Admin: §4 — fundVault(amount)

    Admin->>Vault: fundVault(amount)
    Note right of Vault: §4 — Deposit tokens into the vault to cover interest payments

    Vault->>USDC: transferFrom(admin, Vault, amount)
    Note right of Vault: §1.1 table — VaultManager holds the bank's own money (interest pool)

    Vault-->>Admin: Fund Successful
```

---

# Notes

- All deposits are stored in `SavingCore`. (§1.1 table — SavingCore: "All business logic: plans, open deposit, withdraw, renew")
- User funds (principal) are held by `SavingCore`. Bank interest pool is held by `VaultManager`. (§1.1 Key idea — "SavingCore holds the users' principal. VaultManager holds the bank's interest money.")
- `MockUSDC` is used only for local testing. (§1.1 table — MockUSDC: "A fake USDC token, 6 decimals, anyone can mint it for testing.")
- Each successful deposit mints an ERC721 certificate representing ownership. (§2.2 — "When a user opens a deposit, the contract mints an ERC721 NFT")