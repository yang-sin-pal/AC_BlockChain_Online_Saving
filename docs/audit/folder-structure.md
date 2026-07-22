# Folder Structure

This document describes the project directory organization.

```
AC_BlockChain_Online_Saving/
│
├── contracts/
│   │
│   ├── core/
│   │   ├── SavingCore.sol
│   │   └── VaultManager.sol
│   │
│   ├── interfaces/
│   │   ├── ISavingCore.sol
│   │   └── IVaultManager.sol
│   │
│   ├── mocks/
│   │   └── MockUSDC.sol
│   │
│   └── libraries/
│       ├── InterestLib.sol
│       ├── Errors.sol
│       └── Events.sol
│
├── scripts/
│   ├── deploy.ts
│   ├── createPlan.ts
│   └── seed.ts
│
├── test/
│   │
│   ├── core/
│   │   ├── SavingCore.test.ts
│   │   └── VaultManager.test.ts
│   │
│   ├── integration/
│   │   ├── OpenDeposit.test.ts
│   │   ├── Withdraw.test.ts
│   │   ├── Renew.test.ts
│   │   └── FullFlow.test.ts
│   │
│   ├── mocks/
│   │   └── MockUSDC.test.ts
│   │
│   └── helpers/
│       ├── fixtures.ts
│       ├── constants.ts
│       └── utils.ts
│
├── docs/
│   ├── project/
│   │   ├── assignment.md
│   │   ├── code-convention.md
│   │   └── test-standard.md
│   ├── design/
│   │   ├── system-architecture.md
│   │   ├── business-rules.md
│   │   ├── contract-api.md
│   │   ├── access-control.md
│   │   └── storage-layout.md
│   ├── diagrams/
│   │   ├── activity-diagram.md
│   │   ├── sequence-diagram.md
│   │   └── usecase-diagram.md
│   ├── audit/
│   │   ├── audit-notes.md
│   │   └── folder-structure.md
│   └── Reports/
│       └── Day1-Report.md
│
├── ignition/
│
├── artifacts/
├── cache/
├── typechain-types/
│
├── hardhat.config.ts
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

---

# Folder Descriptions

## contracts/

Contains all Solidity smart contracts.

### core/

Main business logic contracts.

- `SavingCore.sol` – Saving deposit management.
- `VaultManager.sol` – Vault for holding funds and paying interest.

### interfaces/

Public interfaces shared across contracts.

- `ISavingCore.sol`
- `IVaultManager.sol`

### mocks/

Mock contracts for testing.

- `MockUSDC.sol`

### libraries/

Reusable libraries.

- `InterestLib.sol` – Interest calculation.
- `Errors.sol` – Custom errors.
- `Events.sol` – Shared events.

---

## scripts/

Deployment and initialization scripts.

- `deploy.ts` – Deploy contracts.
- `createPlan.ts` – Create saving plans.
- `seed.ts` – Populate test/demo data.

---

## test/

Unit and integration tests.

### core/

Tests for individual contracts.

### integration/

End-to-end workflow tests.

### mocks/

Tests for mock contracts.

### helpers/

Shared utilities for tests.

- `fixtures.ts` – Deploy fixtures.
- `constants.ts` – Shared constants.
- `utils.ts` – Helper functions.

---

## docs/

Project documentation organized into subfolders.

### project/

Admin and assignment info.

- `assignment.md` – Project requirements.
- `code-convention.md` – Code style conventions.
- `test-standard.md` – Testing standards.

### design/

Technical specifications.

- `system-architecture.md` – System architecture.
- `business-rules.md` – Business rules.
- `contract-api.md` – Contract APIs.
- `access-control.md` – Access control matrix.
- `storage-layout.md` – Storage layout.

### diagrams/

UML and visual diagrams.

- `activity-diagram.md` – Activity diagram.
- `sequence-diagram.md` – Sequence diagram.
- `usecase-diagram.md` – Use case diagram.

### audit/

Audit and review notes.

- `audit-notes.md` – Security notes and findings.
- `folder-structure.md` – Project directory guide.

### Reports/

Daily progress reports.

---

# Design Principles

- Separate business logic from interfaces.
- Keep contracts modular and reusable.
- Share test utilities through `helpers/`.
- Write interfaces and tests before implementations.
- Keep code follow documentation.