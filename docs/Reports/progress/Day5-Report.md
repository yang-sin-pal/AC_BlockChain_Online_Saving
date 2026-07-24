# Day 5 Report — Auto Renew + Manual Renew

> **Project:** Online Saving System (Blockchain Programming Final Assignment)
> **Date:** Friday, 24/7/2026
> **Student ID:** `...38`

---

## 1. Objectives

| # | Task (from TODO.md Part 1-4) | Status |
|---|-------------------------------|--------|
| 1 | Part 1: Add `SavingCore_GracePeriodNotElapsed` error to Errors.sol | **Done** |
| 2 | Part 2: RED→GREEN→BLUE `autoRenewDeposit` (9 tests + implementation) | **Done** |
| 3 | Refactor: Extract `_createDeposit` internal helper, refactor `openDeposit` + `autoRenewDeposit` | **Done** |
| 4 | Part 3: RED→GREEN→BLUE `renewDeposit` (10 tests + implementation) | **Done** |
| 5 | Branch-coverage tests: `enablePlan`, `createPlan`, `updatePlan`, `disablePlan` reverts | **Done** |
| 6 | Part 4: Design Q3 + Q6 answers drafted in README §8 | **Done** |
| 7 | Update `business-rules.md` — check off BR-13, BR-14, BR-15 | **Done** |
| 8 | End-of-Day Checklist: compile, test, coverage, PLAN.md updated | **Done** |

---

## 2. Deliverables

| File | Action | Lines Changed |
|------|--------|---------------|
| `contracts/libraries/Errors.sol` | Added `SavingCore_GracePeriodNotElapsed` | +1 |
| `contracts/core/SavingCore.sol` | Implemented `autoRenewDeposit`, `renewDeposit`, extracted `_createDeposit` | 210→270 (+60) |
| `test/core/SavingCore.test.ts` | +10 renewDeposit, +9 autoRenewDeposit, +8 admin branch, +1 enablePlan happy | 416→747 (+331) |
| `README.md` | Design Q3 + Q6 answers in §8 | 134→155 (+21) |
| `docs/design/business-rules.md` | BR-13, BR-14, BR-15 checked off, BR-11 updated | edit |
| `PLAN.md` | Day 5 tasks ticked, progress table updated | edit |

---

## 3. autoRenewDeposit (TODO Part 2)

### 3.1 Custom Error

Added `SavingCore_GracePeriodNotElapsed()` to `contracts/libraries/Errors.sol:21`.

### 3.2 RED — 9 Tests

| # | Test | Proves | Rule |
|---|------|--------|------|
| 1 | Happy path: auto-renew after grace period → new NFT minted, old status AutoRenewed | Core flow | §3.5, BR-15 |
| 2 | Compound math: new principal = old principal + interest = 10,197,260,273 | Math proof | §3.5 |
| 3 | APR lock: updatePlan(0, 800) between open and renew → new deposit uses old APR (400) | APR immutability | BR-15, §6 Rule 4 |
| 4 | Tenor preserved: new deposit tenor = 180 days (same as original) | Tenor preservation | BR-15 |
| 5 | Before grace period (gracePeriodEnd − 1 second) → reverts `GracePeriodNotElapsed` | Guard | BR-14 |
| 6 | At exact grace period second → not reverted by GracePeriodNotElapsed | `>=` boundary | BR-14, test-standard §2 |
| 7 | Old deposit status → AutoRenewed (enum 3) | State | §3.5 |
| 8 | Double auto-renew → reverts `AlreadyWithdrawn` | Guard | BR-07 |
| 9 | `Renewed` event: oldDepositId, newDepositId, newPrincipal, newPlanId correct | Event | §5 |

**Personal variant math:**
```
old principal   = 10,000,000,000 units
interest        = (10,000,000,000 × 400 × 180) / (365 × 10,000) = 197,260,273
new principal   = 10,000,000,000 + 197,260,273 = 10,197,260,273 units
grace period end = maturityAt + 4 × 86,400
```

### 3.3 GREEN — Implementation

`SavingCore.autoRenewDeposit` (`SavingCore.sol:283-320`, 38 lines):

```
Guards:
  1. deposit.status == Active → AlreadyWithdrawn (anyone can call, no owner check)
  2. block.timestamp < maturityAt + personalGracePeriod × 86400 → GracePeriodNotElapsed

Logic:
  - interest = InterestLib.calculateInterest(principal, aprBpsAtOpen, oldTenorDays)
  - newPrincipal = principal + interest  (compound)
  - CEI: deposit.status = AutoRenewed (before external calls)

Interactions:
  - vaultManager.payInterest(address(this), interest)  ← vault pays SavingCore (compound)
  - _createDeposit(oldPlanId, newPrincipal, oldAprBps, oldPenaltyBps, oldTenorDays)

Event: Renewed(depositId, newDepositId, newPrincipal, oldPlanId)
```

