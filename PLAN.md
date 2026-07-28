# PLAN.md — Blockchain: Online Banking System (Term Deposit)

> Deadline demo: **Wednesday, 29/7/2026** (tomorrow). Priority: solid core (90 points) + frontend (10 points). C1 done (+5 bonus), C2 skipped. Score capped at 100.

## Methodology: Test-Driven Development (TDD)

**Every feature follows TDD: RED → GREEN → REFACTOR.**

1. **RED** — Write failing tests FIRST based on assignment spec (§3 user flows, §6 business rules, §7.2 required test cases). Tests define the contract API before any implementation code.
2. **GREEN** — Write the minimum Solidity code to make those tests pass.
3. **REFACTOR** — Clean up, add NatSpec, optimize. Tests must still pass.

> Per `docs/project/test-standard.md`: Coverage >90% is necessary but not sufficient. Every `if`/`require`/custom-error branch must have a dedicated test that specifically triggers it — not just a happy path that happens to execute the line.

**Non-negotiable rule:** A function is NOT done until all of these are checked:
- [x] Required test cases from `docs/project/assignment.md` §7.2 exist and pass
- [x] Boundary cases from `docs/project/test-standard.md` §2 exist and pass
- [x] Every revert branch has a test that specifically triggers it
- [x] `npx hardhat coverage` shows the function above 90%
- [x] No test depends on execution order (each test sets up its own fixture)

---

## Progress (updated: 28/7/2026)

| Day | Status | Notes |
|-----|--------|-------|
| Day 1 (20/7) | **100% done** | All 6 tasks complete. Fixes: @openzeppelin install, import paths, OZ v5 ReentrancyGuard, evmVersion cancun, BOM stripped, NatSpec. Compile + test pass. |
| Day 2 (21/7) | **Skipped** | VaultManager.sol empty, openDeposit stub, all tests empty |
| Day 3 (22/7) | **100% done** | VaultManager (19/19) + openDeposit (10/10) complete. |
| Day 4 (23/7) | **100% done** | withdrawAtMaturity (12/12) + earlyWithdraw (9/9) + InterestLib. 51 tests total. Q4+Q5 drafted. |
| Day 5 (24/7) | **100% done** | autoRenewDeposit (9/9) + renewDeposit (10/10) + admin branch tests (8). 78 tests total. Q3+Q6 drafted. |
| Day 6 (25/7) | **100% done** | Buffer day — non-owner revert tests, reentrancy mock + tests, Design Q1/Q2/Q7. 88 tests total. |
| Day 7 (26/7) | **100% done** | Coverage > 90% verified. C1 implemented: claimPrincipal, claimInterest, burn, dual-pause, onlyDepositOwner modifier. C1 tests. 153 tests. |
| Day 8 (27/7) | **100% done** | Coverage gap fixes — 7 new tests in SavingCore.coverage.test.ts. 160 tests. SC 93.06%, VM 96.67%. |
| Day 9 (28/7) | **100% done** | Diagrams rewrite + README fix + AGENTS.md rewrite + frontend plan. **C2 skipped.** |

**Schedule:** Tomorrow is 29/7 (Day 10 — DEMO). Days 1–9 complete. Frontend ready to build.

### Test Count History

| Milestone | Tests | Files |
|-----------|-------|-------|
| Day 3 end | 30 | 2 test files |
| Day 4 end | 51 | 4 test files |
| Day 5 end | 78 | 6 test files |
| Day 6 end | 88 | 8 test files |
| Day 7 end (C1) | 153 | 15 test files |
| Day 8 end (coverage) | **160** | **16 test files** |

---

## How to use this file (for agent)

- On session start, read this file to know which day/task is current, which are ☑ done.
- After completing a task, tick `[x]` on that exact line. Do not modify other tasks' content.
- If a day's tasks aren't finished and time runs out, leave `[ ]` untouched — user decides whether to carry over.

---

