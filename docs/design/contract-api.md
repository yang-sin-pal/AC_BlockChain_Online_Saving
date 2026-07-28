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
| `PrincipalClaimed` | Principal has been claimed; interest is pending in `pendingInterest` (C1). |
| `ManualRenewed` | Deposit was renewed by the owner to a new plan. |
| `AutoRenewed` | Deposit was auto-renewed after grace period. |

#### Plan (struct)

| Field | Type | Packed | Description |
|-------|------|--------|-------------|
| `tenorDays` | `uint32` | Slot 1 | Term length in days. |
| `aprBps` | `uint16` | Slot 1 | Annual interest rate in basis points (100 = 1.00%). |
| `earlyWithdrawPenaltyBps` | `uint16` | Slot 1 | Early withdrawal penalty in basis points (500 = 5.00%). |
| `enabled` | `bool` | Slot 1 | Whether the plan accepts new deposits. |
| `minDeposit` | `uint256` | Slot 2 | Minimum deposit amount in USDC units. 0 = no limit. |
| `maxDeposit` | `uint256` | Slot 3 | Maximum deposit amount in USDC units. 0 = no limit. |

#### Deposit (struct)

| Field | Type | Packed | Description |
|-------|------|--------|-------------|
| `planId` | `uint256` | Slot 1 | ID of the plan this deposit was opened under. |
| `principal` | `uint256` | Slot 2 | Deposited amount in USDC units. |
| `startAt` | `uint64` | Slot 3 | Unix timestamp when the deposit was opened. |
| `maturityAt` | `uint64` | Slot 3 | Unix timestamp when the deposit matures. |
| `aprBpsAtOpen` | `uint16` | Slot 3 | APR snapshot at deposit open time (immutable). |
| `penaltyBpsAtOpen` | `uint16` | Slot 3 | Penalty snapshot at deposit open time (immutable). |
| `status` | `Status` | Slot 3 | Current deposit status. |
| `interestClaimed` | `bool` | Slot 3 | Whether interest has been fully claimed (C1). |

**Storage note:** Slot 3 packs to 22 bytes: `startAt(8) + maturityAt(8) + aprBpsAtOpen(2) + penaltyBpsAtOpen(2) + status(1) + interestClaimed(1)`.

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

#### pause

Emergency pause on SavingCore. Blocks `withdrawAtMaturity`, `claimInterest`, `renewDeposit`, and `autoRenewDeposit`. **Does NOT block `claimPrincipal`** — users can always reclaim principal.

- **Access:** Owner only (`onlyOwner`).

---

#### unpause

Resumes SavingCore operations after a pause.

- **Access:** Owner only (`onlyOwner`).

---

### User Functions

#### openDeposit

Opens a new deposit. User must call `approve()` on the MockUSDC token before calling this function.

- **Access:** Anyone.
- **Business rules:** BR-01 (amount within limits), BR-02 (plan enabled), BR-05 (mints one NFT), BR-04 (APR/penalty snapshot).
- **Modifiers:** `nonReentrant`

| Parameter | Type | Description |
|-----------|------|-------------|
| `planId` | `uint256` | ID of the plan to deposit into. |
| `amount` | `uint256` | Deposit amount in USDC units (must be within `minDeposit..maxDeposit`). |

| Return | Type | Description |
|--------|------|-------------|
| `depositId` | `uint256` | ID of the newly created deposit (also the NFT tokenId). |

---

#### withdrawAtMaturity

Withdraws principal + simple interest at or after maturity. Interest is paid from the VaultManager vault (BR-10). Reverts with specific errors if principal already claimed (`UseClaimInterest`) or interest already claimed (`UseClaimPrincipal`).

- **Access:** NFT owner only (`onlyDepositOwner` modifier).
- **Business rules:** BR-07 (single withdrawal), BR-09 (correct interest math), BR-10 (vault solvency check), BR-12 (reentrancy guard).
- **Modifiers:** `nonReentrant`, `whenNotPaused`, `onlyDepositOwner`

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit to withdraw. |

---

#### earlyWithdraw

Early withdrawal — no interest, penalty deducted from principal, penalty sent to feeReceiver (BR-17). **No `whenNotPaused`** — users can always exit early.

- **Access:** NFT owner only (`onlyDepositOwner` modifier).
- **Business rules:** BR-07 (single withdrawal), BR-08 (penalty enforced, zero interest), BR-17 (penalty routing).
- **Modifiers:** `nonReentrant`, `onlyDepositOwner`

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit to withdraw early. |

---

#### renewDeposit

Manual renewal to a new plan after maturity. Interest is compounded into the new principal. Supports renewal from `PrincipalClaimed` status — renews with whatever principal remains.

- **Access:** NFT owner only (`onlyDepositOwner` modifier).
- **Business rules:** BR-13 (maturity check, compound interest, new plan rate, old status update), BR-20 (allows renewal from `PrincipalClaimed`).
- **Modifiers:** `nonReentrant`, `whenNotPaused`, `onlyDepositOwner`

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the old deposit. |
| `newPlanId` | `uint256` | ID of the new plan to switch to. |

| Return | Type | Description |
|--------|------|-------------|
| `newDepositId` | `uint256` | ID of the newly created deposit. |

---

#### autoRenewDeposit

