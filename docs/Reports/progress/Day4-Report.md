# Day 4 Report — withdrawAtMaturity + earlyWithdraw

> **Project:** Online Saving System (Blockchain Programming Final Assignment)
> **Date:** Thursday, 23/7/2026
> **Student ID:** `...38`

---

## 1. Objectives

| # | Task (from TODO.md Part 3+4+5) | Status |
|---|--------------------------------|--------|
| 1 | RED: Write 12 withdrawAtMaturity tests | **Done** |
| 2 | GREEN: Implement InterestLib.sol + withdrawAtMaturity | **Done** |
| 3 | BLUE: NatSpec + event verification | **Done** |
| 4 | RED: Write 9 earlyWithdraw tests | **Done** |
| 5 | GREEN: Implement earlyWithdraw | **Done** |
| 6 | BLUE: NatSpec + event verification | **Done** |
| 7 | End-of-Day Checklist: all branches tested, code quality, BR mapping | **Done** |
| 8 | Design Q4 + Q5 answers drafted in README | **Done** |

---

## 2. Deliverables

| File | Action | Lines |
|------|--------|------:|
| `contracts/libraries/InterestLib.sol` | Implemented `calculateInterest` pure function | 22 |
| `contracts/core/SavingCore.sol` | +withdrawAtMaturity +earlyWithdraw (141→210) | +69 |
| `test/core/SavingCore.test.ts` | +12 withdrawAtMaturity +9 earlyWithdraw +1 PlanNotFound (10→32) | +416 |
| `test/helpers/utils.ts` | `calculateExpectedInterest` TypeScript mirror | 25 |
| `README.md` | Design Q4 + Q5 answers in §8 | +20 |
| `docs/design/business-rules.md` | BR-06, BR-07, BR-08, BR-09, BR-10, BR-17 checked off | edit |

---

## 3. withdrawAtMaturity (TODO Part 3)

### 3.1 InterestLib.sol

Created `contracts/libraries/InterestLib.sol` — pure math library, no storage reads.

```solidity
function calculateInterest(
    uint256 principal,
    uint16 aprBps,
    uint32 tenorDays
) internal pure returns (uint256) {
    return (principal * aprBps * tenorDays) / (365 * 10_000);
}
```

**Key:** Multiply before divide to avoid rounding to zero (Design Q4). Integer truncation is expected — dust stays in vault.

### 3.2 RED — 12 Tests

| # | Test | Proves | Rule |
|---|------|--------|------|
| 1 | Happy path: withdraw at exact `maturityAt` → principal + interest | `>=` boundary | BR-09, Q5 |
| 2 | Withdraw after `maturityAt` (+1 day) → same result | `>=` works after | BR-09 |
| 3 | Interest formula proof: 10,000 USDC, 180d, 400 bps → 197,260,273 units | Math correctness | Personal variant |
| 4 | Before maturity → reverts `NotYetMature` | Guard | §3.2 |
| 5 | Double withdraw → reverts `AlreadyWithdrawn` | Guard | BR-07 |
| 6 | Vault insufficient → reverts | Solvency | BR-10 |
| 7 | Vault insufficient exact boundary: vault = interest − 1 → reverts | Boundary | BR-10 |
| 8 | Rounding dust: odd principal → truncated interest, dust in vault | Design Q4 | §8.2 |
| 9 | `Withdrawn` event: `isEarly=false`, correct amounts | Event | §5 |
| 10 | Deposit status → `Withdrawn` | State | — |
| 11 | Non-NFT-owner → reverts | Access | BR-06 |
| 12 | APR snapshot: updatePlan between open and withdraw → old APR used | Immutability | BR-04 |

**Personal variant math (ID ending 38):**
```
interest = (10,000,000,000 × 400 × 180) / (365 × 10,000)
         = 720,000,000,000,000 / 3,650,000
         = 197,260,273 units ≈ 197.26 USDC
```

### 3.3 GREEN — Implementation

`SavingCore.withdrawAtMaturity` (`SavingCore.sol:147-171`, 25 lines):

```
Guards:
  1. msg.sender == ownerOf(depositId) → OZ ERC721 reverts
  2. deposit.status == Active → AlreadyWithdrawn
  3. block.timestamp >= deposit.maturityAt → NotYetMature (Design Q5: >= boundary)

Logic:
  - interest = InterestLib.calculateInterest(principal, aprBpsAtOpen, tenorDays)
  - CEI: deposit.status = Withdrawn (before transfers)

Interactions:
  - usdc.safeTransfer(msg.sender, principal)         ← from SavingCore balance
  - vaultManager.payInterest(msg.sender, interest)   ← from VaultManager vault

Event: Withdrawn(depositId, msg.sender, principal, interest, false)
```