## Day 1 — Monday, 20/7 — Setup + MockUSDC + SavingCore skeleton

- [x] Calculate personal variant from Student ID (assignment §8.1), write into README header
- [x] `npx hardhat init`, install `@openzeppelin/contracts`, `solhint`, `hardhat-gas-reporter`, `solidity-coverage`
  > Ref: assignment §7.1 — deliverables are MockUSDC, VaultManager, SavingCore
- [x] Write `ISavingCore.sol`, `IVaultManager.sol` with full NatSpec before contract bodies
  > Ref: assignment §10 — "Consider using OpenZeppelin's ERC721, Ownable, and Pausable"
- [x] `MockUSDC.sol`: ERC20 6 decimals, public `mint()`
  > Ref: assignment §1 — "6 decimals, anyone can mint it for testing"
- [x] SavingCore skeleton: struct Plan + Deposit, enum Status, inherit ERC721 + Ownable2Step + ReentrancyGuard
  > Ref: assignment §2.2 — deposit certificate records plan, principal, timestamps, snapshotted APR/penalty, status
- [x] README.md skeleton with full TOC, personal variant values filled in

> 📄 **Report:** [Day1-Report.md](docs/reports/Day1-Report.md)

---

## Day 2 — Tuesday, 21/7 — VaultManager + openDeposit *(not started — absorbed into Day 3)*

> **Original tasks moved to Day 3.** VaultManager + openDeposit + tests were too much for one day alongside C2. C2 deferred to Day 7.

---

## Day 3 — Wednesday, 22/7 — VaultManager + openDeposit (TDD)

> Ref: assignment §4 Admin Functions, §3.1 Open Deposit, §6 Business Rules §1+§7

### VaultManager (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Write `VaultManager.test.ts`: test fundVault (happy, non-owner revert), withdrawVault (happy, non-owner revert, over-balance revert), setFeeReceiver, pause/unpause (withdraw blocked when paused) | assignment §4, §6 rule §6 |
| 🟢 GREEN | Implement `VaultManager.sol`: fundVault, withdrawVault, setFeeReceiver, pause/unpause | assignment §4 |
| 🔵 REFACTOR | NatSpec on all public/external functions, verify all events emitted | assignment §10 |

- [x] **RED:** Write VaultManager tests first — define expected behavior from spec
- [x] **GREEN:** Implement VaultManager to pass those tests
- [x] **BLUE:** Add NatSpec, verify events, run `npx hardhat test`
  > Ref: assignment §5 — Required events: PlanCreated, PlanUpdated, DepositOpened, Withdrawn, Renewed

### openDeposit (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Write `SavingCore.test.ts` — openDeposit tests: happy path (plan enabled, amount in range, NFT minted, APR/penalty snapshotted), disabled plan revert, below min revert, above max revert, zero-amount revert | assignment §3.1, §6 rule §1, §7.2 |
| 🟢 GREEN | Implement `openDeposit`: enabled check, min/max, `transferFrom`, mint ERC721 NFT, snapshot aprBpsAtOpen + penaltyBpsAtOpen, set maturityAt = block.timestamp + tenorDays × 86400 | assignment §3.1 steps §1–§6 |
| 🔵 REFACTOR | Verify DepositOpened event emits correct fields, NatSpec complete | assignment §5 event, §10 |

- [x] **RED:** Write openDeposit tests — happy path + all revert conditions
- [x] **GREEN:** Implement openDeposit to pass tests
- [x] **BLUE:** Verify event, NatSpec, compile + test pass

### End of Day 3 checklist

- [x] `npx hardhat compile` — no errors
- [x] `npx hardhat test` — all new tests pass
- [x] VaultManager + openDeposit: every branch has a dedicated test (test-standard.md §3)

> 📄 **Report:** [Day3-Report.md](docs/reports/Day3-Report.md)

---

## Day 4 — Thursday, 23/7 — withdrawAtMaturity + earlyWithdraw (TDD)