**Key design decisions:**
- No owner check — anyone (bot or user) can trigger (§3.5: "A bot calls this")
- APR locked to `aprBpsAtOpen` from old deposit, NOT current plan (BR-15)
- Same tenor as original deposit
- `personalGracePeriod = 4` days constant (personal variant)

### 3.4 BLUE — Verification

- ✅ NatSpec: `@notice`, `@dev`, `@param`, `@return`
- ✅ `nonReentrant` modifier present
- ✅ CEI order: status updated before `payInterest` and `_createDeposit`
- ✅ `Renewed` event verified in test #9
- ✅ 9/9 tests passing

---

## 4. Refactor — `_createDeposit` Helper

### Motivation

`autoRenewDeposit` and `openDeposit` share deposit creation logic (struct packing, `_safeMint`). Extracting an internal helper eliminates duplication.

### Implementation

`SavingCore._createDeposit` (`SavingCore.sol:111-134`, 24 lines):

```solidity
function _createDeposit(
    uint256 planId, uint256 principal, uint16 aprBps,
    uint16 penaltyBps, uint32 tenorDays
) internal returns (uint256) {
    uint256 depositId = nextDepositId++;
    uint64 start_ = uint64(block.timestamp);
    uint64 maturity_ = uint64(block.timestamp + uint256(tenorDays) * 86400);
    deposits[depositId] = Deposit({...});
    _safeMint(msg.sender, depositId);
    return depositId;
}
```

**Callers:** `openDeposit` (line 159), `autoRenewDeposit` (line 307), `renewDeposit` (line 265)

**Key fix:** `uint32` for `oldTenorDays` to match `InterestLib.calculateInterest(uint32)` signature. Internal function calls cost zero extra gas (compile-time copy, not internal transaction).

---

## 5. renewDeposit (TODO Part 3)

### 5.1 RED — 10 Tests

| # | Test | Proves | Rule |
|---|------|--------|------|
| 1 | Happy path: renew at exact maturityAt → new NFT minted, old status ManualRenewed | Core flow | §3.4, BR-13 |
| 2 | Compound math: 10,000 USDC → new principal = 10,197,260,273 | Math proof | §3.4 |
| 3 | New deposit uses NEW plan's APR (600 bps), not old plan's (400) | Manual renew uses new plan | §3.4 |
| 4 | New deposit uses NEW plan's tenor (90 days), not old plan's (180) | New plan params | §3.4 |
| 5 | Before maturity (maturityAt − 1 second) → reverts `NotYetMature` | Guard | §3.4 |
| 6 | Non-NFT-owner calls → reverts `NotOwner` | Access | BR-06 |
| 7 | Double renew → reverts `AlreadyWithdrawn` | Guard | BR-07 |
| 8 | Nonexistent newPlanId (999) → reverts `PlanNotFound` | Guard | — |
| 9 | Disabled new plan → reverts `PlanNotEnabled` | Design Q6 | §8.2 Q6 |
| 10 | `Renewed` event: oldDepositId, newDepositId, newPrincipal, newPlanId correct | Event | §5 |

**Second plan fixture:** 90 days, 600 bps APR, 300 penalty — deliberately different from plan 0 (180 days, 400 bps, 450 penalty) to prove new plan params are used.

### 5.2 GREEN — Implementation

`SavingCore.renewDeposit` (`SavingCore.sol:228-276`, 49 lines):

```
Guards:
  1. msg.sender == ownerOf(depositId) → NotOwner (BR-06)
  2. deposit.status == Active → AlreadyWithdrawn
  3. block.timestamp < maturityAt → NotYetMature (Design Q5: >= boundary)
  4. newPlanId >= nextPlanId → PlanNotFound
  5. !plans[newPlanId].enabled → PlanNotEnabled (Design Q6)

Logic:
  - interest = InterestLib.calculateInterest(principal, aprBpsAtOpen, oldTenorDays)
  - newPrincipal = principal + interest  (compound)
  - CEI: deposit.status = ManualRenewed (before external calls)

Interactions:
  - vaultManager.payInterest(address(this), interest)  ← vault pays SavingCore
  - _createDeposit(newPlanId, newPrincipal, newPlan.aprBps, newPlan.penalty, newPlan.tenorDays)

Event: Renewed(depositId, newDepositId, newPrincipal, newPlanId)
```

**Key differences from autoRenewDeposit:**
| Aspect | renewDeposit | autoRenewDeposit |
|--------|-------------|-----------------|
| Caller | NFT owner only | Anyone (bot or user) |
| Time check | `block.timestamp < maturityAt` (no grace period) | `block.timestamp < maturityAt + gracePeriod` |
| New plan | Uses NEW plan's APR, tenor, penalty | Uses OLD deposit's locked APR and tenor |
| Status | `ManualRenewed` (enum 2) | `AutoRenewed` (enum 3) |

