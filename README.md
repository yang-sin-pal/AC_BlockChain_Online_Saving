# Online Saving System

Blockchain Programming Final Assignment

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Project Structure](#3-project-structure)
4. [Personal Variant](#4-personal-variant)
5. [Getting Started](#5-getting-started)
6. [Contract APIs](#6-contract-apis)
7. [Design Decisions](#7-design-decisions)
8. [Security Notes](#8-security-notes)
9. [Bonus Features](#9-bonus-features)

Quick check: [Development Status](#-Development-Status)

---

# 1. Overview

The Online Saving System is a decentralized banking application built on Ethereum.

The system allows users to:

- Create fixed-term saving deposits.
- Earn interest after maturity.
- Withdraw early with a penalty.
- Automatically renew deposits.
- Receive an ERC721 certificate representing each deposit.

There are two main roles:

- **Admin** – manages saving plans and vault liquidity.
- **Depositor** – opens and manages saving deposits.

---

# 2. System Architecture

The project consists of three main contracts.

| Contract | Responsibility |
|----------|----------------|
| MockUSDC | ERC20 token used for testing |
| SavingCore | Main business logic |
| VaultManager | Holds funds and pays interest |

More details can be found in:

- docs/architecture.md
- docs/sequence-diagram.md

---

# 3. Project Structure

See:

- docs/folder-structure.md

---

# 4. Personal Variant

**Student ID:** `...38`

| Item | Formula | Value |
|------|---------|------:|
| A (last digit) | 8 | 8 |
| B (second last digit) | 3 | 3 |
| Grace Period | (A mod 3) + 2 | **4 days** |
| Default APR | 200 + A × 25 | **400 bps (4.00%)** |
| Early Withdrawal Penalty | 300 + B × 50 | **450 bps (4.50%)** |
| Default Tenor | B odd → 180 days | **180 days** |

---

# 5. Getting Started

## Install dependencies

```bash
npm install
```

## Compile

```bash
npx hardhat compile
```

## Run tests

```bash
npx hardhat test
```

## Coverage

```bash
npx hardhat coverage
```

---

# 6. Contract APIs

Contract APIs are documented in:

- docs/contract-api.md

---

# 7. Design Decisions

This section will be completed during the implementation phase.

- [ ] Transferable certificate
- [ ] Empty vault
- [ ] Dead bot
- [ ] Rounding dust
- [ ] Boundary times
- [ ] Disabled plan with active deposits
- [ ] Attack thinking

---

# 8. Security Notes

Security considerations will be documented in:

- docs/audit-notes.md

Topics include:

- Access Control
- Reentrancy
- Input Validation
- Custom Errors
- Gas Optimization

---

# 9. Bonus Features

## C1 — Principal Protection

_To be implemented._

---

## C2 — Solvency Guard

_To be implemented._

---

## Development Status

### Day 1

- [x] Hardhat project setup
- [x] TypeScript configuration
- [x] Project folder structure
- [x] Documentation structure
- [ ] MockUSDC
- [ ] Interfaces
- [ ] SavingCore skeleton
- [ ] VaultManager skeleton

### Day 2+

Implementation in progress.