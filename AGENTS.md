# AGENTS.md

## Project Status

**Solidity complete — frontend in progress.** Deadline: 29/7/2026.

| Task | Status |
|------|--------|
| 1. Deployment infrastructure | Done |
| 2. Frontend scaffold | Done |
| 3. Core utilities | Done |
| 4. Layout + header | Done |
| 5. PlansTab | Done |
| 6. DepositsTab | Done |
| 7. AdminTab (incl. 7f Audit log) | Done |
| 8. Polish + demo | Done |
| 9. Report writing | Done |

## Commands

```bash
# Hardhat (from project root)
npx hardhat compile
npx hardhat test                        # 160 passing — NOT npm test (placeholder)
npx hardhat node                        # start local blockchain
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/seed.ts --network localhost

# Frontend (from frontend/)
cd frontend && npm run dev              # dev server on port 3000
cd frontend && npm run build            # tsc + vite build
cd frontend && npm run lint             # oxlint
```

**`npm test` (root)** is a placeholder. Always use `npx hardhat test`.

## Architecture

```
User → approve(MockUSDC) → SavingCore.transferFrom() → SavingCore → VaultManager.transfer()
```

- **SavingCore** holds user principal, owns all business logic, mints ERC721 certificates per deposit
- **VaultManager** holds bank's interest pool (funded by admin), pays interest on SavingCore's request
- Fund separation is the core architectural rule — mixing principal and interest pools is a design error

### Dual-Pause Architecture

| Pause | Blocks | Does NOT block |
|-------|--------|----------------|
| **SavingCore.paused** | `withdrawAtMaturity`, `claimInterest`, `renewDeposit`, `autoRenewDeposit` | `claimPrincipal`, `earlyWithdraw`, `openDeposit` |
| **VaultManager.paused** | `withdrawVault`, `payInterest` | `fundVault`, `setFeeReceiver`, `setSavingCore` |

### C1 — Principal Protection

`claimPrincipal(depositId)` pays principal immediately from SavingCore, stores interest in `pendingInterest[depositId]`. User later calls `claimInterest(depositId)` to claim from vault. Supports partial vault payment. `interestClaimed` stays false until full amount received.

## Personal Variant (Student ID ending in 38)

| Parameter | Value |
|-----------|-------|
| Grace Period | 4 days |
| Default APR | 400 bps (4.00%) |
| Early Withdrawal Penalty | 450 bps (4.50%) |
| Default Tenor | 180 days |

## Frontend

### File Structure

```
frontend/src/
├── abi/                    # ABI-only JSON (from Hardhat artifacts)
│   ├── SavingCore.json     # 92 entries
│   ├── VaultManager.json   # 36 entries
│   └── MockUSDC.json       # 19 entries
├── config/
│   └── contracts.json      # Contract addresses (from deployments/localhost.json)
├── App.tsx                 # Root component (to be split into tabs)
├── App.css                 # Global styles (to be populated)
└── index.css               # Reset styles (to be populated)
```

**Planned structure** (from `docs/reports/frontend-development-plan-v2.md` §2.2):
```
src/
├── hooks/
│   ├── useWallet.ts        # MetaMask connection state
│   └── useContracts.ts     # Contract instances with signer/provider
├── components/
│   ├── Layout.tsx          # Sidebar + header wrapper
│   ├── ConnectWallet.tsx   # Wallet connect button + balance + network
│   ├── PlansTab.tsx        # Plan cards + open deposit form (§5.1)
│   ├── DepositsTab.tsx     # Deposit list + action buttons (§5.2)
│   └── AdminTab.tsx        # Admin dashboard (§5.3)
└── utils/
    ├── format.ts           # formatUSDC, parseUSDC, formatDate, timeUntil
    ├── health.ts           # calcTotalInterestObligations, checkFundHealth
    └── networks.ts         # Chain IDs, RPC URLs, network names
```

### Styling Reference

**`Vietnamese Digital Banking App/src/App.tsx`** is the Figma-exported UI prototype. Use it as the styling reference:

- **Copy inline styles** — colors, spacing, border-radius, shadows all match the palette
- **Component structure** — `ScreenPlans`, `ScreenDeposits`, `ScreenAdmin` map to our tab components
- **TypeScript types** — `Screen`, `DepositStatus` are defined and reusable
- **Mock data shape** — `PLANS[]`, `DEPOSITS[]`, `ADMIN_RECENT[]` show expected data structures
- **CSS variables** in `Vietnamese Digital Banking App/src/index.css` match our palette

**Color palette** (from §4.1):
| Role | Hex | Use |
|------|-----|-----|
| Primary | `#D4A017` | Header, sidebar, buttons |
| Accent | `#F5C242` | Hover, active tab, badges |
| Success | `#16A34A` | Active status, balance |
| Danger | `#DC2626` | Errors, early withdraw |
| Text | `#1F1F1F` | Primary text |
| Text secondary | `#6B7280` | Labels, descriptions |
| Background | `#F9F9F7` | Body |
| Card | `#FFFFFF` | Cards, inputs |
| Border | `#ECE8E1` | Cards, inputs |
| Gold text | `#8A6A00` | Text on gold backgrounds |

**Header:** Solid `#1F1F1F` — no gradient.

### Contract Integration

- ABIs: `frontend/src/abi/*.json` — extracted from `artifacts/contracts/`
- Addresses: `frontend/src/config/contracts.json` — copied from `deployments/localhost.json`
- Deployment addresses are **deterministic** — same addresses on every fresh `npx hardhat node` restart
- Use `ethers@6` (already installed)

### Component Mapping

| Component | Plan Section | Key Features |
|-----------|-------------|--------------|
| `PlansTab.tsx` | §5.1 | 3 plan cards, deposit form, approve + open deposit flow |
| `DepositsTab.tsx` | §5.2 | Filter pills, deposit cards, action buttons per status, C1 flow |
| `AdminTab.tsx` | §5.3 | Stat cards, fund health warning, vault actions, plan table, audit log |
| `ConnectWallet.tsx` | §4.3 | MetaMask connect, address display, USDC balance, network badge |
| `Layout.tsx` | §4.3 | Sidebar (240px), header (solid #1F1F1F), content area (#F9F9F7) |

## Key Conventions

- **Solidity 0.8.28**, `hardhat-toolbox` (TypeScript), EVM target `cancun`
- **Custom errors** only — no `require(cond, "string")`. All in `Errors.sol`, named `ContractName_Reason`
- **Events** in past tense (`DepositOpened`), defined in `Events.sol`
- **SafeERC20** — always use `safeTransfer`/`safeTransferFrom`
- **Interest formulas** in `InterestLib.sol` (`pure` functions). **Multiply before divide**
- **Boundary at `maturityAt`**: use `>=` consistently
- **APR/penalty snapshot** at deposit open time — never re-read plan values after deposit is opened

Full conventions: `docs/project/code-convention.md`

## Gotchas

- `npm test` (root) is a placeholder — use `npx hardhat test`
- No `.env` committed — Hardhat local chain only. `.env` needed only for Sepolia
- `typechain-types/` is gitignored — regenerate with `npx hardhat compile`
- OZ v5: `Ownable2Step` constructor requires `Ownable(msg.sender)`
- Deployment addresses are deterministic — same on every fresh node restart
- `autoRenewDeposit` has no owner check — anyone (bot) can call it. Intentional.
- C1 `claimInterest` has two paths: **Path A** (Active — vault pays) and **Path B** (PrincipalClaimed — pays from `pendingInterest`)
- VaultManager's `payInterest` is `onlySavingCore` — use `impersonateAccount` in tests

- Figma prototype (`Vietnamese Digital Banking App/`) uses inline styles, not CSS classes — reference for styling, not architecture
- Frontend uses `oxlint` for linting, not eslint

## Docs

Key reference docs:
- `docs/project/assignment.md` — requirements
- `docs/project/code-convention.md` — coding standards
- `docs/design/business-rules.md` — 21 rules (BR-01 to BR-21)
- `docs/design/system-architecture.md` — full architecture
- `docs/reports/frontend-development-plan-v2.md` — frontend plan with UI/UX design (§4), component details (§5), transaction flows (§7)
- `Vietnamese Digital Banking App/src/App.tsx` — Figma UI prototype (styling reference)