Bot-triggered auto-renewal after the grace period. Preserves the original `aprBpsAtOpen` (BR-15) and same tenor. **No owner check** — anyone (typically an off-chain bot) can call this function.

- **Access:** Anyone (no owner check — bot-triggerable).
- **Business rules:** BR-14 (grace period check), BR-15 (original APR locked), BR-16 (paused check).
- **Modifiers:** `nonReentrant`, `whenNotPaused`

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit to auto-renew. |

| Return | Type | Description |
|--------|------|-------------|
| `newDepositId` | `uint256` | ID of the newly created deposit. |

---

#### claimPrincipal

Claims principal at maturity without depending on vault balance (C1). Calculates and stores interest as `pendingInterest` for later claim. **No `whenNotPaused`** — users can always reclaim principal regardless of pause state.

- **Access:** NFT owner only (`onlyDepositOwner` modifier).
- **Business rules:** BR-18 (principal always reclaimable), BR-19 (interest stored as pending).
- **Modifiers:** `nonReentrant`, `onlyDepositOwner`

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the matured deposit. |

**Behavior:**
- If `status == PrincipalClaimed`: reverts with `SavingCore_PrincipalAlreadyClaimed()`
- If `status != Active`: reverts with `SavingCore_AlreadyWithdrawn()`
- If `status == Active` and `interestClaimed == true`: sets `status = Withdrawn` (interest was already claimed)
- If `status == Active` and `interestClaimed == false`: sets `status = PrincipalClaimed`, stores interest in `pendingInterest`

---

#### claimInterest

Claims interest from a previous partial withdrawal or after principal claim. Supports **partial vault payment**: if vault balance < interest amount, pays what's available and stores remainder in `pendingInterest` (allows retry).

- **Access:** NFT owner only (`onlyDepositOwner` modifier).
- **Business rules:** BR-19 (partial vault payment), BR-21 (interest claimable after principal claim).
- **Modifiers:** `nonReentrant`, `whenNotPaused`, `onlyDepositOwner`

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit with pending interest. |

**Paths:**
- **Path A (status == Active):** Calculates interest, attempts vault payment. If vault sufficient → pays full interest, sets `interestClaimed = true`, status → `Withdrawn`. If vault insufficient → stores in `pendingInterest`.
- **Path B (status == PrincipalClaimed):** Claims from `pendingInterest` balance. If `pendingInterest == 0` → reverts with `SavingCore_NoPendingInterest()`. If `pendingInterest > 0` → pays what's available, updates `pendingInterest`. When `pendingInterest == 0` → sets `interestClaimed = true`, status → `Withdrawn`.

---

#### burn

Burns the deposit NFT certificate. Only callable after deposit is withdrawn. **Blocked if `status == Active`** (cannot burn a live deposit). Also **blocked if `pendingInterest > 0`** (enforced via `_update` override) — user must claim all pending interest before burning.

- **Access:** NFT owner only (`onlyDepositOwner` modifier).
- **Business rules:** BR-05 (NFT lifecycle management).
- **Modifiers:** `onlyDepositOwner` (no `nonReentrant` — safe, only burns token).

| Parameter | Type | Description |
|-----------|------|-------------|
| `depositId` | `uint256` | ID of the deposit whose NFT to burn. |

---

### Events

| Event | Parameters | When |
|-------|-----------|------|
| `PlanCreated` | `planId (indexed)`, `tenorDays`, `aprBps` | Admin creates a new plan. |
| `PlanUpdated` | `planId (indexed)`, `newAprBps` | Admin updates plan APR. |
| `PlanEnabled` | `planId (indexed)` | Admin enables a plan. |
| `PlanDisabled` | `planId (indexed)` | Admin disables a plan. |
| `DepositOpened` | `depositId (indexed)`, `owner (indexed)`, `planId (indexed)`, `principal`, `maturityAt`, `aprBpsAtOpen` | User opens a deposit. |
| `Withdrawn` | `depositId (indexed)`, `owner (indexed)`, `principal`, `interest`, `isEarly` | User withdraws (maturity, early, or claimPrincipal). |
| `InterestClaimed` | `depositId (indexed)`, `to (indexed)`, `amount` | User claims interest (C1). |
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

#### setSavingCore

Sets the SavingCore address. Can only be called once (one-shot setter). Reverts if already set.

- **Access:** Owner only (`onlyOwner`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `_savingCore` | `address` | Address of the SavingCore contract. |

---

#### pause

Emergency stop — blocks `withdrawVault` and `payInterest` on VaultManager.

- **Access:** Owner only (`onlyOwner`).

---

#### unpause

Resumes VaultManager operations after a pause.

- **Access:** Owner only (`onlyOwner`).

---

### Core-Facing Functions

#### payInterest

Transfers interest from the vault to a recipient. Called exclusively by SavingCore during withdraw and renew flows. **Reverts with `EnforcedPause` when VaultManager is paused** — no money leaves the vault during emergency.

- **Access:** SavingCore contract only (`onlySavingCore`).
- **Business rules:** BR-10 (vault solvency check before transfer), BR-16 (vault freeze during pause).
- **Modifiers:** `nonReentrant`, `onlySavingCore`, `whenNotPaused`

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

**Note:** `Paused` and `Unpaused` events are emitted by OpenZeppelin's `Pausable` internally but are not defined in `Events.sol`.
