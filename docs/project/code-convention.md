# code-convention.md — Solidity Style Guide

> Applies to `MockUSDC.sol`, `SavingCore.sol`, `VaultManager.sol` and every contract in `contracts/`.

## 1. Solidity version & tooling

- Solidity `0.8.28`, uses `hardhat-toolbox` (TypeScript), do not use `unchecked` unless there is a comment clearly explaining the reason + proof that overflow is impossible.
- Compilation must be clean, no warnings.

## 2. Errors

- Always use **custom errors**, never use `require(cond, "string")`.
- Define all errors centrally in `Errors.sol`, do not scatter them across individual contracts.
- Name format: `ContractName_Reason`, e.g.:
```solidity
  error SavingCore_PlanNotEnabled();
  error SavingCore_AmountBelowMin();
  error VaultManager_InsufficientForObligations();
```
- If debug data is needed, add parameters to the error: `error SavingCore_AmountTooLow(uint256 sent, uint256 min);`

## 3. Events

- Emit an event for **every state-changing operation that matters** (open/close deposit, admin action, vault fund/withdraw) — even if not required by the spec, count it as "code quality".
- Define events in `Events.sol` (library or interface), do not scatter them in contract logic.
- Use past-tense names: `DepositOpened`, `VaultFunded`, `PlanDisabled` — do not use present tense (`OpenDeposit`).
- Index parameters used for filtering/lookup (user address, depositId, planId).

## 4. NatSpec

- Full `@notice`, `@param`, `@return` required on **every public/external function**, including simple getters.
- Interfaces (`ISavingCore.sol`, `IVaultManager.sol`) write NatSpec first; implementation bodies only need `@inheritdoc`.
- Comments explain **reasoning**, do not repeat variable names. Good example:
```solidity
  /// @notice Multiply before divide to avoid rounding to zero with small amounts
```
  Bad example: `// calculate interest` (adds no explanation).

## 5. Function ordering & visibility

Within a contract, follow this order: constructor → external → public → internal → private. Within each group: state-changing before view/pure.

- Always declare visibility explicitly, never leave it as default.
- Prefer `external` over `public` if the function is not called internally.

## 6. State variables

- Use `immutable`/`constant` for values that do not change after deployment (USDC address, seconds-per-year, etc.).
- Struct field names must be clear and meaningful, avoid obscure abbreviations (`aprBpsAtOpen` not `aBps`).
- Mapping names follow `keyToValue` pattern: `pendingInterest[depositId]`, not `interestMap`.

## 7. Modifier & guard pattern

- `nonReentrant` must be the **outermost** modifier in the list (runs before `onlyOwner`, custom checks).
- Checks-Effects-Interactions mandatory: update state (set status = Withdrawn) **before** calling `transfer`/`transferFrom` externally.
- Use `SafeERC20` (`safeTransfer`, `safeTransferFrom`) for all token operations, never call `transfer` directly on `IERC20`.

## 8. Boundary & rounding (aligned with Design Questions)

- Boundary at `maturityAt`: use `>=` consistently across the entire codebase (Design Q5) — do not mix in `>` elsewhere.
- Interest formulas: always **multiply before divide** (Design Q4), add a clear comment at each calculation point.
- APR/penalty snapshot at deposit open time (`aprBpsAtOpen`, `penaltyBpsAtOpen`) — never re-read current plan values after the deposit has been opened.

## 9. Centralized formulas

- All interest/penalty formulas go in `InterestLib.sol`, do not duplicate calculation logic in `SavingCore.sol`.
- Functions in `InterestLib` must be `pure`, no storage reads.

## 10. General naming

- Contract, struct, enum: `PascalCase`.
- Function, variable, mapping: `camelCase`.
- Event: `PascalCase`, custom error: `PascalCase` with contract prefix.
- Test files match contract name: `SavingCore.sol` → `SavingCore.test.ts`.

## 11. Explicit exclusions

- Do not optimize gas early if it reduces logic clarity — priority: simple → correct business rule → easy to test → then optimize gas.
- Do not use `AccessControl` (only one Owner role) — keep `Ownable2Step`.
- Do not deploy to a real testnet, no need to verify on Etherscan.
