# Storage Layout

This document describes how on-chain data is organized in the Online Saving System, with explicit attention to storage packing for gas efficiency.

**Goals:**
- Define storage models for all contracts
- Explain why each field exists
- Record immutable snapshot values
- Analyze and optimize storage packing
- Prepare for future storage improvements

---

# Overview

The system stores three primary entities across two contracts:

```text
MockUSDC (ERC20 Token)
      │
      ▼
VaultManager ←─── SavingCore
      │               │
      ▼               ▼
Interest Pool    Plan → Deposit → ERC721 Certificate
```

**Storage principles:**
1. **Readability first** – clear field names and comments
2. **Correct business logic** – all required fields per assignment
3. **Stable layout** – avoid breaking changes after deployment
4. **Packed efficiency** – minimize storage slots where safe

---

# MockUSDC Storage

Standard ERC20 storage from OpenZeppelin:

```solidity
// Inherited from ERC20
mapping(address => uint256) private _balances;
mapping(address => mapping(address => uint256)) private _allowances;
uint256 private _totalSupply;
```

**Packing note:** ERC20 storage is already optimized by OpenZeppelin. No custom packing needed.

---

# VaultManager Storage

## State Variables

Storage layout follows C3 linearization of the inheritance chain: `Ownable2Step → ReentrancyGuard → Pausable`.

| Order | Variable | Type | Bytes | Slot Usage | Purpose |
|-------|----------|------|-------|------------|---------|
| 1 | `_owner` | address | 20 | Slot 1 (20/32) | Admin control (Ownable2Step) |
| 2 | `_status` | uint256 | 32 | Slot 2 (32/32) | Reentrancy guard (ReentrancyGuard) |
| 3 | `_paused` | bool | 1 | Slot 3 (1/32) | Emergency stop (Pausable) |
| — | `usdc` | IERC20 | — | **Immutable** (bytecode) | USDC token address |
| 4 | `savingCore` | address | 20 | Slot 4 (20/32) | SavingCore address (set once) |
| 5 | `feeReceiver` | address | 20 | Slot 5 (20/32) | Penalty recipient |

**Packing analysis:**
- OpenZeppelin's `Ownable2Step`, `ReentrancyGuard`, and `Pausable` each reserve dedicated slots — cannot repack them.
- `savingCore` (20 bytes) and `feeReceiver` (20 bytes) each need their own slot (two addresses cannot fit in one 32-byte slot).
- `usdc` is `immutable` — stored in contract bytecode, not storage. Zero slot cost after deployment.
- **Current layout:** 5 storage slots + 1 immutable (bytecode).
- **Optimization possible:** If we implement custom ownership without OpenZeppelin, we could pack `_owner` + `_paused` (20+1=21 bytes) in one slot, saving 1 slot. However, this sacrifices OpenZeppelin's battle-tested security.

**Recommendation:** Keep OpenZeppelin's storage layout for security. The gas savings (1 SSTORE ≈ 20,000 gas for cold slot) are minimal compared to audit risk.

---

# SavingCore Storage

## Plan Struct

```solidity
struct Plan {
    uint32 tenorDays;           // 4 bytes
    uint16 aprBps;              // 2 bytes
    uint16 earlyWithdrawPenaltyBps; // 2 bytes
    bool enabled;               // 1 byte
    uint256 minDeposit;         // 32 bytes
    uint256 maxDeposit;         // 32 bytes
}
```

**Packing analysis:**
- **Without packing (original order):** 6 slots (tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps, enabled).
- **With packing (reordered):** 3 slots:
  - Slot 1: `tenorDays` (4) + `aprBps` (2) + `earlyWithdrawPenaltyBps` (2) + `enabled` (1) = 9 bytes ✓
  - Slot 2: `minDeposit` (32 bytes)
  - Slot 3: `maxDeposit` (32 bytes)

**Why reorder?** The first four fields are small (≤8 bytes total) and are always read/written together during plan creation/update. Packing them reduces storage writes from 4 to 1 slot for these fields.

**Gas impact:** Creating a plan saves ~60,000 gas (3 fewer SSTORE operations at 20,000 gas each for cold slots).

## Deposit Struct

