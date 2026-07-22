# Access Control

This document defines who is authorized to execute each function in the Online Saving System.

The project uses **OpenZeppelin Ownable2Step** for administrator access control.

---

# Roles

## Owner (Administrator)

The contract owner manages the system configuration.

Responsibilities include:

- Create saving plans
- Update saving plans
- Enable/disable plans
- Fund the vault
- Withdraw excess funds from the vault

---

## Depositor

A depositor is any user interacting with the protocol.

Responsibilities include:

- Open deposits
- Withdraw deposits
- Renew deposits

---

## SavingCore Contract

Some internal operations should only be callable by the `SavingCore` contract.

Example:

- `payInterest()`

This restriction prevents external users from moving vault funds directly.

---

# Access Control Matrix

| Function | Caller | Protection |
|----------|--------|------------|
| createPlan | Owner | `onlyOwner` |
| updatePlan | Owner | `onlyOwner` |
| enablePlan | Owner | `onlyOwner` |
| disablePlan | Owner | `onlyOwner` |
| fundVault | Owner | `onlyOwner` |
| withdrawVault | Owner | `onlyOwner` |
| openDeposit | Anyone | Public |
| withdraw | NFT Owner | `ownerOf(tokenId)` |
| renew | NFT Owner | `ownerOf(tokenId)` |
| payInterest | SavingCore | `onlySavingCore` *(custom modifier)* |

---

# Authorization Flow

```text
                Owner
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 createPlan   updatePlan   fundVault

────────────────────────────────────

                User
                  │
      ┌───────────┴───────────┐
      ▼                       ▼
 openDeposit             ownerOf(tokenId)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                withdraw            renew

────────────────────────────────────

            SavingCore
                  │
                  ▼
            payInterest
```

---

# Design Decisions

## Why Ownable2Step?

The project currently has only one administrative role.

Using `Ownable2Step` provides:

- Simple permission management
- Safer ownership transfer
- Lower complexity than `AccessControl`

If multiple administrative roles are required in the future (e.g. `PLAN_MANAGER`, `PAUSER`, `VAULT_MANAGER`), the system can be migrated to `AccessControl`.

---

# Testing Checklist

| Scenario | Expected Result |
|----------|-----------------|
| Owner creates a plan | Success |
| Non-owner creates a plan | Revert |
| User opens a deposit | Success |
| Non-owner withdraws another user's deposit | Revert |
| NFT owner withdraws own deposit | Success |
| External account calls `payInterest()` | Revert |
| SavingCore calls `payInterest()` | Success |