# AGENTS.md

## Commands

```bash
npm install              # Install dependencies
npx hardhat compile      # Compile contracts (Solidity 0.8.28, cancun EVM)
npx hardhat test         # Run all tests
npx hardhat coverage     # Run coverage report
```

**`npm test` is a placeholder** (`echo "Error: no test specified"`). Always use `npx hardhat test` directly. No lint, typecheck, or formatter is configured.

## Project Status

**Early stage** — Day 1 of 10 complete. See `PLAN.md` for day-by-day progress.

| Component | Status |
|-----------|--------|
| `ISavingCore.sol`, `IVaultManager.sol` | Complete — NatSpec done |
| `MockUSDC.sol` | Complete — ERC20, 6 decimals, public `mint()` |
| `SavingCore.sol` | Plan management implemented. `openDeposit`, `withdraw`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit` are stubs (`revert("TODO")`) |
| `VaultManager.sol` | **Empty file** |
| `Errors.sol`, `Events.sol`, `InterestLib.sol` | Comment-only placeholders — no actual code |
| `test/helpers/*.ts` | Placeholder comments only — no real helpers yet |
| All test files | Empty |
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
├── core/              # Unit tests (SavingCore.test.ts, VaultManager.test.ts)
├── intergration/      # Integration tests 
├── mocks/             # MockUSDC.test.ts
└── helpers/           # fixtures.ts, constants.ts, utils.ts (all stubs currently)
```

**Test standard**: `docs/project/test-standard.md` — every function needs boundary cases proven (exact maturityAt second, rounding dust, double withdraw, reentrancy, vault insufficient, plan disabled mid-flight, APR snapshot immutability). Coverage >90% is necessary but not sufficient.

**Business rules**: `docs/design/business-rules.md` — 17 rules (BR-01 to BR-17), each with implementation and verification strategy.

## Docs

```
docs/
├── audit/            # audit-notes.md, folder-structure.md
├── design/           # business-rules.md, contract-api.md, access-control.md, system-architecture.md, storage-layout.md
├── diagrams/         # sequence-diagram.md, activity-diagram.md, usecase-diagram.md
├── project/          # assignment.md, code-convention.md, test-standard.md
└── reports/          # Day1-Report.md
```

## Gotchas

- `package.json` test script is a placeholder — use `npx hardhat test`
- No `.env` committed, no network config — Hardhat local chain only
- `typechain-types/` is gitignored — regenerate with `npx hardhat compile`
- OZ v5: `Ownable2Step` constructor requires `Ownable(msg.sender)`, not `Ownable()`