```solidity
struct Deposit {
    uint256 planId;            // 32 bytes
    uint256 principal;         // 32 bytes
    uint64 startAt;            // 8 bytes
    uint64 maturityAt;         // 8 bytes
    uint16 aprBpsAtOpen;       // 2 bytes
    uint16 penaltyBpsAtOpen;   // 2 bytes
    Status status;             // 1 byte (uint8)
}
```

**Packing analysis:**
- **Without packing (original order):** 5 slots (planId, principal, startAt, maturityAt, aprBpsAtOpen, penaltyBpsAtOpen, status).
- **With packing (reordered):** 3 slots:
  - Slot 1: `planId` (32 bytes)
  - Slot 2: `principal` (32 bytes)
  - Slot 3: `startAt` (8) + `maturityAt` (8) + `aprBpsAtOpen` (2) + `penaltyBpsAtOpen` (2) + `status` (1) = 21 bytes ✓

**Why this order?**
- `planId` and `principal` are the most frequently read fields (for display, interest calculations).
- The timestamp and rate fields are always read together during maturity checks.
- `status` is small and fits in the remaining space.

**Gas impact:** Each deposit open saves ~40,000 gas (2 fewer SSTORE operations).

## Status Enum

```solidity
enum Status {
    Active,      // 0
    Withdrawn,   // 1
    ManualRenewed, // 2
    AutoRenewed  // 3
}
```

**Storage:** Stored as `uint8` (1 byte) in the packed slot.

## State Variables