> Ref: assignment §3.2 Withdraw at Maturity, §3.3 Early Withdrawal, §6 rules §2+§3

### withdrawAtMaturity (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Write tests: happy path (correct interest via formula), too-early revert (before maturityAt), already-withdrawn revert, double-withdraw revert, rounding dust test with odd principal, vault-insufficient revert (exact boundary — less than owed interest) | assignment §3.2 formula, §7.2, test-standard.md §2 |
| 🟢 GREEN | Implement: simple interest = (principal × aprBpsAtOpen × tenorSeconds) / (365 × 24 × 3600 × 10000). Multiply before divide. Use `>= maturityAt` for boundary. Transfer principal+interest from self, interest from vault. | assignment §3.2 formula, §10 precision tip |
| 🔵 REFACTOR | NatSpec, verify Withdrawn event: depositId, owner, principal, interest, isEarly=false | assignment §5 |

- [x] **RED:** Write withdrawAtMaturity tests — formula proof + all revert branches
- [x] **GREEN:** Implement withdrawAtMaturity — multiply-before-divide, `>=` boundary
- [x] **BLUE:** Verify Withdrawn event, NatSpec, compile + test

> **Design Q4 (rounding dust):** Write answer in README now — prove with the odd-principal test which party keeps the truncated remainder. Ref: assignment §8.2 Q4
>
> **Design Q5 (boundary operators):** Write answer in README now — justify `>=` at maturityAt. Ref: assignment §8.2 Q5

### earlyWithdraw (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Tests: happy path (penalty = principal × penaltyBpsAtOpen / 10000, zero interest), zero-interest assertion, feeReceiver receives penalty, double-early-withdraw revert, before-min-time revert if applicable | assignment §3.3, §6 rule §3, §7.2 |
| 🟢 GREEN | Implement: calculate penalty, transfer (principal - penalty) to user, penalty to feeReceiver, status = Withdrawn | assignment §3.3 |
| 🔵 REFACTOR | NatSpec, verify Withdrawn event with isEarly=true | assignment §5 |

- [x] **RED:** Write earlyWithdraw tests
- [x] **GREEN:** Implement earlyWithdraw
- [x] **BLUE:** Verify event, NatSpec

### End of Day 4 checklist

- [x] `npx hardhat compile` + `npx hardhat test` — all pass
- [x] Design Q4 and Q5 answers written in README, referencing specific test + line numbers
- [x] Interest formula proven with real numbers matching personal variant (assignment §8.1)

> 📄 **Report:** [Day4-Report.md](docs/reports/Day4-Report.md)

---

## Day 5 — Friday, 24/7 — Auto Renew + Manual Renew (TDD)

> Ref: assignment §3.4 Manual Renew, §3.5 Auto Renew, §6 rules §4+§1

### autoRenewDeposit (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Tests: before grace period revert (now < maturityAt + gracePeriod), at exact grace period second allowed (`>=`), after grace period allowed, APR locked to `aprBpsAtOpen` (not current plan rate — prove with updatePlan between open and renew), compound principal = old + interest, new NFT minted, old status = AutoRenewed, double-auto-renew revert | assignment §3.5, §6 rule §4, test-standard.md §2 grace period boundary |
| 🟢 GREEN | Implement: check `block.timestamp >= maturityAt + personalGracePeriod`, calculate interest, new principal = old + interest, mint new NFT with same tenor + locked APR, set old status | assignment §3.5 rules |
| 🔵 REFACTOR | NatSpec, verify Renewed event: oldDepositId, newDepositId, newPrincipal, newPlanId | assignment §5 |

- [x] **RED:** Write autoRenewDeposit tests — grace period boundary + APR lock proof
- [x] **GREEN:** Implement autoRenewDeposit
- [x] **BLUE:** Verify event, NatSpec

