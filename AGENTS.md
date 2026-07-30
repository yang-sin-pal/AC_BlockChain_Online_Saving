# AGENTS.md

## Project

Decentralised fixed-term saving system — Solidity backend (Hardhat) + React/Vite frontend.

## Commands

```bash
# From project root
npx hardhat compile               # compiles + auto-copies ABIs to frontend/src/abi/
npx hardhat test                  # 158 tests — npm test (root) is a placeholder
npx hardhat coverage              # Solidity test coverage report
npx hardhat node                  # local chain on :8545
npm run deploy-seed               # deploy + seed in one command

# From frontend/
cd frontend && npm run dev        # dev server on :3000
cd frontend && npm run build      # tsc -b && vite build
cd frontend && npm run lint       # oxlint (NOT eslint)
```

Deployment addresses are **deterministic** — same on every fresh `npx hardhat node`.

## Architecture

```
User → approve(MockUSDC) → SavingCore.transferFrom() → SavingCore   VaultManager.transfer()
                                                                          ↓
                                                                   (interest pool, funded by admin)
```

- **SavingCore** holds user principal, owns all business logic, mints ERC721 per deposit
- **VaultManager** holds the bank's interest pool, pays interest on SavingCore's request
- **Fund separation** is the cardinal rule — mixing principal and interest pools is a design error

### Dual-Pause

| Pause | Blocks | Does NOT block |
|-------|--------|----------------|
| **SavingCore.paused** | `withdrawAtMaturity`, `claimInterest`, `renewDeposit`, `autoRenewDeposit` | `claimPrincipal`, `earlyWithdraw`, `openDeposit` |
| **VaultManager.paused** | `withdrawVault`, `payInterest` | `fundVault`, `setFeeReceiver`, `setSavingCore` |

### C1 — Principal Protection

`claimPrincipal(depositId)` pays principal immediately from SavingCore, stores interest in `pendingInterest[depositId]`. User later calls `claimInterest(depositId)` to claim from vault (two paths: Path A from Active status vault pay, Path B from `pendingInterest`). Supports partial vault payment.

## Personal Variant (ID ending in 38)

| Parameter | Value |
|-----------|-------|
| Grace Period | 4 days |
| Default APR | 400 bps (4.00%) |
| Early Withdrawal Penalty | 450 bps (4.50%) |
| Default Tenor | 180 days |

## Contracts

```
contracts/
├── core/
│   ├── SavingCore.sol       # plans, deposits, withdraw, renew, ERC721 mint, C1
│   └── VaultManager.sol     # vault fund/withdraw, payInterest, feeReceiver
├── interfaces/
│   ├── ISavingCore.sol
│   └── IVaultManager.sol
├── libraries/
│   ├── Errors.sol           # custom errors only — no require("string")
│   ├── Events.sol           # past-tense naming (DepositOpened)
│   └── InterestLib.sol      # pure functions — multiply before divide
└── mocks/MockUSDC.sol
```

### Key Conventions
- Solidity 0.8.28, EVM `cancun`, OZ v5 (`Ownable2Step` requires `Ownable(msg.sender)`)
- Custom errors only — named `ContractName_Reason`
- `SafeERC20` — always `safeTransfer`/`safeTransferFrom`
- Boundary at `maturityAt`: use `>=` consistently
- APR/penalty snapshotted at deposit open — never re-read plan values later

## Test Layout

```
test/
├── helpers/constants.ts     # personal variant values shared across all tests
├── helpers/fixtures.ts      # loadFixture wrappers (deployDeposit, deferredDeposit, etc.)
├── helpers/utils.ts         # toUSDC() and other test utilities
├── unit/
│   ├── SavingCore/          # 4 files: admin, earlyWithdraw, openDeposit, pause
│   └── VaultManager/        # 8 files: fund, pause, payInterest, reentrancy, etc.
└── integration/             # 8 files — named feature.test.ts
```

No single test file. Use `npx hardhat test --grep <pattern>` to run specific tests.

## Frontend

```
frontend/src/
├── abi/                     # ABI-only JSON (auto-copied on compile)
├── config/contracts.json    # addresses (synced from deployments/localhost.json)
├── hooks/
│   ├── useWallet.ts         # MetaMask connection state
│   └── useContracts.ts      # Contract instances with signer/provider
├── components/
│   ├── Layout.tsx           # sidebar (240px) + header (#1F1F1F) + content (#F9F9F7)
│   ├── ConnectWallet.tsx    # wallet connect, USDC balance, faucet mint
│   ├── PlansTab.tsx         # dropdown + highlight card + approve/deposit form
│   ├── DepositsTab.tsx      # "Số dư hoạt động" cards + "Lịch sử" table w/ pagination
│   ├── AdminTab.tsx         # stats, vault ops, pause, create plan, audit log
│   ├── AddressDisplay.tsx   # truncated address + copy-to-clipboard
│   └── AuditLog.tsx         # event log table
└── utils/
    ├── format.ts            # formatUSDC, parseUSDC, formatDate, timeUntil, truncateAddress
    ├── health.ts            # calcTotalInterestObligations, checkFundHealth, calcActivePrincipal
    └── networks.ts          # chain IDs, RPC URLs
```

### Styling
- Colors defined as CSS vars in `frontend/src/index.css`
- Figma prototype at `Vietnamese Digital Banking App/src/App.tsx` (inline styles — reference for layout/colors, not architecture)
- React 19 + ethers v6 + Vite 8 + oxlint

### Role-Based Tabs
- `App.tsx` checks `savingCore.owner()` → `role` = `'all'` (no wallet) | `'user'` | `'admin'`
- Admin sees only "Quản trị" tab. Normal users see "Kế hoạch" + "Tiền gửi của tôi". No wallet = all tabs visible.

## Deployment Flow

1. `npx hardhat node` — start local chain
2. `npm run deploy-seed` — deploys MockUSDC → VaultManager → SavingCore, wires `setSavingCore`, sets feeReceiver. Saves to `deployments/localhost.json` + `frontend/src/config/contracts.json`. Then creates 3 plans, funds vault with 100k USDC, mints 10k USDC to deployer, opens 4 demo deposits for user account, and fast-forwards +367 days.

## Gotchas

- `npm test` (root) is a placeholder — use `npx hardhat test`
- `typechain-types/` is gitignored — regenerated on `npx hardhat compile`
- ABI copy runs automatically as a Hardhat compile hook (`scripts/copy-abis.ts`)
- `autoRenewDeposit` has no owner check — anyone (bot) can call. Intentional.
- `payInterest` is `onlySavingCore` — use `impersonateAccount` or direct contract call in tests
- `withdrawVault` is C2-guarded — drains vault via `impersonateAccount` + `payInterest` in tests, not via `withdrawVault`
- No `.env` committed — Hardhat local chain only. `.env` needed only for Sepolia
- `burn` was removed — no longer exists on any contract or frontend

## Key Docs

- `docs/project/assignment.md` — requirements
- `docs/design/business-rules.md` — 21 rules (BR-01 to BR-21)
- `docs/design/system-architecture.md` — full architecture
- `docs/design/contract-api.md` — full API reference
- `docs/reports/manual-local-guide.md` — step-by-step demo walkthrough