Storage layout follows C3 linearization of the inheritance chain: `ERC721 → Ownable2Step → ReentrancyGuard`. OZ inherited slots (ERC721's `_owners`/`_balances`/approvals mappings, `_owner`, `_status`) are omitted — shown only for contract-owned variables.

| Order | Variable | Type | Bytes | Slot Usage | Purpose |
|-------|----------|------|-------|------------|---------|
| — | `usdc` | IERC20 | — | **Immutable** (bytecode) | USDC token address |
| — | `vaultManager` | IVaultManager | — | **Immutable** (bytecode) | Vault interaction |
| 1 | `deposits` | mapping(uint256 => Deposit) | 32 | Slot 1 | Deposit storage |
| 2 | `nextDepositId` | uint256 | 32 | Slot 2 | Deposit ID counter |
| 3 | `plans` | mapping(uint256 => Plan) | 32 | Slot 3 | Plan storage |
| 4 | `nextPlanId` | uint256 | 32 | Slot 4 | Plan ID counter |

**Packing note:** Mappings don't pack (each mapping uses a full slot for the base slot). The counters could be packed with something else, but they're rarely accessed together with other variables. `usdc` and `vaultManager` are `immutable` — stored in bytecode, not storage, so they occupy zero storage slots after deployment.

---

# Relationships

```text
VaultManager
  ├── usdc: IERC20 (MockUSDC)        [immutable]
  ├── savingCore: address             [set once]
  ├── feeReceiver: address
  └── paused: bool

SavingCore
  ├── usdc: IERC20 (MockUSDC)        [immutable]
  ├── vaultManager: IVaultManager     [immutable]
  ├── plans: mapping(uint256 => Plan)
  │     └── Plan
  │           ├── tenorDays, aprBps, earlyWithdrawPenaltyBps, enabled (packed)
  │           ├── minDeposit
  │           └── maxDeposit
  └── deposits: mapping(uint256 => Deposit)
        └── Deposit
              ├── planId
              ├── principal
              ├── startAt, maturityAt, aprBpsAtOpen, penaltyBpsAtOpen, status (packed)
              └── ERC721 tokenId = depositId
```

---

# Snapshot Fields

The following values are stored permanently when a deposit is opened.

| Field | Reason |
|-------|--------|
| `aprBpsAtOpen` | Existing deposits must not change if the administrator updates the plan APR. |
| `penaltyBpsAtOpen` | Existing deposits must keep their original early withdrawal penalty. |

Example:

```text
Day 1
Plan APR = 4%

Alice opens Deposit A
APR Snapshot = 4%

──────────────

Day 30
Admin updates Plan APR = 6%

Deposit A
still earns 4%

New deposits
earn 6%
```

---

# Open Questions Impact on Storage

## 1. Transferable Certificate (§8.2.1)
**Storage impact:** ERC721's `ownerOf(tokenId)` maps to the NFT owner, not necessarily the original depositor. The `Deposit` struct doesn't store the owner (ERC721 handles it). This is correct per assignment.

## 2. Empty Vault (§8.2.2)
**Storage impact:** No additional storage needed. The check is runtime: `if (vault.balance < interest) revert;`.

## 3. Dead Bot (§8.2.3)
**Storage impact:** If we implement a grace period tracking (e.g., `gracePeriodEnd` per deposit), we'd add a `uint64` field. This would pack with the existing timestamp fields (adding 8 bytes to the packed slot, still within 32 bytes). However, the assignment uses a global grace period constant, not per-deposit storage.

## 4. Rounding Dust (§8.2.4)
**Storage impact:** Dust stays in the vault (no additional storage). The formula `interest = (principal * aprBps * tenorSeconds) / (365 days * 10000)` naturally truncates.

## 5. Boundary Times (§8.2.5)
**Storage impact:** No storage changes. The comparison operators (`>=` vs `>`) are in code logic, not storage.

## 6. Disabled Plan with Active Deposits (§8.2.6)
**Storage impact:** The `Plan.enabled` flag only controls new deposits. Active deposits continue to maturity. No extra storage needed.

## 7. Attack Thinking (§8.2.7)
**Storage impact:** Reentrancy guards (OpenZeppelin's `ReentrancyGuard`) add a `_status` slot (uint256, 32 bytes). This is a necessary security cost.

---

# Storage Packing Summary

## Total Slot Count (Optimized)

| Contract | Storage Slots | Immutables | Notes |
|----------|---------------|------------|-------|
| MockUSDC | ~3 | — | ERC20 standard (balances, allowances, totalSupply) |
| VaultManager | 5 | 1 (`usdc`) | owner, status, paused, savingCore, feeReceiver |
| SavingCore | 4 | 2 (`usdc`, `vaultManager`) | deposits, nextDepositId, plans, nextPlanId |
| Plan (each) | 3 | — | Packed small fields + 2 uint256 |
| Deposit (each) | 3 | — | 2 uint256 + packed timestamps/rates/status |

## Gas Savings from Packing

| Operation | Without Packing | With Packing | Savings |
|-----------|-----------------|--------------|---------|
| Create Plan | 5 SSTORE | 3 SSTORE | ~40,000 gas |
| Open Deposit | 5 SSTORE | 3 SSTORE | ~40,000 gas |
| Update Plan | 4 SSTORE | 1 SSTORE | ~60,000 gas |
| Withdraw | 2 SSTORE | 2 SSTORE | 0 (status update) |

## Packing Rules Applied

1. **Group small fields together:** `uint32`, `uint16`, `bool`, `enum` in one slot.
2. **Keep large fields separate:** `uint256` gets its own slot.
3. **Order by access pattern:** Fields read together are packed together.
4. **Preserve readability:** Comments explain each field's purpose.

---

# Future Optimization

1. **Storage packing for VaultManager:** Custom Ownable to pack `_owner` + `_paused` (saves 1 slot).
2. **Deposit ID as `uint96`:** If we limit deposits to 2^96 (~7.9e28), we could pack it with other fields.
3. **Caching:** Store frequently accessed values (e.g., current block timestamp) in memory, not storage.
4. **Custom errors:** Already planned per `Errors.sol` (no storage impact).
5. **Lazy deletion:** Mark deposits as `Withdrawn` but don't delete data (historical record).

---

# Deployment Considerations

1. **Storage gaps:** Use `uint256[50] private __gap` in contracts for upgradeability.
2. **Immutable variables:** `usdc` and `vaultManager` are immutable (no storage cost after deployment — stored in bytecode).
3. **Mapping initialization:** Mappings start empty; no initialization cost.
4. **Struct alignment:** Solidity packs structs sequentially; reordering fields changes storage layout.

---

# Validation Checklist

- [x] All assignment §2.1 Plan fields present
- [x] All assignment §2.2 Deposit fields present
- [x] Snapshot fields (aprBpsAtOpen, penaltyBpsAtOpen) documented
- [x] VaultManager storage covers §4 admin functions
- [x] ERC721 link (tokenId = depositId) documented
- [x] Storage packing analysis with gas savings
- [x] Open questions storage impact addressed
- [x] Future optimization roadmap