> **Design Q3 (dead bot):** Write answer in README now — what happens if bot goes offline for a month, how to protect user. Ref: assignment §8.2 Q3

### renewDeposit (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Tests: happy path (new plan, compound principal, new NFT), revert before maturityAt, revert into disabled plan (Design Q6 — write answer now), double-renew revert | assignment §3.4, §7.2, assignment §8.2 Q6 |
| 🟢 GREEN | Implement: check `block.timestamp >= maturityAt`, calculate interest, new principal, mint new NFT, old status = ManualRenewed | assignment §3.4 |
| 🔵 REFACTOR | NatSpec, verify Renewed event | assignment §5 |

- [x] **RED:** Write renewDeposit tests
- [x] **GREEN:** Implement renewDeposit
- [x] **BLUE:** Verify event, NatSpec

> **Design Q6 (disabled plan with active deposits):** Write answer in README now — can users renew INTO a disabled plan? Justify. Ref: assignment §8.2 Q6

### End of Day 5 checklist

- [x] `npx hardhat compile` + `npx hardhat test` — all pass
- [x] Design Q3 and Q6 answers written in README
- [x] Auto-renew grace period boundary proven with exact-second test

---

## Day 6 — Saturday, 25/7 — Buffer / Catch-up ✅ COMPLETE

> This day has NO new features. It exists to absorb delays.

- [x] Finish anything slipped from Days 3–5
- [x] Run `npx hardhat coverage` — identify branches below 90%
- [x] Fill coverage gaps: walk every `if`/`require` in each contract, ensure each has a dedicated test (test-standard.md §3)
- [x] **Write Design Q1 (NFT transferable) in README** — ref: assignment §8.2 Q1
- [x] **Write Design Q2 (empty vault) in README** — ref: assignment §8.2 Q2
- [x] Full `npx hardhat compile` + `npx hardhat test` — clean pass from zero

---

## Day 7 — Sunday, 26/7 — Coverage > 90% + C1 Implementation ✅ COMPLETE

> Ref: assignment §7.2 — "Coverage must be above 90%", §8.2 Q7, §8.3 C1

- [x] Achieve `npx hardhat coverage` > 90% — each function individually checked
  > Ref: test-standard.md §5 — Definition of Done checklist per function
- [x] **Design Q7 (attack thinking):** reentrancy chosen — `ReentrancyGuard` + `nonReentrant` on all external state-changing functions. Mock attacker contract as proof. Ref: assignment §8.2 Q7
- [x] Write reentrancy mock test — `ReentrantAttacker.sol` attempts reentrant call on 5 functions, all revert. Ref: test-standard.md §2
- [x] **C1 (Principal Protection) — implemented:**
  - [x] `claimPrincipal(depositId)` — pays principal from SavingCore, stores interest as `pendingInterest`
  - [x] `claimInterest(depositId)` — Path A (Active: vault pays) + Path B (PrincipalClaimed: pays from pending). Partial vault payment supported.
  - [x] `burn(depositId)` — blocked if `pendingInterest > 0` via `_update` override
  - [x] Dual-pause architecture: SavingCore pause blocks vault-dependent ops, NOT principal withdrawal
  - [x] `onlyDepositOwner(depositId)` modifier — 6 functions
  - [x] C1 tests: 18 integration tests covering all paths + edge cases
  > Ref: assignment §8.3 C1, test-standard.md §6

---

## Day 8 — Monday, 27/7 — Coverage Gap Fixes ✅ COMPLETE

> SavingCore.sol dropped to 89.58% after test file moves. Fixed with targeted tests.

- [x] Run `npx hardhat coverage` — found SavingCore at 89.58% (below 90%)
- [x] Analyzed 15 uncovered branches (4 OZ modifier false paths untestable, 11 testable)
- [x] Added 7 coverage tests in `SavingCore.coverage.test.ts`:
  - burn on Active deposit, burn by non-owner, claimPrincipal on Withdrawn/earlyWithdrawn
  - claimInterest with vault=0, renewDeposit on Withdrawn, autoRenewDeposit on Withdrawn
