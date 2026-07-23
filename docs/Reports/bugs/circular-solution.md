# Circular Dependency Solution: Vault-First Deployment

> Status: **Decided** — supersedes Options A/B/C in earlier analysis
> Applies to: `SavingCore.sol`, `VaultManager.sol`

---

## Core Idea

`SavingCore` and `VaultManager` reference each other, but the relationship is not actually symmetric:

- `SavingCore` **needs to use** `VaultManager` — it calls `payInterest()` on every withdrawal/renewal. This is a *structural* dependency: `SavingCore` cannot function without knowing the vault.
- `VaultManager` **needs to know who's allowed to call it** — the `onlySavingCore` check on `payInterest()`. This is not structural, it's a *permission*. `VaultManager` can exist, hold funds, and be paused/funded with no `SavingCore` at all.

Real-world framing: a savings plan without a vault is meaningless — there's nothing to hold or pay out interest. A vault without a savings plan is just a vault; it's still a complete, functioning thing on its own. The vault is foundational. The plan is built on top of it.

So there is no true cycle — only one contract (`VaultManager`) was made to look like it has a hard dependency on the other, when really it just needs a permission slip it can be handed *after* it already exists.

**Resulting order:**

1. Deploy `VaultManager` — fully real, no placeholder address, no `address(0)`.
2. Deploy `SavingCore(usdc, vaultManagerAddress)` — real `VaultManager` address, stored `immutable`.
3. Call `VaultManager.setSavingCore(savingCoreAddress)` once — the one-time permission slip.

This is the **same sequence in tests and production** — no impersonation hacks, no dummy addresses anywhere.

---

## Why Not A / B / C

| Option | Problem |
|---|---|
| **A (both immutable, `address(0)` placeholder)** | `VaultManager.savingCore` is permanently `address(0)` in production. `payInterest()` becomes uncallable outside of test impersonation — three of five required user flows (`withdrawAtMaturity`, `renewDeposit`, `autoRenewDeposit`) would revert on interest payout in a real deployment. Not a documentation footnote — a functional break. |
| **B (setter on `SavingCore` side)** | Works, but picks the wrong side to make mutable. `SavingCore` is the dependent contract — making *its* vault reference mutable is backwards from which side actually needs the flexibility. |
| **C (deployer contract / CREATE2)** | Solves a harder problem than the one that exists. A factory alone doesn't fix anything unless one side still uses a setter, or you add full CREATE2 address prediction — real complexity with no rubric or correctness benefit here. |

---

## Detailed Design

### `VaultManager.sol`

Remove:
```solidity
address public immutable savingCore;
constructor(address _usdc, address _savingCore) { ... }
```

Add:
```solidity
address public savingCore; // NOT immutable — set once, post-deployment

function setSavingCore(address _savingCore) external onlyOwner {
    if (savingCore != address(0)) revert VaultManager_SavingCoreAlreadySet();
    savingCore = _savingCore;
}
```

`onlySavingCore` modifier logic is unchanged — it still checks `msg.sender == savingCore`, just against a mutable-but-locked-after-first-set variable instead of an immutable one.

### `SavingCore.sol`

No change from the original plan. Constructor still takes `_vaultManager` and stores it `immutable` — this side was never the problem:

```solidity
constructor(address _usdc, address _vaultManager)
    ERC721("Term Deposit Certificate", "TDC")
    Ownable(msg.sender)
{
    usdc = IERC20(_usdc);
    vaultManager = IVaultManager(_vaultManager); // real address, always known at construction
}
```

### `Errors.sol`

Add:
```solidity
error VaultManager_SavingCoreAlreadySet();
```

### `IVaultManager.sol`

Add `setSavingCore(address)` to the interface for consistency with the implementation.

---

## Deployment Sequence (Tests & Production — Identical)

```typescript
// 1. Vault first — no placeholders
const vaultManager = await ethers.getContractFactory("VaultManager")
  .then((f) => f.deploy(await usdc.getAddress()));

// 2. SavingCore built on top of the real vault
const savingCore = await ethers.getContractFactory("SavingCore")
  .then((f) => f.deploy(await usdc.getAddress(), await vaultManager.getAddress()));

// 3. One-time permission slip
await vaultManager.setSavingCore(await savingCore.getAddress());
```

### Test Impact

`VaultManager.test.ts` test #16 impersonates the **real** `SavingCore` address directly — no `address(0)` workaround needed:

```typescript
const savingCoreAddr = await savingCore.getAddress();
await impersonateAccount(savingCoreAddr);
const savingCoreSigner = await ethers.getSigner(savingCoreAddr);
```

This is a strict simplification over the original plan — the test now exercises the exact same authorization path production will use.

---

## Files Affected

| File | Change |
|---|---|
| `contracts/core/VaultManager.sol` | Remove `immutable savingCore` + its constructor param; add mutable `savingCore` + `setSavingCore()` with one-time-set guard |
| `contracts/core/SavingCore.sol` | No change from original plan |
| `contracts/interfaces/IVaultManager.sol` | Add `setSavingCore(address)` to interface |
| `contracts/libraries/Errors.sol` | Add `VaultManager_SavingCoreAlreadySet` |
| `test/helpers/fixtures.ts` | Deploy `VaultManager` first (no placeholder) → deploy `SavingCore` with real address → call `setSavingCore` |
| `test/core/VaultManager.test.ts` | Test #16 impersonates the real `SavingCore` address; delete `address(0)` impersonation workaround |

---

## Verification Checklist

- [ ] `VaultManager` deploys with zero knowledge of `SavingCore`
- [ ] `SavingCore` deploys with a real, `immutable` `VaultManager` reference
- [ ] `setSavingCore` is `onlyOwner` and reverts on second call
- [ ] Test #16 impersonates the real `SavingCore` address, not `address(0)`
- [ ] Deployment script order matches test fixture order exactly