# Day 1 Report — Setup + MockUSDC + SavingCore Skeleton

> **Project:** Online Saving System (Blockchain Programming Final Assignment)
> **Date:** Monday, 20/7/2026
> **Student ID:** `...38`

---

## 1. Objectives

| # | Task (from PLAN.md) | Status |
|---|---------------------|--------|
| 1 | Tính personal variant theo Student ID, ghi vào đầu README | **Done** |
| 2 | `npx hardhat init`, cài `@openzeppelin/contracts`, `solhint`, `hardhat-gas-reporter`, `solidity-coverage` | **Done** |
| 3 | Viết `ISavingCore.sol`, `IVaultManager.sol` với NatSpec đầy đủ | **Done** |
| 4 | `MockUSDC.sol`: ERC20 6 decimals, `mint()` public | **Done** |
| 5 | Khung `SavingCore.sol`: struct, enum, kế thừa ERC721 + Ownable2Step + ReentrancyGuard | **Done** |
| 6 | Khung README.md với mục lục đầy đủ, điền personal variant | **Done** |

All 6 tasks completed. Additional fixes applied on 22/7 to resolve compilation blockers discovered when attempting `npx hardhat compile`.

---

## 2. Deliverables Summary

| File | Lines | Status |
|------|------:|--------|
| `contracts/interfaces/ISavingCore.sol` | 105 | Complete |
| `contracts/interfaces/IVaultManager.sol` | 32 | Complete |
| `contracts/mocks/MockUSDC.sol` | 23 | Complete |
| `contracts/core/SavingCore.sol` | 89 | Partial — plan mgmt done, user functions are stubs |
| `contracts/core/VaultManager.sol` | 0 | Empty — Day 2 scope |
| `contracts/libraries/Errors.sol` | 34 | Placeholder (comments only) |
| `contracts/libraries/Events.sol` | 5 | Placeholder (comments only) |
| `contracts/libraries/InterestLib.sol` | 13 | Placeholder (comments only) |
| `hardhat.config.ts` | 13 | Complete |
| `package.json` | 22 | Complete |
| `README.md` | 193 | Mostly complete |
| `test/helpers/fixtures.ts` | 7 | Placeholder |
| `test/helpers/constants.ts` | 7 | Placeholder |
| `test/helpers/utils.ts` | 7 | Placeholder |
| All 7 test files | 0 | Empty |

---

## 3. Contracts

### 3.1 `ISavingCore.sol` (105 lines)

Main business logic interface. Defines the contract between `SavingCore` and all callers.

- **Enum `Status`:** `Active`, `Withdrawn`, `ManualRenewed`, `AutoRenewed`
- **Struct `Plan`:** 6 fields — `tenorDays`, `aprBps`, `minDeposit`, `maxDeposit`, `earlyWithdrawPenaltyBps`, `enabled`
- **Struct `Deposit`:** 7 fields — `planId`, `principal`, `aprBpsAtOpen`, `penaltyBpsAtOpen`, `startAt`, `maturityAt`, `status`
- **Admin functions (4):** `createPlan`, `updatePlan`, `enablePlan`, `disablePlan`
- **User functions (5):** `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`
- **Events (5):** `PlanCreated`, `PlanUpdated`, `DepositOpened`, `Withdrawn`, `Renewed`

All functions have full NatSpec (`@notice`, `@param`, `@return`) in Vietnamese.

**Key design decision:** APR and penalty are snapshot at deposit open time (`aprBpsAtOpen`, `penaltyBpsAtOpen` stored per-deposit, not per-plan). This is BR-04 — plan changes never affect existing deposits.

### 3.2 `IVaultManager.sol` (32 lines)

Vault interface — holds USDC funds, pays interest, supports emergency pause.

- **Functions (6):** `fundVault`, `withdrawVault`, `setFeeReceiver`, `pause`, `unpause`, `vaultBalance` (view)
- **Events (3):** `VaultFunded`, `VaultWithdrawn`, `FeeReceiverUpdated`

`withdrawVault` is documented as having a safety limit (Bonus C2 — solvency guard). `pause`/`unpause` implements emergency stop pattern.

### 3.3 `MockUSDC.sol` (23 lines)

Fully functional ERC20 mock token for testing.

- Inherits OpenZeppelin `ERC20`
- Constructor: name `"Mock USD Coin"`, symbol `"mUSDC"`
- `decimals()` returns `6` (matching real USDC, catches decimal assumption bugs)
- `mint(address to, uint256 amount)` — unrestricted public mint for test convenience

### 3.4 `SavingCore.sol` (89 lines)

