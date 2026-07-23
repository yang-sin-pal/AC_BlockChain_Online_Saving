# Contract API

This document defines every public/external function, parameter, return value, and event for `ISavingCore` and `IVaultManager`.

Source interfaces: `contracts/interfaces/ISavingCore.sol`, `contracts/interfaces/IVaultManager.sol`.

---

## ISavingCore

### Data Types

#### Status (enum)

| Value | Meaning |
|-------|---------|
| `Active` | Deposit is live and earning interest. |
| `Withdrawn` | Deposit has been fully withdrawn (maturity or early). |
| `ManualRenewed` | Deposit was renewed by the owner to a new plan. |
| `AutoRenewed` | Deposit was auto-renewed after grace period. |

#### Plan (struct)

| Field | Type | Description |
|-------|------|-------------|
| `tenorDays` | `uint256` | Term length in days. |
| `aprBps` | `uint256` | Annual interest rate in basis points (100 = 1.00%). |
| `minDeposit` | `uint256` | Minimum deposit amount in USDC units. 0 = no limit. |
| `maxDeposit` | `uint256` | Maximum deposit amount in USDC units. 0 = no limit. |
| `earlyWithdrawPenaltyBps` | `uint256` | Early withdrawal penalty in basis points (500 = 5.00%). |
| `enabled` | `bool` | Whether the plan accepts new deposits. |

#### Deposit (struct)

| Field | Type | Description |
|-------|------|-------------|
| `planId` | `uint256` | ID of the plan this deposit was opened under. |
| `principal` | `uint256` | Deposited amount in USDC units. |
| `aprBpsAtOpen` | `uint256` | APR snapshot at deposit open time (immutable). |
| `penaltyBpsAtOpen` | `uint256` | Penalty snapshot at deposit open time (immutable). |
| `startAt` | `uint256` | Unix timestamp when the deposit was opened. |
| `maturityAt` | `uint256` | Unix timestamp when the deposit matures. |
| `status` | `Status` | Current deposit status. |

---

### Admin Functions

#### createPlan

Creates a new saving plan.

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `tenorDays` | `uint256` | Term length in days. |
| `aprBps` | `uint256` | Annual interest rate in basis points. |
| `minDeposit` | `uint256` | Minimum deposit amount. 0 = no limit. |
| `maxDeposit` | `uint256` | Maximum deposit amount. 0 = no limit. |
| `earlyWithdrawPenaltyBps` | `uint256` | Early withdrawal penalty in basis points. |

| Return | Type | Description |
|--------|------|-------------|
| `planId` | `uint256` | ID of the newly created plan. |

---

#### updatePlan

Updates the APR of an existing plan. Does not affect previously opened deposits (BR-04).

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `planId` | `uint256` | ID of the plan to update. |
| `newAprBps` | `uint256` | New APR in basis points. |

---

#### enablePlan

Enables a plan to allow new deposits (BR-11).

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `planId` | `uint256` | ID of the plan to enable. |

---

#### disablePlan

Disables a plan to block new deposits. Existing active deposits remain unaffected (BR-11).

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `planId` | `uint256` | ID of the plan to disable. |

---

### User Functions

#### openDeposit

Opens a new deposit. User must call `approve()` on the MockUSDC token before calling this function.

- **Access:** Anyone.
- **Business rules:** BR-01 (amount within limits), BR-02 (plan enabled), BR-05 (mints one NFT), BR-04 (APR/penalty snapshot).

| Parameter | Type | Description |
|-----------|------|-------------|
| `planId` | `uint256` | ID of the plan to deposit into. |
| `amount` | `uint256` | Deposit amount in USDC units (must be within `minDeposit..maxDeposit`). |

| Return | Type | Description |
|--------|------|-------------|
| `depositId` | `uint256` | ID of the newly created deposit (also the NFT tokenId). |

---

#### withdrawAtMaturity

Withdraws principal + simple interest at or after maturity. Interest is paid from the VaultManager vault (BR-10).

- **Access:** NFT owner only (`ownerOf(depositId) == msg.sender`).
- **Business rules:** BR-07 (single withdrawal), BR-09 (correct interest math), BR-10 (vault solvency check), BR-12 (reentrancy guard).

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit to withdraw. |

---

#### earlyWithdraw

Early withdrawal — no interest, penalty deducted from principal, penalty sent to feeReceiver (BR-17).

