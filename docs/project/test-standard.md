# Test-standard.md — Definition of Done for Tests

> Coverage `>90%` is a necessary condition, not a sufficient one. A branch with a green checkmark in the coverage report but no boundary/edge test is NOT done. This file defines what "done" means for each category of function.

## 1. Required test cases (per assignment)

The minimum test cases required by the assignment are already listed in `docs/assignment.md`, Section 7.2. Do not duplicate that list here — read it directly from that file before writing tests for `createPlan`, `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`, Vault, and Pause.

## 2. Mandatory boundary cases (core)

These must have a **dedicated test case each**, regardless of overall coverage %. A branch is not "done" until its boundary is proven, not just executed once on a happy path.

| Boundary | What must be proven |
| --- | --- |
| `maturityAt` exact second | Withdrawing at exactly `maturityAt` is treated as "at maturity", not "early" (Design Q5) — assert the `>=` comparison, not just a nearby timestamp |
| End of grace period exact second | At exactly `maturityAt + gracePeriod`, auto-renew is allowed; one second before, it must revert (Design Q5) |
| Rounding dust | At least one test with a small/odd principal amount that proves where the truncated remainder goes (vault or user), per Design Q4 |
| Double withdraw | Calling `withdrawAtMaturity` or `earlyWithdraw` twice on the same `depositId` must revert on the second call |
| Double renew | Calling `renewDeposit` or `autoRenewDeposit` twice on the same `depositId` must revert on the second call |
| Reentrancy | A malicious mock contract attempts a reentrant call during withdraw/renew and the transaction reverts (Design Q7) |
| Vault insufficient at exact payout moment | Vault has less than the exact interest owed (not just "empty") — the failure mode must be tested at the boundary, not only when the vault balance is 0 |
| Plan disabled mid-flight | `disablePlan` while deposits from that plan are still Active — confirm those deposits can still withdraw/renew per the rule chosen for Design Q6, and confirm `openDeposit` on that plan reverts |
| APR/penalty snapshot immutability | After `updatePlan` changes `aprBps`, an already-open deposit's `aprBpsAtOpen` must be unchanged, proven by a test that updates the plan between deposit-open and deposit-withdraw |

## 3. Non-negotiable rule: never stop at the coverage % number

Before considering any function "tested", manually walk every `if`/`require`/custom-error branch in that function and confirm each one has an assertion that specifically triggers it — not just a happy-path test that happens to also execute the line via a fallback.

If `npx hardhat coverage` shows a branch as covered but no test asserts a **specific** revert or return value for that branch, it does not count as done.

## 4. Test file structure

Follow the structure already defined in `AGENTS.md` (`test/core/`, `test/intergration/` — note intentional typo, do not rename, `test/mocks/`, `test/helpers/`). Do not invent a different structure.

## 5. Definition of Done (core, pre-bonus)

A function is DONE when:
- [ ] All required test cases from `docs/assignment.md` Section 7.2 exist and pass
- [ ] All applicable boundary cases from Section 2 above exist and pass
- [ ] Every revert branch in the function has a test that specifically triggers it
- [ ] `npx hardhat coverage` shows the function above 90%
- [ ] No test depends on execution order (each test sets up its own fixture state)

---

## 6. Bonus test standard — only applies if C1 and/or C2 are implemented

Do not apply this section, and do not flag anything as "incomplete" against it, unless the corresponding bonus challenge has actually been started.

### If C1 (Principal is always safe) is implemented

- [ ] Test: vault has less than owed interest → `withdrawAtMaturity` does NOT revert, principal is paid immediately
- [ ] Test: the shortfall is correctly recorded in `pendingInterest[depositId]`
- [ ] Test: user can later call the claim function once vault is funded, and receives exactly the recorded pending amount (not more, not less)
- [ ] Test: calling the claim function twice does not double-pay
- [ ] `BONUS_NOTES.md` has a written problem/solution/trade-off entry for C1

### If C2 (Solvency guard) is implemented

- [ ] Test: `withdrawVault` reverts if the withdrawal would bring vault balance below `totalInterestOwed`
- [ ] Test: `totalInterestOwed` increases correctly when a new deposit is opened
- [ ] Test: `totalInterestOwed` decreases correctly when a deposit is withdrawn or renewed
- [ ] Test: `withdrawVault` still succeeds when the withdrawal keeps the vault at or above `totalInterestOwed`
- [ ] `BONUS_NOTES.md` has a written problem/solution/trade-off entry for C2

### If both C1 and C2 are implemented together

- [ ] Test: a case where C1's principal-always-safe behavior and C2's solvency guard interact correctly — e.g., after C1 pays out principal without full interest, `totalInterestOwed` is adjusted so C2 doesn't over-block future `withdrawVault` calls