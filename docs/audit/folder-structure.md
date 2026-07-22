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
│   ├── libraries/
│   │   ├── InterestLib.sol          (optional)
│   │   ├── Errors.sol               (optional)
│   │   └── Events.sol               (optional)
│   │
│   └── utils/
│       └── TimeHelper.sol           (optional)
│
├── scripts/
│   ├── deploy.ts                    (later)
│   ├── createPlan.ts                (later)
│   └── seed.ts                      (later)
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
│   └── helpers/
│       ├── fixtures.ts
│       ├── constants.ts             (optional)
│       └── utils.ts                 (optional)
│
├── docs/
│   ├── architecture.md
│   ├── folder-structure.md
│   ├── sequence-diagram.md
│   ├── contract-api.md
│   └── audit-notes.md
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
- `Events.sol` – Shared events (optional).

### utils/

Utility contracts if reusable helper logic is needed.

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

### helpers/

Shared utilities for tests.

- `fixtures.ts` – Deploy fixtures.
- `constants.ts` – Shared constants.
- `utils.ts` – Helper functions.

---

## docs/

Project documentation.

- `architecture.md` – System architecture.
- `folder-structure.md` – Project directory guide.
- `api.md` – Contract APIs.
- `audit-notes.md` – Security notes and findings.

---

# Design Principles

- Separate business logic from interfaces.
- Keep contracts modular and reusable.
- Share test utilities through `helpers/`.
- Write interfaces before implementations.
- Keep documentation synchronized with code.