# AGENTS.md

## Project Overview

Blockchain-based online saving system (term deposit) on Ethereum. University project (CSE410). Deadline: **July 29, 2026**.

Three contracts: `MockUSDC` (ERC20, 6 decimals), `SavingCore` (business logic, ERC721 certificates), `VaultManager` (holds funds, pays interest).

## Commands

```bash
npm install              # Install dependencies
npx hardhat compile      # Compile contracts (Solidity 0.8.28)
npx hardhat test         # Run all tests
npx hardhat coverage     # Run coverage report
```

**No lint, typecheck, or formatter configured.** The `npm test` script is a placeholder (`echo "Error: no test specified"`). Always use `npx hardhat test` directly.

## Project Status

**Early stage** — most core files are empty stubs. Interfaces (`ISavingCore.sol`, `IVaultManager.sol`) and `MockUSDC.sol` are complete. `SavingCore.sol` and `VaultManager.sol` are empty. All test files are empty placeholders. See `PLAN.md` for the day-by-day development plan.

## Architecture

```
User → approve(MockUSDC) → SavingCore.transferFrom() → SavingCore → VaultManager.transfer()
```

- **SavingCore** owns all business logic, mints ERC721 certificates per deposit
- **VaultManager** is a separate vault that holds USDC, pays interest, supports pause/unpause
- APR and penalty are **snapshot at deposit open time** (BR-04) — plan changes don't affect existing deposits

## Personal Variant (Student ID ending in 38)

| Parameter | Value |
|-----------|-------|
| Grace Period | 4 days |
| Default APR | 400 bps (4.00%) |
| Early Withdrawal Penalty | 450 bps (4.50%) |
| Default Tenor | 180 days |

## Key Conventions

- **Solidity 0.8.28** with `hardhat-toolbox` (TypeScript)
- **Custom errors** over `require(..., "string")` — gas cheaper, defined in `Errors.sol`
- **NatSpec comments** required on all functions (per `PLAN.md` and existing interfaces)
- **Events** go in `Events.sol` library (optional consolidation)
- **InterestLib** — placeholder for interest/penalty formulas when they grow complex

## Test Structure

```
test/
├── core/              # Unit tests: SavingCore.test.ts, VaultManager.test.ts
├── intergration/      # Integration tests (note: typo is intentional per PLAN.md)
│   ├── OpenDeposit.test.ts
│   ├── Withdraw.test.ts
│   ├── Renew.test.ts
│   └── FullFlow.test.ts
├── mocks/             # MockUSDC.test.ts
└── helpers/
    ├── fixtures.ts    # Shared deployAllContracts() setup
    ├── constants.ts   # APR, TENOR, MIN_DEPOSIT, etc.
    └── utils.ts       # toUSDC(), increaseTime(), expectRevert()
```

**All test files are currently empty.** Helpers have placeholder comments describing intended API.

## Critical Implementation Notes

- Interest formula: simple interest, **multiply before divide** (to avoid rounding to zero)
- Boundary at `maturityAt`: use `>=` consistently (Design Q5)
- Auto-renew locks APR from original deposit (`aprBpsAtOpen`), not current plan
- Bonus C1 (Principal Protection): if vault insufficient, pay principal immediately, record debt in `pendingInterest[depositId]`
- Bonus C2 (Solvency Guard): `withdrawVault()` must revert if it would break interest obligations

## Docs

All in `docs/`: `architecture.md`, `business-rules.md` (17 rules BR-01 to BR-17, each with assignment source), `contract-api.md`, `access-control.md`, `audit-notes.md`, `folder-structure.md`, `sequence-diagram.md`, `storage-layout.md`.

## Gotchas

- `test/intergration/` directory name has a typo (missing 'a') — do not rename, tests may reference this path
- `package.json` has no useful `test` script — always use `npx hardhat test`
- No `.env` file committed; Hardhat config has no network config (local only)
- `typechain-types/` is gitignored — regenerate with `npx hardhat compile`
