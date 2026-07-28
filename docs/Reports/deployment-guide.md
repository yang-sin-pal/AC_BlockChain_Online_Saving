# Deployment Guide — Local Development

> For localhost demo on Hardhat node (chainId 31337).

---

## Prerequisites

```bash
npm install          # install all dependencies (from project root)
npx hardhat compile  # generate typechain-types (if not already done)
```

## Start Local Blockchain

```bash
npx hardhat node
```

Node starts at `http://127.0.0.1:8545`. Keeps running in foreground.

## Deploy Contracts

In a **new terminal** (node must be running):

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Deploys in order:
1. MockUSDC → 2. VaultManager(usdc) → 3. SavingCore(usdc, vaultManager)
4. Wires VaultManager.setSavingCore(SavingCore) — one-time call
5. Sets fee receiver to deployer
6. Saves artifact to `deployments/localhost.json`

## Seed Demo Data

After deploy completes:

```bash
npx hardhat run scripts/seed.ts --network localhost
```

Creates:
- 3 saving plans (90d/4%, 180d/4%, 365d/6%)
- 100,000 USDC funded into vault (interest pool)
- 10,000 USDC in deployer wallet (for demo deposits)

## Contract Addresses (deterministic)

On a fresh `npx hardhat node`, these are always the same:

| Contract | Address |
|----------|---------|
| MockUSDC | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| VaultManager | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| SavingCore | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |

Addresses reset to these values every time you restart `npx hardhat node` and re-deploy.

## Reset / Re-deploy

```bash
# 1. Stop hardhat node (Ctrl+C)
# 2. Restart
npx hardhat node

# 3. Re-deploy + seed
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/seed.ts --network localhost
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED 127.0.0.1:8545` | Hardhat node not running — start it first |
| `EADDRINUSE: port 8545` | Another process using port — stop it or use different port |
| Seed fails with `CALL_REVERT` | Deploy not run yet or artifact missing — re-run deploy first |
| Stale data after restart | Node resets state on restart — re-run deploy + seed |