### 5.3 BLUE — Verification

- ✅ NatSpec: `@notice`, `@dev`, `@param`, `@return`
- ✅ `nonReentrant` modifier outermost (before `override`)
- ✅ CEI order: status updated (L258) before `payInterest` (L261) and `_createDeposit` (L265)
- ✅ `Renewed` event verified in test #10
- ✅ Uses `_createDeposit` helper (consistent with `autoRenewDeposit`)
- ✅ 10/10 tests passing

---

## 6. Branch-Coverage Tests

Added 8 admin-function tests to cover branches missed by user-function tests:

| # | Test | Covers |
|---|------|--------|
| 1 | `enablePlan(999)` → reverts `PlanNotFound` | `enablePlan` L87 true branch |
| 2 | `enablePlan` on disabled plan → succeeds, `PlanEnabled` event | `enablePlan` L88 false branch + event |
| 3 | `createPlan` with `minDeposit > maxDeposit` → reverts `InvalidDepositRange` | `createPlan` L59 true branch |
| 4 | `createPlan` with `tenorDays = 0` → reverts `InvalidTenor` | `createPlan` L57 true branch |
| 5 | `createPlan` with `aprBps = 0` → reverts `InvalidApr` | `createPlan` L58 true branch |
| 6 | Non-owner calls `createPlan` → reverts (`onlyOwner`) | `createPlan` L56 false branch |
| 7 | `updatePlan(999)` → reverts `PlanNotFound` | `updatePlan` L78 true branch |
| 8 | `disablePlan(999)` → reverts `PlanNotFound` | `disablePlan` L95 true branch |

---

## 7. Business Rules Verified

| BR | Rule | Test(s) | Code Location |
|----|------|---------|---------------|
| BR-11 | Disabled plan does not affect existing deposits | renewDeposit #9 (cannot renew INTO disabled), withdrawAtMaturity #1/#2 (withdraw works regardless) | `SavingCore.sol:155,175` |
| BR-13 | Manual renew compounds interest, uses new plan, sets ManualRenewed | renewDeposit #1–#4, #10 | `SavingCore.sol:228-276` |
| BR-14 | Auto-renew only after grace period elapsed | autoRenewDeposit #5 (before), #6 (exact boundary) | `SavingCore.sol:289-290` |
| BR-15 | Auto-renew preserves original APR and tenor | autoRenewDeposit #3 (APR lock), #4 (tenor preserved) | `SavingCore.sol:293-298,307-310` |

---

## 8. Design Answers (README §8)

### Q3 — Dead Bot

When the auto-renew bot goes offline for one month, deposits past the grace period remain in `Active` status — nothing is lost. The principal is still held by SavingCore. The user can always call `withdrawAtMaturity` to get principal + interest, or call `renewDeposit` to manually renew into a new plan. In our implementation, `autoRenewDeposit` has no owner check — anyone can call it. So even if the original bot is down, another bot or the user themselves can trigger auto-renew. The deposit is never "stuck."

### Q6 — Disabled Plan with Active Deposits

Users can always `withdrawAtMaturity` and `earlyWithdraw` regardless of plan status. For manual renew (`renewDeposit`): users CANNOT renew INTO a disabled plan — the function checks `plans[newPlanId].enabled` and reverts with `PlanNotEnabled`. This is deliberate: disabling a plan means the admin does not want new deposits, and a renew creates a new deposit. For auto renew (`autoRenewDeposit`): auto-renew uses the old plan's parameters from the deposit snapshot. If the old plan is disabled, auto-renew still works because it reads from the old deposit, not from the plan.

---

## 9. End-of-Day Checklist Verification

### Tests