Main business logic contract. Partially implemented on Day 1.

**Inheritance chain:** `ISavingCore`, `ERC721`, `Ownable2Step`, `ReentrancyGuard`

**State variables:**
- `mapping(uint256 => Deposit) public deposits`
- `mapping(uint256 => Plan) public plans`
- `uint256 public nextDepositId`, `nextPlanId`

**Implemented — plan management:**
- `createPlan` — `onlyOwner`, auto-increments ID, sets `enabled: true`, emits `PlanCreated`
- `updatePlan` — `onlyOwner`, updates only `aprBps`, emits `PlanUpdated`
- `enablePlan` / `disablePlan` — `onlyOwner`

**Stubs (revert with "TODO: implement Day N"):**
- `openDeposit` → Day 2
- `withdrawAtMaturity`, `earlyWithdraw` → Day 3
- `renewDeposit`, `autoRenewDeposit` → Day 4

All stubs are `pure` functions that revert — keeps interface compliance without real logic.

### 3.5 Empty / Placeholder Files

| File | Lines | Content |
|------|------:|---------|
| `VaultManager.sol` | 0 | Completely empty. Day 2 scope. |
| `Errors.sol` | 34 | Educational comments explaining custom errors vs `require()`. No error definitions. |
| `Events.sol` | 5 | Comment: "Can consolidate events here. Not required." |
| `InterestLib.sol` | 13 | Comment: extract interest formulas here when they grow complex. |

---

## 4. Configuration & Tooling

### 4.1 `hardhat.config.ts`

```typescript
solidity: {
  version: "0.8.28",
  settings: {
    evmVersion: "cancun",
  },
},
```

