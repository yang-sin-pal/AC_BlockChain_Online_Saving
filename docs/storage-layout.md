# Storage Layout

This document describes how on-chain data is organized in the Online Saving System.

The goals are:

- Clearly define the storage model.
- Explain why each field exists.
- Record immutable snapshot values.
- Prepare for future storage optimization.

---

# Overview

The system stores two primary entities:

```text
Saving Plan
      │
      ▼
    Deposit
      │
      ▼
 ERC721 Certificate
```

- A **Plan** defines the saving product.
- A **Deposit** is created from a specific plan.
- Each deposit is represented by one ERC721 NFT.

---

# Plan

A saving plan created and managed by the administrator.

| Field | Type | Description |
|------|------|-------------|
| tenorDays | uint32 | Deposit duration in days. |
| aprBps | uint16 | Annual Percentage Rate (basis points). |
| minDeposit | uint256 | Minimum allowed deposit amount. |
| maxDeposit | uint256 | Maximum allowed deposit amount. |
| earlyWithdrawPenaltyBps | uint16 | Early withdrawal penalty (basis points). |
| enabled | bool | Whether new deposits are allowed. |

---

# Deposit

A saving account opened by a user.

| Field | Type | Description |
|------|------|-------------|
| planId | uint256 | Source saving plan. |
| principal | uint256 | Deposited amount. |
| aprBpsAtOpen | uint16 | APR snapshot when deposit was opened. |
| penaltyBpsAtOpen | uint16 | Penalty snapshot when deposit was opened. |
| startAt | uint64 | Deposit start timestamp. |
| maturityAt | uint64 | Maturity timestamp. |
| status | Status | Current deposit status. |

---

# Deposit Status

```solidity
enum Status {
    Active,
    Withdrawn,
    ManualRenewed,
    AutoRenewed
}
```

---

# Snapshot Fields

The following values are stored permanently when a deposit is opened.

| Field | Reason |
|------|--------|
| aprBpsAtOpen | Existing deposits must not change if the administrator updates the plan APR. |
| penaltyBpsAtOpen | Existing deposits must keep their original early withdrawal penalty. |

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

# Relationships

```text
Plan
  │
  ├──── Deposit #1
  ├──── Deposit #2
  └──── Deposit #3

Each Deposit
        │
        ▼
One ERC721 NFT
```

---

# Storage Considerations

Current priority:

- Readability
- Correct business logic
- Stable storage layout

Storage packing optimization may be applied after the core implementation is completed.

---

# Future Optimization

Possible improvements include:

- Storage packing for smaller integer types.
- Reordering struct fields to reduce storage slots.
- Caching frequently used values.
- Using custom errors instead of revert strings.

// sau này cập nhật thêm storage packing.