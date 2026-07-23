# PLAN.md — Blockchain: Online Banking System (Term Deposit)

> Deadline demo: **Wednesday, 29/7/2026**. Priority: solid core (90 points) + frontend (10 points) first. Bonus C1+C2 only after core is stable. Score capped at 100.

## Methodology: Test-Driven Development (TDD)

**Every feature follows TDD: RED → GREEN → REFACTOR.**

1. **RED** — Write failing tests FIRST based on assignment spec (§3 user flows, §6 business rules, §7.2 required test cases). Tests define the contract API before any implementation code.
2. **GREEN** — Write the minimum Solidity code to make those tests pass.
3. **REFACTOR** — Clean up, add NatSpec, optimize. Tests must still pass.

> Per `docs/project/test-standard.md`: Coverage >90% is necessary but not sufficient. Every `if`/`require`/custom-error branch must have a dedicated test that specifically triggers it — not just a happy path that happens to execute the line.

**Non-negotiable rule:** A function is NOT done until all of these are checked:
- [ ] Required test cases from `docs/project/assignment.md` §7.2 exist and pass
- [ ] Boundary cases from `docs/project/test-standard.md` §2 exist and pass
- [ ] Every revert branch has a test that specifically triggers it
- [ ] `npx hardhat coverage` shows the function above 90%
- [ ] No test depends on execution order (each test sets up its own fixture)

---

## Progress (updated: 22/7/2026)

| Day | Status | Notes |
|-----|--------|-------|
| Day 1 (20/7) | **100% done** | All 6 tasks complete. Fixes: @openzeppelin install, import paths, OZ v5 ReentrancyGuard, evmVersion cancun, BOM stripped, NatSpec. Compile + test pass. |
| Day 2 (21/7) | **Skipped** | VaultManager.sol empty, openDeposit stub, all tests empty |
| Day 3 (22/7) | 50% done | VaultManager complete (19/19 tests). openDeposit not started. |

**Schedule:** Today is 22/7 (Day 3). ~2 days behind. Day 1 blocker resolved — project compiles.

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

- [ ] **RED:** Write openDeposit tests — happy path + all revert conditions
- [ ] **GREEN:** Implement openDeposit to pass tests
- [ ] **BLUE:** Verify event, NatSpec, compile + test pass

### End of Day 3 checklist

- [x] `npx hardhat compile` — no errors
- [x] `npx hardhat test` — all new tests pass
- [ ] VaultManager + openDeposit: every branch has a dedicated test (test-standard.md §3)

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

- [ ] **RED:** Write withdrawAtMaturity tests — formula proof + all revert branches
- [ ] **GREEN:** Implement withdrawAtMaturity — multiply-before-divide, `>=` boundary
- [ ] **BLUE:** Verify Withdrawn event, NatSpec, compile + test

> **Design Q4 (rounding dust):** Write answer in README now — prove with the odd-principal test which party keeps the truncated remainder. Ref: assignment §8.2 Q4
>
> **Design Q5 (boundary operators):** Write answer in README now — justify `>=` at maturityAt. Ref: assignment §8.2 Q5

### earlyWithdraw (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Tests: happy path (penalty = principal × penaltyBpsAtOpen / 10000, zero interest), zero-interest assertion, feeReceiver receives penalty, double-early-withdraw revert, before-min-time revert if applicable | assignment §3.3, §6 rule §3, §7.2 |
| 🟢 GREEN | Implement: calculate penalty, transfer (principal - penalty) to user, penalty to feeReceiver, status = Withdrawn | assignment §3.3 |
| 🔵 REFACTOR | NatSpec, verify Withdrawn event with isEarly=true | assignment §5 |

- [ ] **RED:** Write earlyWithdraw tests
- [ ] **GREEN:** Implement earlyWithdraw
- [ ] **BLUE:** Verify event, NatSpec

### End of Day 4 checklist

- [ ] `npx hardhat compile` + `npx hardhat test` — all pass
- [ ] Design Q4 and Q5 answers written in README, referencing specific test + line numbers
- [ ] Interest formula proven with real numbers matching personal variant (assignment §8.1)

---

## Day 5 — Friday, 24/7 — Auto Renew + Manual Renew (TDD)

> Ref: assignment §3.4 Manual Renew, §3.5 Auto Renew, §6 rules §4+§1

### autoRenewDeposit (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Tests: before grace period revert (now < maturityAt + gracePeriod), at exact grace period second allowed (`>=`), after grace period allowed, APR locked to `aprBpsAtOpen` (not current plan rate — prove with updatePlan between open and renew), compound principal = old + interest, new NFT minted, old status = AutoRenewed, double-auto-renew revert | assignment §3.5, §6 rule §4, test-standard.md §2 grace period boundary |
| 🟢 GREEN | Implement: check `block.timestamp >= maturityAt + personalGracePeriod`, calculate interest, new principal = old + interest, mint new NFT with same tenor + locked APR, set old status | assignment §3.5 rules |
| 🔵 REFACTOR | NatSpec, verify Renewed event: oldDepositId, newDepositId, newPrincipal, newPlanId | assignment §5 |

- [ ] **RED:** Write autoRenewDeposit tests — grace period boundary + APR lock proof
- [ ] **GREEN:** Implement autoRenewDeposit
- [ ] **BLUE:** Verify event, NatSpec

> **Design Q3 (dead bot):** Write answer in README now — what happens if bot goes offline for a month, how to protect user. Ref: assignment §8.2 Q3

### renewDeposit (TDD order)