- **Access:** NFT owner only (`ownerOf(depositId) == msg.sender`).
- **Business rules:** BR-07 (single withdrawal), BR-08 (penalty enforced, zero interest), BR-17 (penalty routing).

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit to withdraw early. |

---

#### renewDeposit

Manual renewal to a new plan after maturity. Interest is compounded into the new principal.

- **Access:** NFT owner only (`ownerOf(depositId) == msg.sender`).
- **Business rules:** BR-13 (maturity check, compound interest, new plan rate, old status update).

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the old deposit. |
| `newPlanId` | `uint256` | ID of the new plan to switch to. |

| Return | Type | Description |
|--------|------|-------------|
| `newDepositId` | `uint256` | ID of the newly created deposit. |

---

#### autoRenewDeposit

Bot-triggered auto-renewal after the grace period. Preserves the original `aprBpsAtOpen` (BR-15) and same tenor.

- **Access:** Anyone (typically an off-chain bot).
- **Business rules:** BR-14 (grace period check), BR-15 (original APR locked), BR-16 (paused check).

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit to auto-renew. |

| Return | Type | Description |
|--------|------|-------------|
| `newDepositId` | `uint256` | ID of the newly created deposit. |

---

### Events

| Event | Parameters | When |
|-------|-----------|------|
| `PlanCreated` | `planId (indexed)`, `tenorDays`, `aprBps` | Admin creates a new plan. |
| `PlanUpdated` | `planId (indexed)`, `newAprBps` | Admin updates plan APR. |
| `DepositOpened` | `depositId (indexed)`, `owner (indexed)`, `planId (indexed)`, `principal`, `maturityAt`, `aprBpsAtOpen` | User opens a deposit. |
| `Withdrawn` | `depositId (indexed)`, `owner (indexed)`, `principal`, `interest`, `isEarly` | User withdraws (maturity or early). |
| `Renewed` | `oldDepositId (indexed)`, `newDepositId (indexed)`, `newPrincipal`, `newPlanId` | Manual or auto renew. |

---

## IVaultManager

### Admin Functions

#### fundVault

Deposits tokens into the vault to cover future interest payments.

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `amount` | `uint256` | Amount of USDC to deposit into the vault. |

---

#### withdrawVault

Removes excess tokens from the vault. Must not break solvency obligations (Bonus C2).

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `amount` | `uint256` | Amount of USDC to withdraw from the vault. |

---

#### setFeeReceiver

Sets the address that receives early-withdrawal penalties.

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `receiver` | `address` | New address to receive penalties. |

---

#### pause

Emergency stop — blocks all withdrawals and renewals in SavingCore (BR-16).

- **Access:** Owner only (`onlyOwner`).

---

#### unpause

Resumes system operations after a pause (BR-16).

- **Access:** Owner only (`onlyOwner`).

---

### Core-Facing Functions

#### payInterest

Transfers interest from the vault to a recipient. Called exclusively by SavingCore during withdraw and renew flows.

- **Access:** SavingCore contract only (`onlySavingCore`).
- **Business rules:** BR-10 (vault solvency check before transfer).

| Parameter | Type | Description |
|-----------|------|-------------|
| `to` | `address` | Recipient address (user on withdraw, SavingCore on renew). |
| `amount` | `uint256` | Amount of USDC to transfer. |

---

### View Functions

#### vaultBalance

Returns the current USDC balance held in the vault.

| Return | Type | Description |
|--------|------|-------------|
| — | `uint256` | Vault balance in USDC units. |

---

#### feeReceiver

Returns the address currently set to receive early-withdrawal penalties.

| Return | Type | Description |
|--------|------|-------------|
| — | `address` | Fee receiver address. |

---

### Events

| Event | Parameters | When |
|-------|-----------|------|
| `VaultFunded` | `from (indexed)`, `amount` | Admin deposits tokens into the vault. |
| `VaultWithdrawn` | `to (indexed)`, `amount` | Admin withdraws tokens from the vault. |
| `FeeReceiverUpdated` | `newReceiver (indexed)` | Admin sets a new fee receiver address. |
| `InterestPaid` | `to (indexed)`, `amount` | SavingCore requests interest payout. |
| `Paused` | `account (indexed)` | Admin pauses the system. |
| `Unpaused` | `account (indexed)` | Admin unpauses the system. |
