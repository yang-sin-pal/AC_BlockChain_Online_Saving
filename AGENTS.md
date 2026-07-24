# AGENTS.md

## Commands

```bash
npm install              # Install dependencies
npx hardhat compile      # Compile contracts (Solidity 0.8.28, cancun EVM)
npx hardhat test         # Run all tests
npx hardhat coverage     # Run coverage report
```

**`npm test` is a placeholder** (`echo "Error: no test specified"`). Always use `npx hardhat test` directly. No lint, typecheck, or formatter is configured.

## Dev Workflow

**TDD is mandatory** — every feature follows RED → GREEN → REFACTOR per `PLAN.md`.

1. **RED** — write failing tests first based on `docs/project/assignment.md`
2. **GREEN** — write minimum Solidity to pass those tests
3. **REFACTOR** — clean up, add NatSpec; tests must still pass

A function is **not done** until: required test cases exist, every revert branch has a dedicated test, and `npx hardhat coverage` shows >90% for that function.

## Project Status

**Days 1–4 complete** — 51 tests passing. See `PLAN.md` for day-by-day progress. Deadline: 29/7/2026.

| Component | Status |
|-----------|--------|
| `ISavingCore.sol`, `IVaultManager.sol` | Complete — NatSpec done |
| `MockUSDC.sol` | Complete — ERC20, 6 decimals, public `mint()` |
| `VaultManager.sol` | Complete — fundVault, withdrawVault, setFeeReceiver, pause/unpause, payInterest (19 tests) |
| `SavingCore.sol` | Plan CRUD + `openDeposit` + `withdrawAtMaturity` + `earlyWithdraw` complete (32 tests). **`renewDeposit` and `autoRenewDeposit` are stubs** (`revert("TODO")`) |
| `Errors.sol`, `Events.sol` | Complete — all custom errors and events defined |
| `InterestLib.sol` | Complete — `calculateInterest` pure function |
| `test/helpers/*.ts` | Complete — `fixtures.ts` (deployAllContracts), `utils.ts` (toUSDC, increaseTime, calculateExpectedInterest), `constants.ts` (personal variant values) |
| `test/core/*.ts` | Complete — 51 unit tests across SavingCore + VaultManager |
| `test/integration/*.ts` | Empty files — placeholders for Day 5+ |
| `scripts/*.ts` | Stub comments only |

## Architecture

```
User → approve(MockUSDC) → SavingCore.transferFrom() → SavingCore → VaultManager.transfer()
```

- **SavingCore** holds user principal, owns all business logic, mints ERC721 certificates per deposit
- **VaultManager** holds bank's interest pool (funded by admin), pays interest on SavingCore's request
- Fund separation is the core architectural rule — mixing principal and interest pools is a design error

Full architecture: `docs/design/system-architecture.md`

## Personal Variant (Student ID ending in 38)

| Parameter | Value |
|-----------|-------|
| Grace Period | 4 days |
| Default APR | 400 bps (4.00%) |
| Early Withdrawal Penalty | 450 bps (4.50%) |
| Default Tenor | 180 days |

## Key Conventions

- **Solidity 0.8.28**, `hardhat-toolbox` (TypeScript), EVM target `cancun`
- **Custom errors** only — no `require(cond, "string")`. Define all in `Errors.sol`, named `ContractName_Reason` (e.g. `error SavingCore_PlanNotEnabled()`)
- **Events** in past tense (`DepositOpened`, not `OpenDeposit`), defined in `Events.sol`
- **NatSpec** required on all public/external functions (`@notice`, `@param`, `@return`). Comment the *reason*, not the variable name
- **`nonReentrant`** outermost modifier (before `onlyOwner`, custom checks)
- **Checks-Effects-Interactions** — update state before `transfer`/`transferFrom`
- **SafeERC20** — always use `safeTransfer`/`safeTransferFrom`, never raw `IERC20.transfer`
- **Interest formulas** in `InterestLib.sol` (`pure` functions), not inline in SavingCore. **Multiply before divide** to avoid rounding to zero
- **Boundary at `maturityAt`**: use `>=` consistently (Design Q5)
- **APR/penalty snapshot** at deposit open time — never re-read plan values after deposit is opened

Full conventions: `docs/project/code-convention.md`

## Test Structure

```
test/
├── core/              # Unit tests (SavingCore.test.ts 618 lines, VaultManager.test.ts 254 lines)
├── integration/       # Empty placeholders — populate in Days 5+
├── mocks/             # MockUSDC.test.ts — empty
└── helpers/           # fixtures.ts, utils.ts, constants.ts — real implementations, import from here
```

- **Use `test/helpers/`** — `deployAllContractsFixture`, `toUSDC()`, `increaseTime()`, `calculateExpectedInterest()`, personal variant constants
- **Test standard**: `docs/project/test-standard.md` — every function needs boundary cases (exact maturityAt second, rounding dust, double withdraw, reentrancy, vault insufficient, plan disabled mid-flight, APR snapshot immutability). Coverage >90% is necessary but not sufficient.
- **Business rules**: `docs/design/business-rules.md` — 17 rules (BR-01 to BR-17), each with implementation and verification strategy.

## Docs

```
docs/
├── audit/            # audit-notes.md, folder-structure.md
├── design/           # business-rules.md, contract-api.md, access-control.md, system-architecture.md, storage-layout.md
├── diagrams/         # sequence-diagram.md, activity-diagram.md, usecase-diagram.md
├── project/          # assignment.md, code-convention.md, test-standard.md
└── reports/          # Day1-Report.md, Day3-Report.md, Day4-Report.md
```

## Gotchas

- `package.json` test script is a placeholder — use `npx hardhat test`
- No `.env` committed, no network config — Hardhat local chain only
- `typechain-types/` is gitignored — regenerate with `npx hardhat compile`
- OZ v5: `Ownable2Step` constructor requires `Ownable(msg.sender)`, not `Ownable()`
- `renewDeposit` and `autoRenewDeposit` use `revert("TODO")` stubs — not yet using custom errors (convention violation, temporary)
- Test fixtures use `loadFixture()` from hardhat-network-helpers — each test gets a fresh snapshot, no shared state between tests