- Solidity `0.8.28` with Cancun EVM target (required by OZ v5.6.1's use of `mcopy`)
- Imports `@nomicfoundation/hardhat-toolbox`
- No network config — local-only (Hardhat default)
- No optimizer settings

### 4.2 `package.json`

**devDependencies:**
- `@nomicfoundation/hardhat-toolbox` ^6.1.2
- `hardhat` ^2.26.0
- `typescript` ^5.8.3

**dependencies:**
- `@openzeppelin/contracts` ^5.6.1
- `solhint` ^6.2.3

**Note:** `npm test` script is a placeholder (`echo "Error: no test specified"`). Must use `npx hardhat test` directly.

### 4.3 `tsconfig.json`

Standard Hardhat TypeScript config: target ES2020, CommonJS modules, strict mode, skipLibCheck.

---

## 5. Documentation

| File | Lines | Status | Content |
|------|------:|--------|---------|
| `docs/architecture.md` | 125 | Complete | 2 ASCII diagrams, 3 component descriptions, design principles |
| `docs/access-control.md` | 123 | Complete | Access control matrix (10 functions), roles, auth flow, testing checklist |
| `docs/business-rules.md` | 65 | Complete | 12 rules (BR-01 to BR-012), each with protection purpose, implementation, verification |
| `docs/sequence-diagram.md` | 133 | Complete | 6 Mermaid sequence diagrams for all workflows |
| `docs/storage-layout.md` | 148 | Complete | Plan/Deposit field tables, snapshot explanation, relationships diagram |
| `docs/folder-structure.md` | 162 | Complete | Full ASCII tree, per-folder descriptions, design principles |
| `docs/contract-api.md` | 21 | Placeholder | Entirely HTML comment — intended format sketched |
| `docs/audit-notes.md` | 11 | Placeholder | Entirely HTML comment — intended topics sketched |

**Known discrepancy:** `docs/storage-layout.md` documents packed types (`uint32`, `uint16`, `uint64`) but actual struct definitions in `ISavingCore.sol` use `uint256` everywhere. Storage packing optimization is documented but not yet applied.

### README.md (193 lines)

- Table of Contents: 10 sections with anchor links
- Personal Variant: Student ID `...38`, derivation formulas, all 4 parameters (Grace Period 4 days, APR 400 bps, Penalty 450 bps, Tenor 180 days)
- Getting Started: `npm install`, `npx hardhat compile`, `npx hardhat test`, `npx hardhat coverage`
- Design Decisions: 7 checklist items (all unchecked — to be filled during implementation)
- Development Status: Day 1 checklist at bottom is stale (some items marked unchecked that are actually done)

---

## 6. Test Infrastructure

### Directory structure created

```
test/
├── core/
│   ├── SavingCore.test.ts      (empty)
│   └── VaultManager.test.ts    (empty)
├── intergration/               (typo intentional, do not rename)
│   ├── OpenDeposit.test.ts     (empty)
│   ├── Withdraw.test.ts        (empty)
│   ├── Renew.test.ts           (empty)
│   └── FullFlow.test.ts        (empty)
├── mocks/
│   └── MockUSDC.test.ts        (empty)
└── helpers/
    ├── fixtures.ts             (placeholder — intended deployAllContracts() API)
    ├── constants.ts            (placeholder — intended APR/TENOR/MIN_DEPOSIT)
    └── utils.ts                (placeholder — intended toUSDC/increaseTime/expectRevert)
```

All files are comment-only placeholders. No test code written. Test infrastructure (`npx hardhat test`) runs successfully — 0 passing, 0 failing.

---

## 7. Issues Encountered & Resolutions

### 7.1 `@openzeppelin/contracts` not in `package.json`

**Impact:** Critical — `npx hardhat compile` fails. All contracts import from OpenZeppelin.

**Resolution:** `npm install @openzeppelin/contracts` — added to dependencies.

### 7.2 `solhint` not installed

**Impact:** Low — linter not available but not blocking compilation.

**Resolution:** `npm install solhint` — added to dependencies.

### 7.3 Wrong import path in `SavingCore.sol`

**Error:** `File ./interfaces/ISavingCore.sol, imported from contracts/core/SavingCore.sol, not found.`

**Cause:** `SavingCore.sol` is in `contracts/core/`, interfaces are in `contracts/interfaces/`. Relative path `./interfaces/` resolves to `contracts/core/interfaces/` which doesn't exist.

**Resolution:** Changed import to `../interfaces/ISavingCore.sol`.

### 7.4 OZ v5 `ReentrancyGuard` path changed

**Error:** `File @openzeppelin/contracts/security/ReentrancyGuard.sol not found.`

**Cause:** OpenZeppelin v5 moved `ReentrancyGuard` from `security/` to `utils/`.

**Resolution:** Changed import to `@openzeppelin/contracts/utils/ReentrancyGuard.sol`.

### 7.5 Missing `evmVersion: "cancun"`

**Error:** `The "mcopy" instruction is only available for Cancun-compatible VMs (you are currently compiling for "paris").`

**Cause:** OZ v5.6.1 uses `mcopy` opcode (Cancun EVM). Hardhat defaults to `paris` for Solidity 0.8.28.

**Resolution:** Added `evmVersion: "cancun"` to `hardhat.config.ts` solidity settings.

### 7.6 UTF-8 BOM in all `.sol` files

**Error:** `Expected pragma, import directive or contract/interface/...` at line 1 of every file.

**Cause:** All 8 `.sol` files had a UTF-8 Byte Order Mark (0xEF 0xBB 0xBF) at the start. Solidity compiler doesn't recognize BOM.

**Resolution:** Stripped BOM from all 8 files using PowerShell byte-level manipulation.

### 7.7 Missing NatSpec in interfaces

**Impact:** Medium — NatSpec present but incomplete. `disablePlan` had zero NatSpec. No `@param`/`@return` tags on any function.

**Resolution:** Rewrote both `ISavingCore.sol` and `IVaultManager.sol` with full NatSpec: `@notice`, `@param`, `@return` on every function. Separated `enablePlan`/`disablePlan` and `pause`/`unpause` into individual documented functions.

---

## 8. Verification Results

### Compilation

```
npx hardhat compile
Successfully generated 80 typings!
Compiled 30 Solidity files successfully (evm target: cancun).
```

**Remaining warnings** (non-blocking):
- SPDX license identifier missing in `VaultManager.sol`, `Errors.sol`, `Events.sol`, `InterestLib.sol` (empty/stub files)
- Pragma missing in same 4 files

### Tests

```
npx hardhat test
0 passing (0ms)
```

Expected — all test files are empty. Test infrastructure (Mocha via hardhat-toolbox) is functional.

---

## 9. Known Gaps & Next Steps

| Gap | Severity | Planned |
|-----|----------|---------|
| `VaultManager.sol` is empty (0 lines) | High | Day 2 |
| All user functions in `SavingCore.sol` are stubs | High | Day 2–4 |
| All test files are empty | High | Day 2+ |
| `Errors.sol` has no actual error definitions | Medium | When implementing revert paths |
| `Events.sol` is empty (events defined in interfaces instead) | Low | Optional consolidation |
| `InterestLib.sol` is empty | Low | When interest formulas grow complex |
| README dev status checklist is stale | Low | Update when convenient |
| `contract-api.md` is placeholder | Medium | Day 7+ |
| `audit-notes.md` is placeholder | Medium | Day 5+ |
| Storage layout doc uses packed types but structs use `uint256` | Low | Optimization pass later |
