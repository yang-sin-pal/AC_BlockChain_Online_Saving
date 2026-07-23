# Business Rules

This document defines the core business rules of the Online Saving System.

Each rule describes:

- the business requirement,
- what it protects,
- how it should be implemented,
- how it should be verified,
- the source requirement in `assignment.md`.

---

| ID | Business Rule | Protects | Implementation | Verification | Source |
|----|---------------|----------|----------------|--------------|--------|
| BR-01 | Deposit amount must be within the plan's minimum and maximum limits. | Prevent invalid deposits. | Validate `minDeposit <= amount <= maxDeposit`. | Unit test valid and invalid deposit amounts. | §3.1 point 3 |
| BR-02 | Users can only open deposits for enabled plans. | Prevent using inactive plans. | Check `plan.enabled`. | Attempt to deposit into a disabled plan. | §3.1 point 3 |
| BR-03 | Only the owner can create or modify saving plans. | Prevent unauthorized administration. | `onlyOwner` modifier. | Non-owner transaction must revert. | §4 Admin Functions |
| BR-04 | Deposit parameters (APR and penalty) are fixed when a deposit is opened. | Existing deposits are unaffected by future plan updates. | Store APR and penalty inside `Deposit`. | Update a plan and verify existing deposits remain unchanged. | §3.1 point 7, §6 Rule 1 |
| BR-05 | Each successful deposit must mint exactly one ERC721 certificate. | Ensure ownership tracking. | `_safeMint()` once per deposit. | Verify NFT ownership and mint event. | §3.1 point 5 |
| BR-06 | Only the certificate owner can withdraw or renew a deposit. | Prevent unauthorized access. | `ownerOf(tokenId) == msg.sender`. | Non-owner transaction must revert. | §3.2, §3.3, §3.4 (implied) |
| BR-07 | A deposit cannot be withdrawn more than once. | Prevent double spending. | Update deposit status before transferring funds. | Second withdrawal must revert. | §10 Hints |
| BR-08 | Early withdrawal applies the configured penalty and pays zero interest. | Ensure penalty enforcement. | Calculate penalty using stored value; set interest = 0. | Compare payout before maturity. | §3.3, §6 Rule 3 |
| BR-09 | Mature withdrawal returns principal plus simple interest. | Ensure correct interest payment. | Calculate using simple interest formula: `(principal * aprBpsAtOpen * tenorSeconds) / (365 * 24 * 3600 * 10000)`. | Compare expected and actual payout. | §3.2, §6 Rule 2 |
| BR-10 | Vault must have sufficient balance before paying users. | Prevent failed payouts or insolvency. | Check vault balance before transfer; revert if insufficient. | Simulate insufficient vault balance. | §6 Rule 5 |
| BR-11 | A disabled plan does not affect existing deposits. | Preserve user rights after plan updates. | Only block new deposits. | Existing deposits remain withdrawable. | §6 Rule 7 |
| BR-12 | All token transfers must be protected against reentrancy. | Prevent reentrancy attacks. | `ReentrancyGuard`. | Reentrancy attack test. | §10 Hints |
| BR-13 | Manual renew is only allowed on or after maturityAt. It compounds interest into the new principal and mints a new NFT using the new plan's rate. The old deposit status is set to ManualRenewed. | Ensure renew is only possible after term ends; old deposit is properly retired. | Check `block.timestamp >= maturityAt`; calculate interest; new principal = old principal + interest; mint new NFT with newPlanId; update old deposit status. | Attempt renew before maturity (must revert); verify new principal, new plan rate, and old status. | §3.4 |
| BR-14 | Auto-renew is only allowed after the grace period has elapsed since maturity. | Prevent premature auto-renewal. | Check `block.timestamp >= maturityAt + gracePeriod * 86400`. | Attempt auto-renew before grace period ends (must revert). | §3.5, §8.1 |
| BR-15 | Auto-renew preserves the original deposit's APR (aprBpsAtOpen), not the current plan's APR. The tenor is also the same as the original deposit. | Protect users from rate decreases after deposit is opened. | Use stored `aprBpsAtOpen` and `tenorDays` from old deposit, not from plan. | Update plan APR after deposit; verify auto-renew uses old APR. | §3.5, §6 Rule 4 |
| BR-16 | When the system is paused, no withdrawals or renewals (manual or auto) are allowed. | Emergency protection against exploits or unexpected behavior. | Check `_paused()` before withdraw and renew functions; revert if paused. | Pause system; attempt withdraw and renew (both must revert). | §6 Rule 6 |
| BR-17 | Early withdrawal penalty is sent to the feeReceiver address set by the admin. | Ensure penalties are properly collected. | Transfer penalty amount to `feeReceiver`; revert if feeReceiver is not set. | Verify feeReceiver balance increases by penalty amount. | §3.3, §4 setFeeReceiver |

---

# Rule Lifecycle

```text
Business Rule
        │
        ▼
Implementation
        │
        ▼
Unit Test
        │
        ▼
Integration Test
```

Every business rule should have at least one corresponding test case.

---

# Implementation Checklist

| Rule | Status |
|------|--------|
| BR-01 | ☐ |
| BR-02 | ☐ |
| BR-03 | ☑ |
| BR-04 | ☐ |
| BR-05 | ☐ |
| BR-06 | ☐ |
| BR-07 | ☐ |
| BR-08 | ☐ |
| BR-09 | ☐ |
| BR-10 | ☐ |
| BR-11 | ☐ |
| BR-12 | ☐ |
| BR-13 | ☐ |
| BR-14 | ☐ |
| BR-15 | ☐ |
| BR-16 | ☑ |
| BR-17 | ☐ |
