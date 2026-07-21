# AGENTS.md

## Project

Hardhat + Solidity 0.8.28 project. TypeScript tests, CommonJS module system.

## Commands

```shell
npx hardhat compile          # compile contracts (generates artifacts/)
npx hardhat test             # run all tests
npx hardhat test --grep "pattern"  # run matching tests only
REPORT_GAS=true npx hardhat test  # tests with gas reporting
npx hardhat node             # start local JSON-RPC node
npx hardhat ignition deploy ./ignition/modules/Lock.ts  # deploy via Ignition
```

## Structure

- `contracts/` - Solidity source files
- `test/` - Hardhat/Mocha/Chai test files (TypeScript)
- `ignition/modules/` - Hardhat Ignition deployment modules
- `artifacts/` and `cache/` - generated (gitignored)

## Conventions

- Use Hardhat Ignition modules for deployments, not raw scripts
- Tests use `loadFixture` for snapshot/revert state management
- Contracts use `payable` constructor pattern for ETH-accepting deploys
