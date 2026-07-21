# System Architecture

## Overview

The Online Saving System is composed of three main smart contracts.

```
                +------------------+
                |    MockUSDC      |
                |   (ERC20 Token)  |
                +---------+--------+
                          |
                          | Transfer USDC
                          |
                          v
                +----------------------+
                |     SavingCore       |
                |----------------------|
                | - Saving Plans       |
                | - Deposits           |
                | - Interest Logic     |
                | - ERC721 Certificate |
                +----------+-----------+
                           |
                           | Manage Funds
                           |
                           v
                +----------------------+
                |    VaultManager      |
                |----------------------|
                | - Hold USDC          |
                | - Pay Interest       |
                | - Admin Funding      |
                +----------------------+
```

---

# Components

## MockUSDC

Purpose:

- Simulate a USDC token for development and testing.

Responsibilities:

- ERC20 token with 6 decimals.
- Public mint function.
- Used only in local testing.

---

## SavingCore

Purpose:

Main business logic of the saving system.

Responsibilities:

- Manage saving plans.
- Open deposits.
- Calculate maturity.
- Handle withdrawal.
- Handle renewal.
- Mint ERC721 deposit certificates.

---

## VaultManager

Purpose:

Store and manage the protocol's funds.

Responsibilities:

- Receive deposits.
- Hold liquidity.
- Pay interest.
- Allow admin funding.

---

# Contract Relationships

```
User
 │
 │ approve()
 ▼
MockUSDC
 │
 │ transferFrom()
 ▼
SavingCore
 │
 │ transfer()
 ▼
VaultManager
```

---

# Design Principles

- Separation of concerns.
- Interface-first development.
- Modular architecture.
- Reusable components.
- Security by design.

---

# Future Extensions

Possible future improvements:

- Multiple supported tokens.
- Dynamic interest calculation.
- DAO governance.
- Upgradeable contracts.
- Reward system.