| Step | Task | Ref |
|------|------|-----|
| 🔴 RED | Tests: happy path (new plan, compound principal, new NFT), revert before maturityAt, revert into disabled plan (Design Q6 — write answer now), double-renew revert | assignment §3.4, §7.2, assignment §8.2 Q6 |
| 🟢 GREEN | Implement: check `block.timestamp >= maturityAt`, calculate interest, new principal, mint new NFT, old status = ManualRenewed | assignment §3.4 |
| 🔵 REFACTOR | NatSpec, verify Renewed event | assignment §5 |

- [ ] **RED:** Write renewDeposit tests
- [ ] **GREEN:** Implement renewDeposit
- [ ] **BLUE:** Verify event, NatSpec

> **Design Q6 (disabled plan with active deposits):** Write answer in README now — can users renew INTO a disabled plan? Justify. Ref: assignment §8.2 Q6

### End of Day 5 checklist

- [ ] `npx hardhat compile` + `npx hardhat test` — all pass
- [ ] Design Q3 and Q6 answers written in README
- [ ] Auto-renew grace period boundary proven with exact-second test

---

## Day 6 — Saturday, 25/7 — Buffer / Catch-up

> This day has NO new features. It exists to absorb delays.

- [ ] Finish anything slipped from Days 3–5
- [ ] Run `npx hardhat coverage` — identify branches below 90%
- [ ] Fill coverage gaps: walk every `if`/`require` in each contract, ensure each has a dedicated test (test-standard.md §3)
- [ ] **Write Design Q1 (NFT transferable) in README** — ref: assignment §8.2 Q1
- [ ] **Write Design Q2 (empty vault) in README** — ref: assignment §8.2 Q2
- [ ] Full `npx hardhat compile` + `npx hardhat test` — clean pass from zero

---

## Day 7 — Sunday, 26/7 — Coverage > 90% + Attack Thinking + Optional C2

> Ref: assignment §7.2 — "Coverage must be above 90%", §8.2 Q7, §8.3 C2

- [ ] Achieve `npx hardhat coverage` > 90% — each function individually checked
  > Ref: test-standard.md §5 — Definition of Done checklist per function
- [ ] **Design Q7 (attack thinking):** pick reentrancy OR double-withdraw, show exact code line that stops it, write answer in README. Ref: assignment §8.2 Q7
- [ ] Write reentrancy mock test if chosen — malicious contract attempts reentrant call, prove revert. Ref: test-standard.md §2
- [ ] **C2 (solvency guard) — ONLY if coverage > 90% already:**
  - [ ] RED: Write C2 tests per test-standard.md §6.2
  - [ ] GREEN: Implement `totalInterestOwed`, block `withdrawVault` below owed
  - [ ] Write `BONUS_NOTES.md`: problem / solution / trade-off for C2
  > Ref: assignment §8.3 C2, test-standard.md §6

---

## Day 8 — Monday, 27/7 — Frontend (4 flows)

> Ref: assignment §7.3 — "React frontend that connects to MetaMask"

- [ ] MetaMask connection, read MockUSDC balance
- [ ] Plan list + open deposit form: validate min/max in UI, `approve()` then `openDeposit()` as separate transactions
- [ ] User deposit list: status, countdown to `maturityAt`, disable withdraw button if not yet mature
- [ ] Withdraw / Renew buttons + result notification (read from Withdrawn/Renewed events)
- [ ] Test full flow in browser against local Hardhat node

---

## Day 9 — Tuesday, 28/7 — README + Video + Final Polish

> Ref: assignment §7.4 — Design Answers in README, §11 — submission requirements

- [ ] README complete: Overview, Personal Variant values + computation, run/deploy instructions, all 7 Design Answers with file:line references
  > Ref: assignment §8.1 — "Write your ID digits and computed values at the top of your README"
  > Ref: assignment §7.4 — "3–6 sentences per question, matching your own code"
- [ ] BONUS_NOTES.md complete (if C1/C2 implemented)
- [ ] Record demo video (3–5 min): frontend walkthrough + 1–2 min code walkthrough (snapshot APR, reentrancy guard, solvency guard C2)
  > Ref: assignment §11 — "A short demo video (3–5 minutes)"
- [ ] Self-Q&A practice: all 7 design questions, with numbers changed ("what if penalty was 0 bps?")
  > Ref: assignment §8.2 — "teacher will pick 2–3 questions at random and may change the numbers"
- [ ] Final `npx hardhat compile` + `npx hardhat test` + `npx hardhat coverage`

---

## Day 10 — Wednesday, 29/7 — DEMO

- [ ] Morning: final push, verify repo structure matches assignment §11
- [ ] Demo

---

## Scoring Reference (quick lookup)

| Criterion | Points | Days | Assignment Ref |
|-----------|--------|------|----------------|
| Interest & penalty math | 20 | Day 4 | §3.2, §3.3, §6 rules §2+§3 |
| APR/penalty snapshot immutable | 15 | Day 3–5 | §6 rule §1, §2.2 |
| Auto-renew + APR lock + grace period | 15 | Day 5 | §3.5, §6 rule §4 |
| Vault management & pause/unpause | 10 | Day 3 | §4 |
| Test coverage > 90% | 15 | Day 6–7 | §7.2 |
| Design questions + oral defense | 10 | Days 4–7, 9 | §8.2 (7 questions) |
| Frontend demo | 10 | Day 8 | §7.3 |
| Code quality & events | 5 | Throughout | §5, §10 |
| Bonus C1 | +5 | Day 7 (if core done) | §8.3 C1 |
| Bonus C2 | +5 | Day 7 (if core done) | §8.3 C2 |
| **Total** | **100 + 10 bonus** | | §9 |
