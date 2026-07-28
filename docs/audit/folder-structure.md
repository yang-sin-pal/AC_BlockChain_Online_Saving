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
│   ├── libraries/
│   │   ├── InterestLib.sol
│   │   ├── Errors.sol
│   │   └── Events.sol
│   │
│   └── mocks/
│       ├── MockUSDC.sol
│       ├── ReentrantAttacker.sol
│       └── ReentrantToken.sol
│
├── scripts/
│   ├── deploy.ts
│   ├── createPlan.ts
│   └── seed.ts
│
├── test/
│   │
│   ├── unit/
│   │   ├── SavingCore/
│   │   │   ├── SavingCore.openDeposit.test.ts
│   │   │   ├── SavingCore.adminFunctions.test.ts
│   │   │   ├── SavingCore.earlyWithdraw.test.ts
│   │   │   └── SavingCore.pause.test.ts
│   │   │
│   │   └── VaultManager/
│   │       ├── VaultManager.fundVault.test.ts
│   │       ├── VaultManager.withdrawVault.test.ts
│   │       ├── VaultManager.setFeeReceiver.test.ts
│   │       ├── VaultManager.pause.test.ts
│   │       ├── VaultManager.payInterest.test.ts
│   │       ├── VaultManager.setSavingCore.test.ts
│   │       ├── VaultManager.views.test.ts
│   │       └── VaultManager.reentrancy.test.ts
│   │
│   ├── integration/
│   │   ├── PauseInteraction.test.ts
│   │   ├── SavingCore.withdrawAtMaturity.test.ts
│   │   ├── SavingCore.autoRenew.test.ts
│   │   ├── SavingCore.renewDeposit.test.ts
│   │   ├── SavingCore.c1.test.ts
│   │   ├── SavingCore.interestClaim.test.ts
│   │   └── SavingCore.reentrancy.test.ts
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
│   └── reports/
│       ├── progress/
│       │   ├── Day1-Report.md
│       │   ├── Day3-Report.md
│       │   ├── Day4-Report.md
│       │   └── Day5-Report.md
│       └── bugs/
│           ├── coverage-bug.md
│           ├── circular-solution.md
│           ├── PausePatternAnalysis.md
│           └── state-machine-status.md
│
├── artifacts/
├── cache/
├── typechain-types/
│
├── AGENTS.md
├── PLAN.md
├── TODO.md
├── README.md
├── hardhat.config.ts
├── package.json
├── tsconfig.json
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

### libraries/

Reusable libraries.

- `InterestLib.sol` – Interest calculation.
- `Errors.sol` – Custom errors.
- `Events.sol` – Shared events.

### mocks/

Mock and attacker contracts for testing.

- `MockUSDC.sol` – ERC20 token simulating USDC (6 decimals) with open minting.
- `ReentrantAttacker.sol` – Malicious contract for reentrancy tests.
- `ReentrantToken.sol` – ERC20 with callback hook for reentrancy tests.

---

## scripts/

Deployment and initialization scripts.

- `deploy.ts` – Deploy contracts.
- `createPlan.ts` – Create saving plans.
- `seed.ts` – Populate test/demo data.

---

## test/

Unit & Integration.

### unit/

Per-contract unit tests, split by `describe` block.

#### SavingCore/

- `SavingCore.openDeposit.test.ts` – Deposit creation, NFT minting, validation.
- `SavingCore.adminFunctions.test.ts` – Plan CRUD (create, update, enable, disable).
- `SavingCore.earlyWithdraw.test.ts` – Early withdrawal, penalty calculation.
- `SavingCore.pause.test.ts` – Pause/unpause behavior across all functions.

#### VaultManager/

- `VaultManager.fundVault.test.ts` – Vault funding.
- `VaultManager.withdrawVault.test.ts` – Vault withdrawal.
- `VaultManager.setFeeReceiver.test.ts` – Fee receiver management.
- `VaultManager.pause.test.ts` – Pause/unpause behavior.
- `VaultManager.payInterest.test.ts` – Interest payment from vault.
- `VaultManager.setSavingCore.test.ts` – SavingCore address management.
- `VaultManager.views.test.ts` – View functions (vaultBalance, feeReceiver).
- `VaultManager.reentrancy.test.ts` – Reentrancy on withdrawVault.

### integration/

Cross-contract tests — SavingCore↔VaultManager interactions, pause interactions, reentrancy.

- `PauseInteraction.test.ts` – Cross-contract pause scenarios.
- `SavingCore.withdrawAtMaturity.test.ts` – Maturity withdrawal with vault payment, vault insufficiency.
- `SavingCore.autoRenew.test.ts` – Auto-renew with vault-funded interest.
- `SavingCore.renewDeposit.test.ts` – Manual renewal with vault-funded interest.
- `SavingCore.c1.test.ts` – C1: claimPrincipal, claimInterest, partial vault payment, burn guards.
- `SavingCore.interestClaim.test.ts` – claimInterest Path A/B, partial vault payment, retry.
- `SavingCore.reentrancy.test.ts` – Reentrancy attacks across SavingCore↔VaultManager boundary.

### helpers/

Shared utilities for tests. **Import from here, not inline.**

- `fixtures.ts` – Deploy fixtures (`deployAllContractsFixture`, `fixtureWithPlan`, `deployVaultManager`).
- `constants.ts` – Shared constants (APR, penalty, tenor, etc.).
- `utils.ts` – Helper functions (`toUSDC()`, `increaseTime()`, `calculateExpectedInterest()`).

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

### reports/

Daily progress reports and bug notes.

- `progress/` – Day1, Day3, Day4, Day5 reports.
- `bugs/` – Coverage bug, circular dependency, pause pattern analysis, and state machine status docs.

---

# Design Principles

- Separate business logic from interfaces.
- Keep contracts modular and reusable.
- Share test utilities through `helpers/`.
- Write interfaces and tests before implementations.
- Keep code follow documentation.