- [x] Final coverage: **SavingCore 93.06%, VaultManager 96.67%** — both above 90%
- [x] 160 tests passing

---

## Day 9 — Tuesday, 28/7 — Diagrams + README + AGENTS.md ✅ COMPLETE

> Rewrote all design diagrams, verified README, updated AGENTS.md

- [x] **Activity diagram rewrite** — 10 flows with correct modifiers, CEI order, pause checks
- [x] **Activity diagram Mermaid fix** — `\n` → `<br/>`, quoted diamond nodes with operators (`>=`, `<=`, `<`, `!=`)
- [x] **Sequence diagram rewrite** — 13 sequences including C1, burn, setSavingCore, pause/unpause
- [x] **Use case diagram rewrite** — 26 use cases, corrected BR mappings
- [x] **README.md verification** — found 9 outdated items, fixed all (line refs, test counts, file path, broken sentence)
- [x] **AGENTS.md rewrite** — fully updated with current test counts, dual-pause architecture, onlyDepositOwner modifier
- [x] **Test file move** — 6 integration tests moved from `test/unit/SavingCore/` to `test/integration/`, import paths fixed
- [x] **`docs/audit/folder-structure.md` update** — tree diagram and descriptions updated
- [x] **Phase 1 coverage verification** — 160 tests, SC 93.06%, VM 96.67%
- [x] **Frontend development plan** — `docs/reports/frontend-development-plan.md`
- [x] **TODO.md rewritten** — 9 frontend tasks, ~135 min estimated

---

## Day 10 — Wednesday, 29/7 — DEMO

> Frontend development (Vite + React + TS) + deployment + demo video. C2 skipped.

- [ ] Task 1: Deployment scripts (deploy.ts + seed.ts + hardhat config)
- [ ] Task 2: Frontend scaffold (Vite + React + TS + ethers)
- [ ] Task 3: Core utilities (format, networks, hooks)
- [ ] Task 4: Layout + header + ConnectWallet
- [ ] Task 5: PlansTab (view plans + open deposit)
- [ ] Task 6: DepositsTab (view deposits + withdraw/renew/C1 flows)
- [ ] Task 7: AdminTab (fund vault + create plan + pause)
- [ ] Task 8: Polish + error handling + responsive
- [ ] Task 9: Frontend report (`docs/reports/Frontend-Report.md`)
- [ ] Record demo video (3–5 min)
- [ ] Final `npx hardhat compile` + `npx hardhat test` + `npx hardhat coverage`

---

## Scoring Reference (quick lookup)

| Criterion | Points | Status | Assignment Ref |
|-----------|--------|--------|----------------|
| Interest & penalty math | 20 | ✅ Done (Day 4) | §3.2, §3.3, §6 rules §2+§3 |
| APR/penalty snapshot immutable | 15 | ✅ Done (Day 3–5) | §6 rule §1, §2.2 |
| Auto-renew + APR lock + grace period | 15 | ✅ Done (Day 5) | §3.5, §6 rule §4 |
| Vault management & pause/unpause | 10 | ✅ Done (Day 3) | §4 |
| Test coverage > 90% | 15 | ✅ Done (Day 8) — SC 93.06%, VM 96.67% | §7.2 |
| Design questions + oral defense | 10 | ✅ Done (Days 4–9) — all 7 questions | §8.2 (7 questions) |
| Frontend demo | 10 | ⏳ Pending (Day 10) | §7.3 |
| Code quality & events | 5 | ✅ Done (throughout) | §5, §10 |
| Bonus C1 | +5 | ✅ Done (Day 7) | §8.3 C1 |
| Bonus C2 | +5 | ⏭️ Skipped (time constraint) | §8.3 C2 |
| **Total** | **100 + 10 bonus** | **95 secured (90 core + 5 C1)** | §9 |