- `npx hardhat test` — **78/78 passing** ✓
- Every `if`/revert branch in `renewDeposit` has a dedicated test ✓
  - NotOwner (#6), AlreadyWithdrawn (#7), NotYetMature (#5), PlanNotFound (#8), PlanNotEnabled (#9)
- Every `if`/revert branch in `autoRenewDeposit` has a dedicated test ✓
  - AlreadyWithdrawn (#8), GracePeriodNotElapsed (#5), boundary exact second (#6)
- No test depends on execution order (all use `loadFixture`) ✓

### Code Quality

- `npx hardhat compile` — zero errors ✓
- NatSpec complete on all new public/external functions ✓
- Custom errors follow `ContractName_Reason` naming convention ✓
- Events centralized in `Events.sol`, emitted via `Events.Renewed(...)` ✓
- `nonReentrant` outermost on both renew functions ✓
- CEI pattern: status updated before `payInterest` and `_createDeposit` in both ✓
- SafeERC20: all transfers use `safeTransfer`/`safeTransferFrom` ✓
- `_createDeposit` helper shared by 3 functions (DRY) ✓

### Coverage

```
npx hardhat coverage
```

| Metric | SavingCore.sol | VaultManager.sol | All Files |
|--------|---------------|-----------------|-----------|
| Statements | 100% | 100% | 98.86% |
| Branches | 86.36% | 85.71% | 86.17% |
| Functions | 100% | 100% | 96% |
| Lines | 100% | 100% | 99.07% |

**Branch coverage note:** The sub-90% branch metric is caused by solidity-coverage's inability to track the "pass" side of OpenZeppelin inherited modifier branches (`onlyOwner`, `nonReentrant`, `onlySavingCore`, `whenNotPaused`). All actual contract logic branches — every `if`/custom-error in our own code — have dedicated tests. This is a known tool limitation documented in `docs/reports/bugs/coverage-bug.md`.

---

## 10. Verification Results

### Compilation

```
Compiled 1 Solidity file successfully (evm target: cancun).
```

Zero errors. All contracts compile cleanly.

### Tests

```
78 passing (1s)
```

| Suite | Tests | Status |
|-------|-------|--------|
| SavingCore — openDeposit | 11 | All passing |
| SavingCore — admin functions | 8 | All passing |
| SavingCore — withdrawAtMaturity | 12 | All passing |
| SavingCore — earlyWithdraw | 9 | All passing |
| SavingCore — autoRenewDeposit | 9 | All passing |
| SavingCore — renewDeposit | 10 | All passing |
| VaultManager | 19 | All passing |

### Test Breakdown by Category

| Category | Count | Tests |
|----------|-------|-------|
| Happy path | 8 | openDeposit #1, withdrawAtMaturity #1/#2, earlyWithdraw #1/#8, autoRenewDeposit #1, renewDeposit #1, admin enablePlan |
| Event verification | 4 | openDeposit #2, withdrawAtMaturity #9, earlyWithdraw #6, autoRenewDeposit #9, renewDeposit #10 |
| Guard reverts | 18 | openDeposit #4/#5/#6/#7/#8, withdrawAtMaturity #4/#5/#11, earlyWithdraw #4/#5/#9, autoRenewDeposit #5/#8, renewDeposit #5/#6/#7/#8/#9 |
| Boundary tests | 4 | withdrawAtMaturity #1/#7, autoRenewDeposit #5/#6 |
| State verification | 5 | openDeposit #9, withdrawAtMaturity #10, earlyWithdraw #7, autoRenewDeposit #7, renewDeposit #1 |
| Immutability / APR lock | 3 | openDeposit #3, withdrawAtMaturity #12, autoRenewDeposit #3 |
| Math proof | 4 | withdrawAtMaturity #3, earlyWithdraw #8, autoRenewDeposit #2, renewDeposit #2 |
| Architecture | 3 | openDeposit #10/#11, earlyWithdraw #2 |
| Vault solvency | 2 | withdrawAtMaturity #6/#7 |
| Rounding dust | 1 | withdrawAtMaturity #8 |
| Admin branch coverage | 8 | admin #1–#8 (enablePlan, createPlan, updatePlan, disablePlan reverts + happy paths) |

---

## 11. Scoring Impact

| Criterion | Points | Day 5 Contribution |
|-----------|--------|---------------------|
| Interest & penalty math | 20 | Compound math proven in autoRenewDeposit #2 and renewDeposit #2 |
| APR/penalty snapshot immutable | 15 | autoRenewDeposit #3 proves APR lock (BR-15); renewDeposit #3 proves new plan APR used |
| Auto-renew + APR lock + grace period | 15 | **Fully implemented** — 9 tests, grace period boundary, APR lock proof, compound math |
| Manual renew (bonus coverage) | — | **Fully implemented** — 10 tests, new plan params, owner access, maturity boundary |
| Test coverage > 90% | 15 | 78 tests, 100% stmts/funcs/lines, branch limited by OZ modifier tracking |
| Design questions | 10 | Q3 + Q6 drafted with code references (total: Q3, Q4, Q5, Q6 done) |
| Code quality & events | 5 | `_createDeposit` DRY refactor, NatSpec, CEI, centralized events |

---

## 12. Known Gaps & Next Steps

| Gap | Severity | Planned |
|-----|----------|---------|
| Branch coverage 86% (OZ modifier limitation) | Low | Day 6 — may not be fixable without contract changes |
| No integration tests yet | Medium | Day 6+ |
| Design Q1 (transferable NFT), Q2 (empty vault), Q7 (attack thinking) not written | Medium | Days 6-9 |
| `pause` check not yet on renew/withdraw functions | Medium | Day 6 |
| Frontend not started | High | Day 8 |
