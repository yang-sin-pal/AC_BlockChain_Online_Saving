# Business Rules

This document defines the core business rules of the Online Saving System.

Each rule describes:

- the business requirement,
- what it protects,
- how it should be implemented,
- how it should be verified.

---

| ID | Business Rule | Protects | Implementation | Verification |
|----|---------------|----------|----------------|--------------|
| BR-01 | Deposit amount must be within the plan's minimum and maximum limits. | Prevent invalid deposits. | Validate `minDeposit <= amount <= maxDeposit`. | Unit test valid and invalid deposit amounts. |
| BR-02 | Users can only open deposits for enabled plans. | Prevent using inactive plans. | Check `plan.enabled`. | Attempt to deposit into a disabled plan. |
| BR-03 | Only the owner can create or modify saving plans. | Prevent unauthorized administration. | `onlyOwner` modifier. | Non-owner transaction must revert. |
| BR-04 | Deposit parameters (APR and penalty) are fixed when a deposit is opened. | Existing deposits are unaffected by future plan updates. | Store APR and penalty inside `Deposit`. | Update a plan and verify existing deposits remain unchanged. |
| BR-05 | Each successful deposit must mint exactly one ERC721 certificate. | Ensure ownership tracking. | `_safeMint()` once per deposit. | Verify NFT ownership and mint event. |
| BR-06 | Only the certificate owner can withdraw or renew a deposit. | Prevent unauthorized access. | `ownerOf(tokenId) == msg.sender`. | Non-owner transaction must revert. |
| BR-07 | A deposit cannot be withdrawn more than once. | Prevent double spending. | Update deposit status before transferring funds. | Second withdrawal must revert. |
| BR-08 | Early withdrawal applies the configured penalty. | Ensure penalty enforcement. | Calculate penalty using stored value. | Compare payout before maturity. |
| BR-09 | Mature withdrawal returns principal plus interest. | Ensure correct interest payment. | Calculate maturity payout. | Compare expected and actual payout. |
| BR-10 | Vault must have sufficient balance before paying users. | Prevent failed payouts or insolvency. | Check vault balance before transfer. | Simulate insufficient vault balance. |
| BR-11 | A disabled plan does not affect existing deposits. | Preserve user rights after plan updates. | Only block new deposits. | Existing deposits remain withdrawable. |
| BR-12 | All token transfers must be protected against reentrancy. | Prevent reentrancy attacks. | `ReentrancyGuard`. | Reentrancy attack test. |

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
| BR-03 | ☐ |
| BR-04 | ☐ |
| BR-05 | ☐ |
| BR-06 | ☐ |
| BR-07 | ☐ |
| BR-08 | ☐ |
| BR-09 | ☐ |
| BR-10 | ☐ |
| BR-11 | ☐ |
| BR-12 | ☐ |