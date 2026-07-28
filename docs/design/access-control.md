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
- Pause/unpause both SavingCore and VaultManager

---

## Depositor

A depositor is any user interacting with the protocol.

Responsibilities include:

- Open deposits
- Withdraw deposits
- Claim principal (C1)
- Claim interest (C1)
- Renew deposits

---

## SavingCore Contract

Some internal operations should only be callable by the `SavingCore` contract.

Example:

- `payInterest()` on VaultManager

This restriction prevents external users from moving vault funds directly.

---

## Bot (Off-chain Automation)

Some operations can be triggered by anyone, typically an off-chain bot.

Example:

- `autoRenewDeposit()` — no owner check, bot-triggerable

---

# Access Control Matrix

## SavingCore Functions

| Function | Caller | Protection | Modifiers |
|----------|--------|------------|-----------|
| `createPlan` | Owner | `onlyOwner` | — |
| `updatePlan` | Owner | `onlyOwner` | — |
| `enablePlan` | Owner | `onlyOwner` | — |
| `disablePlan` | Owner | `onlyOwner` | — |
| `pause` | Owner | `onlyOwner` | — |
| `unpause` | Owner | `onlyOwner` | — |
| `openDeposit` | Anyone | Public | `nonReentrant` |
| `withdrawAtMaturity` | NFT Owner | `onlyDepositOwner` | `nonReentrant`, `whenNotPaused`, `onlyDepositOwner` |
| `claimPrincipal` | NFT Owner | `onlyDepositOwner` | `nonReentrant`, `onlyDepositOwner` (**no `whenNotPaused`**) |
| `claimInterest` | NFT Owner | `onlyDepositOwner` | `nonReentrant`, `whenNotPaused`, `onlyDepositOwner` |
| `earlyWithdraw` | NFT Owner | `onlyDepositOwner` | `nonReentrant`, `onlyDepositOwner` (**no `whenNotPaused`**) |
| `renewDeposit` | NFT Owner | `onlyDepositOwner` | `nonReentrant`, `whenNotPaused`, `onlyDepositOwner` |
| `autoRenewDeposit` | Anyone | Public | `nonReentrant`, `whenNotPaused` (**no owner check**) |

## VaultManager Functions

| Function | Caller | Protection | Modifiers |
|----------|--------|------------|-----------|
| `fundVault` | Owner | `onlyOwner` | — |
| `withdrawVault` | Owner | `onlyOwner` | `nonReentrant`, `whenNotPaused` |
| `setFeeReceiver` | Owner | `onlyOwner` | — |
| `setSavingCore` | Owner (once) | `onlyOwner` + one-shot | — |
| `pause` | Owner | `onlyOwner` | — |
| `unpause` | Owner | `onlyOwner` | — |
| `payInterest` | SavingCore | `onlySavingCore` | `nonReentrant`, `whenNotPaused` |

---

# Dual-Pause Architecture

The system has **two independent pause states** — one for SavingCore and one for VaultManager. They can be toggled independently.

## SavingCore Pause

When SavingCore is paused, the following functions are blocked:

| Function | Blocked? | Reason |
|----------|----------|--------|
| `withdrawAtMaturity` | YES | `whenNotPaused` |
| `claimInterest` | YES | `whenNotPaused` |
| `renewDeposit` | YES | `whenNotPaused` |
| `autoRenewDeposit` | YES | `whenNotPaused` |
| `claimPrincipal` | **NO** | Users can always reclaim principal |
| `earlyWithdraw` | **NO** | Users can always exit early |
| `openDeposit` | **NO** | New deposits still accepted |

## VaultManager Pause

When VaultManager is paused, the following functions are blocked:

| Function | Blocked? | Reason |
|----------|----------|--------|
| `withdrawVault` | YES | `whenNotPaused` |

**Note:** `payInterest` on VaultManager has `whenNotPaused` — no money leaves the vault during emergency. Users can still claim principal via `claimPrincipal` (no vault dependency), but interest is deferred to `pendingInterest` until vault is unpaused.

---

# Authorization Flow

```text
                    Owner
                      │
      ┌───────────────┼───────────────┐
      ▼               ▼               ▼
 createPlan       updatePlan       fundVault
 enablePlan       disablePlan      withdrawVault
 setFeeReceiver   setSavingCore    pause/unpause
      │                               │
      │                               ▼
      │                      VaultManager.pause()
      │                      VaultManager.unpause()
      │
      ▼
 SavingCore.pause()
 SavingCore.unpause()

───────────────────────────────────────

                    User
                      │
      ┌───────────────┴───────────────┐
      ▼                               ▼
 openDeposit                 ownerOf(tokenId)
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
        withdrawAtMaturity   claimPrincipal      earlyWithdraw
        claimInterest                           renewDeposit

───────────────────────────────────────

                Bot (Anyone)
                      │
                      ▼
              autoRenewDeposit

───────────────────────────────────────

              SavingCore
                    │
                    ▼
              payInterest (VaultManager)
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

## Why Dual Pause?

SavingCore and VaultManager have separate pause states because:

1. **SavingCore pause** protects users from exploits in renew/withdraw flows while allowing principal reclaim.
2. **VaultManager pause** protects the vault from draining while allowing interest payments to continue.
3. They serve different security purposes and may need to be toggled independently.

## Why `claimPrincipal` Has No `whenNotPaused`?

The C1 (Principal Protection) feature guarantees users can always reclaim their principal, even during emergencies. This is a core architectural principle — principal safety is paramount.

---

# Testing Checklist

## SavingCore Access Control

| Scenario | Expected Result |
|----------|----------------|
| Owner creates a plan | Success |
| Non-owner creates a plan | Revert |
| Owner pauses SavingCore | Success |
| Owner unpauses SavingCore | Success |
| User opens a deposit | Success |
| Non-owner withdraws another user's deposit | Revert (`SavingCore_NotOwner`) |
| NFT owner withdraws own deposit | Success |
| NFT owner claims principal | Success |
| NFT owner claims interest | Success |
| Bot calls autoRenewDeposit | Success |
| NFT owner calls renewDeposit | Success |

## VaultManager Access Control

| Scenario | Expected Result |
|----------|----------------|
| Owner funds vault | Success |
| Non-owner funds vault | Revert |
| Owner withdraws from vault | Success |
| Owner pauses VaultManager | Success |
| Owner unpauses VaultManager | Success |
| External account calls `payInterest()` | Revert (`VaultManager_OnlySavingCore`) |
| SavingCore calls `payInterest()` | Success |
| Owner sets feeReceiver | Success |
| Owner sets savingCore (first time) | Success |
| Owner tries to set savingCore again | Revert (`VaultManager_SavingCoreAlreadySet`) |

## Pause Behavior

| Scenario | Expected Result |
|----------|----------------|
| SavingCore paused → withdrawAtMaturity | Revert (whenNotPaused) |
| SavingCore paused → claimPrincipal | Success (no whenNotPaused) |
| SavingCore paused → claimInterest | Revert (whenNotPaused) |
| SavingCore paused → earlyWithdraw | Success (no whenNotPaused) |
| SavingCore paused → renewDeposit | Revert (whenNotPaused) |
| SavingCore paused → autoRenewDeposit | Revert (whenNotPaused) |
| VaultManager paused → withdrawVault | Revert (whenNotPaused) |
| VaultManager paused → payInterest | Revert (whenNotPaused) |