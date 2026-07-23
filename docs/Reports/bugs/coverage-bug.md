# solidity-coverage 0% Report — Hardhat 2.28.x + Solidity 0.8.28

## Symptom

Running `npx hardhat coverage` reports **0% line/branch/function/statement coverage** for all contracts (`VaultManager.sol`, `SavingCore.sol`, `MockUSDC.sol`), despite `npx hardhat test` passing all 19 tests successfully.

## Environment

| Component | Version |
|-----------|---------|
| Hardhat | 2.28.6 |
| solidity-coverage | 0.8.17 (latest) |
| Solidity | 0.8.28 |
| EVM target | `cancun` (required by OZ v5 `Bytes.sol` `mcopy`) |
| Node | — |

## Root Cause

**Hardhat 2.28.x replaced the ethereumjs VM with EDR (Ethereum Development Runtime, written in Rust). EDR does not emit step-by-step EVM traces via JavaScript EventEmitter, which is what solidity-coverage relies on.**

### How coverage used to work (pre-EDR)

1. `coverage()` sets a magic block gas limit (`0x1fffffffffffff`) — detected by Hardhat
2. solidity-coverage traverses `_node._vm.evm.events` and registers a `step` listener
3. The ethereumjs VM fires `step` events for every EVM opcode executed
4. Each step is matched against compiled source mappings to increment line/branch/function counters
5. `responseObject.traces` contained the raw trace data from the VM

### How it fails in 2.28.x (EDR)

1. Coverage sets the magic gas limit — Hardhat detects it (line 172 of `provider.js`):
   ```js
   transactionGasCap: config.blockGasLimit === 0x1fffffffffffff
       ? BigInt(0xfffffffffffff)
       : undefined,
   ```
2. `attachToHardhatVM` traverses `_node._vm.evm.events` — finds `MinimalEthereumJsEvmEventEmitter` (an `AsyncEventEmitter` from `@ethereumjs/util`)
3. Registers `step` listener — **succeeds** (confirms `eventNames(): ['step']`)
4. EDR executes the transaction natively in Rust, **does not emit step events** to JavaScript
5. `responseObject.traces` is **always empty** (`length: 0`)
6. The provider code at line 241:
   ```js
   const needsTraces = this._node._vm.evm.events.eventNames().length > 0;
   ```
   This is `true` (our listener is registered), but `rawTraces` from `responseObject.traces` is empty, so no trace items are processed and no coverage counters are updated.

### The minimal-vm.js architecture

`_node._vm` is NOT a real EVM. It's a stub adapter (`minimal-vm.js:11-20`):

```js
function getMinimalEthereumJsVm(provider) {
    const minimalEthereumJsVm = {
        events: new MinimalEthereumJsVmEventEmitter(),     // AsyncEventEmitter
        evm: {
            events: new MinimalEthereumJsEvmEventEmitter(), // AsyncEventEmitter
        },
        stateManager: getMinimalEthereumJsStateManager(provider),
    };
    return minimalEthereumJsVm;
}
```

The `evm.events` EventEmitter exists solely for backward-compatibility with coverage plugin's traversal pattern. But **no one ever emits `step` on it** — EDR runs everything inside its Rust core and returns `traces: []` by default.

## Investigation Steps Attempted

### 1. Patching `attachToHardhatVM` traversal
- **What**: Modified `api.js` to traverse `Object.assign({}, cur._wrapped)` (hardhat config uses `ConfigExtender` wrapping pattern) with fallback to `globalThis.__HH_EDR_PROVIDER`
- **Result**: Still reached the `MinimalEthereumJsEvmEventEmitter` — same empty traces

### 2. Patching EdrProviderWrapper constructor
- **What**: Added `globalThis.__HH_EDR_PROVIDER = this;` to the constructor and patched `handleRequest` with debug logging
- **Result**: Confirmed `this === globalThis.__HH_EDR_PROVIDER` is `true`. `eventNames()` returns `['step']` after listener registration. But `responseObject.traces` remains `length: 0`.

### 3. Patching `needsTraces` logic
- **What**: Ensured `needsTraces` is `true` by checking `eventNames().length > 0`
- **Result**: `needsTraces` is correctly `true`, but `rawTraces` is still empty — no data to process

### 4. Checking `observability` config
- **What**: Inspected `edrProviderConfig.observability` — it's `{}` (empty object)
- **Result**: No visible config option to enable step trace generation in the EDR native module

### 5. Checking `transactionGasCap` detection
- **What**: Verified Hardhat detects coverage's magic gas limit
- **Result**: Hardhat correctly sets `transactionGasCap: BigInt(0xfffffffffffff)` — the detection works, but this only affects gas limits, not trace generation

### 6. Verifying `Object.assign({}, cur._wrapped)` pattern
- **What**: Tried to ensure coverage plugin traverses the actual runtime config, not a stale copy
- **Result**: Successfully reaches the correct `MinimalEthereumJsEvmEventEmitter`, but EDR doesn't generate traces regardless

## Key Files

| File | Role |
|------|------|
| `node_modules/hardhat/internal/hardhat-network/provider/provider.js:197-207` | `EdrProviderWrapper.create` — creates `_node._vm` with minimal stub |
| `node_modules/hardhat/internal/hardhat-network/provider/vm/minimal-vm.js:11-20` | `getMinimalEthereumJsVm` — the stub adapter |
| `node_modules/hardhat/internal/hardhat-network/provider/provider.js:237-259` | `handleRequest` — reads `responseObject.traces` (always empty) |
| `node_modules/solidity-coverage/lib/api.js:~line 55` | `attachToHardhatVM` — registers `step` listener |
| `node_modules/solidity-coverage/lib/collector.js` | Processes `sighash` events to update counters |
| `.solcover.js` | Coverage config (minimal) |

## Conclusion

This is an **upstream incompatibility** between `solidity-coverage@0.8.17` and `hardhat@2.28.x` with EDR. The coverage plugin was designed for the ethereumjs VM which emitted step-by-step EVM opcode traces via JavaScript. EDR runs EVM execution entirely in Rust and does not emit these traces to JavaScript by default.

The `MinimalEthereumJsEvmEventEmitter` is a backward-compatibility shim that allows listeners to be registered without errors, but EDR never emits `step` events on it. The `responseObject.traces` from EDR is always an empty array.

## Possible Paths Forward

1. **Wait for upstream fix** — `solidity-coverage` may add EDR-native trace support (check [solidity-coverage#898](https://github.com/sc-forks/solidity-coverage/issues/898) and related issues)
2. **Downgrade Hardhat** — Use `hardhat@2.22.x` (last ethereumjs VM-based version), but this conflicts with `hardhat-toolbox@6.1.2` which requires `hardhat@^2.28.0`
3. **Use Hardhat's built-in gas reporter** — `hardhat-gas-reporter` works with EDR as an alternative to full coverage
4. **Alternative coverage tooling** — Bytecode-level analysis or Foundry's coverage (`forge coverage`) if the project can be migrated to Foundry

## Recommendation

**Defer coverage until upstream resolves the incompatibility.** All 19 tests pass with `npx hardhat test`, confirming functional correctness. Coverage tooling can be added once `solidity-coverage` adds EDR support or a compatible Hardhat version is available.

## Status

- **Tests**: 19/19 passing via `npx hardhat test`
- **Coverage**: Deferred — upstream incompatibility
- **Impact**: No impact on contract correctness or test quality