**Architecture:** Principal returned from SavingCore's own balance (user deposited via `safeTransferFrom`). Interest paid from VaultManager's vault (admin-funded pool). This separation is the core architectural rule.

### 3.4 BLUE — Verification

- NatSpec: `@notice`, `@dev`, `@param`
- InterestLib NatSpec: `@notice`, `@dev`, `@param`, `@return`
- `Withdrawn` event with `isEarly=false` verified in test #9
- Test results: 12/12 passing

---

## 4. earlyWithdraw (TODO Part 4)

### 4.1 RED — 9 Tests

| # | Test | Proves | Rule |
|---|------|--------|------|
| 1 | Happy path: penalty = principal × penaltyBps / 10000, user gets principal − penalty | Math + flow | BR-08 |
| 2 | Zero interest: vault balance unchanged (no payInterest called) | BR-08 | §3.3 |
| 3 | FeeReceiver balance increases by exact penalty | Routing | BR-17 |
| 4 | FeeReceiver not set → reverts `FeeReceiverNotSet` | Guard | — |
| 5 | Double early withdraw → reverts `AlreadyWithdrawn` | Guard | BR-07 |
| 6 | `Withdrawn` event: `isEarly=true`, interest=0 | Event | §5 |
| 7 | Deposit status → `Withdrawn` | State | — |
| 8 | Penalty proof: 10,000 USDC, 450 bps → penalty = 450 USDC | Math proof | Personal variant |
| 9 | Non-NFT-owner → reverts | Access | BR-06 |

**Personal variant math:**
```
penalty = (10,000,000,000 × 450) / 10,000 = 450,000,000 = 450 USDC
user receives = 10,000 − 450 = 9,550 USDC
```

### 4.2 GREEN — Implementation

`SavingCore.earlyWithdraw` (`SavingCore.sol:177-196`, 20 lines):

```
Guards:
  1. msg.sender == ownerOf(depositId) → OZ reverts
  2. deposit.status == Active → AlreadyWithdrawn
  3. vaultManager.feeReceiver() != address(0) → FeeReceiverNotSet

Logic:
  - penalty = (principal × penaltyBpsAtOpen) / 10,000
  - userAmount = principal − penalty
  - CEI: deposit.status = Withdrawn (before transfers)

Interactions:
  - usdc.safeTransfer(msg.sender, userAmount)         ← from SavingCore
  - usdc.safeTransfer(feeReceiver, penalty)            ← from SavingCore

Event: Withdrawn(depositId, msg.sender, principal, 0, true)
```

**Key difference from withdrawAtMaturity:** No vault interaction (`payInterest`). Early withdrawal pays zero interest — all funds come from SavingCore's principal pool. Penalty goes to `feeReceiver`, not vault.

### 4.3 BLUE — Verification

- NatSpec: `@notice`, `@dev`, `@param`
- `Withdrawn` event with `isEarly=true` verified in test #6
- Test results: 9/9 passing

---

## 5. Business Rules Verified

| BR | Rule | Test(s) | Code Location |
|----|------|---------|---------------|
| BR-06 | Only NFT owner can withdraw | withdrawAtMaturity #11, earlyWithdraw #9 | `SavingCore.sol:150,180` |
| BR-07 | Double withdraw blocked | withdrawAtMaturity #5, earlyWithdraw #5 | `SavingCore.sol:151,181` |
| BR-08 | Early = zero interest | earlyWithdraw #2 | `SavingCore.sol:195` (interest=0 in event) |
| BR-09 | Correct interest math | withdrawAtMaturity #3 | `InterestLib.sol:20` |
| BR-10 | Vault insufficiency | withdrawAtMaturity #6, #7 | `vaultManager.payInterest` reverts |
| BR-17 | Penalty to feeReceiver | earlyWithdraw #3 | `SavingCore.sol:182,193` |

---

## 6. Design Answers (README §8)

### Q4 — Rounding Dust

Interest calculated via integer division truncates toward zero. User receives the truncated (slightly smaller) interest. The leftover dust stays in the vault. Cannot cause revert or incorrect balance. Proven by test #8 in withdrawAtMaturity: odd principal (10,000,001 units) produces truncated interest, vault retains 1-unit dust.

### Q5 — Boundary Operators (maturityAt)

`block.timestamp < deposit.maturityAt` reverts ("not yet mature"). At exact `maturityAt` second, condition is false — withdrawal allowed (`>=` semantics). Justified because at the precise second the term ends, user has fulfilled the contract. Proven by test #1: `evm_setNextBlockTimestamp` set to exactly `maturityAt`, withdrawal succeeds.

---

## 7. End-of-Day Checklist Verification

### Tests

- `npx hardhat test` — 51/51 passing ✓
- Every `if`/revert branch has a dedicated test ✓
  - openDeposit: PlanNotFound, PlanNotEnabled, ZeroAmount, BelowMin, AboveMax (5 branches, 5 tests)
  - withdrawAtMaturity: NotOwner, AlreadyWithdrawn, NotYetMature (3 branches, 3 tests)
  - earlyWithdraw: NotOwner, AlreadyWithdrawn, FeeReceiverNotSet (3 branches, 3 tests)
- No test depends on execution order (all use `loadFixture`) ✓

### Code Quality

- `npx hardhat compile` — zero errors ✓
- NatSpec complete on all new public/external functions ✓
- Custom errors follow `ContractName_Reason` ✓
- Events centralized in `Events.sol`, emitted via `Events.X(...)` ✓
- `nonReentrant` outermost on all 3 user functions ✓
- CEI: status updated before external calls in all 3 functions ✓
- SafeERC20: all transfers use `safeTransfer`/`safeTransferFrom` ✓

---

## 8. Verification Results

### Compilation

```
Compiled 1 Solidity file successfully (evm target: cancun).
```

Zero errors. All contracts compile cleanly.

### Tests

```
51 passing (1s)
```

| Suite | Tests | Status |
|-------|-------|--------|
| SavingCore — openDeposit | 11 | All passing |
| SavingCore — withdrawAtMaturity | 12 | All passing |
| SavingCore — earlyWithdraw | 9 | All passing |
| VaultManager | 19 | All passing |

### Test Breakdown by Category

| Category | Count | Tests |
|----------|-------|-------|
| Happy path | 5 | openDeposit #1, withdrawAtMaturity #1/#2, earlyWithdraw #1/#8 |
| Event verification | 3 | openDeposit #2, withdrawAtMaturity #9, earlyWithdraw #6 |
| Guard reverts | 12 | openDeposit #4/#5/#6/#7/#8, withdrawAtMaturity #4/#5/#11, earlyWithdraw #4/#5/#9 |
| Boundary tests | 3 | withdrawAtMaturity #1/#7, earlyWithdraw #8 |
| State verification | 3 | openDeposit #9, withdrawAtMaturity #10, earlyWithdraw #7 |
| Immutability | 2 | openDeposit #3, withdrawAtMaturity #12 |
| Math proof | 2 | withdrawAtMaturity #3, earlyWithdraw #8 |
| Architecture | 2 | openDeposit #10, earlyWithdraw #2 |
| Vault solvency | 2 | withdrawAtMaturity #6/#7 |
| Rounding dust | 1 | withdrawAtMaturity #8 |

---

## 9. Scoring Impact

| Criterion | Points | Day 4 Contribution |
|-----------|--------|---------------------|
| Interest & penalty math | 20 | InterestLib + withdrawAtMaturity + earlyWithdraw fully implemented + 21 tests |
| APR/penalty snapshot immutable | 15 | Tests #3 (openDeposit), #12 (withdrawAtMaturity) prove immutability |
| Code quality & events | 5 | NatSpec, CEI, SafeERC20, centralized events, modifier ordering |
| Design questions | 10 | Q4 + Q5 drafted in README with test references |
| Test coverage > 90% | 15 | 32 SavingCore tests covering all branches (coverage report deferred) |

---

## 10. Known Gaps & Next Steps

| Gap | Severity | Planned |
|-----|----------|---------|
| `renewDeposit` still stub | High | Day 5 |
| `autoRenewDeposit` still stub | High | Day 5 |
| Coverage report unavailable | Medium | Day 6-7 (upstream fix dependent) |
| No integration tests yet | Medium | Day 5-6 |
| Design Q1-Q3, Q6-Q7 not written | Medium | Days 6-9 |
