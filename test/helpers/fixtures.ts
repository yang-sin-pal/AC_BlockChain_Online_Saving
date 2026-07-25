import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { toUSDC } from "./utils";
import { DEFAULT_TENOR, DEFAULT_APR, PENALTY } from "./constants";

export async function deployAllContracts() {
  const [owner, user] = await ethers.getSigners();

  const usdc = await ethers.getContractFactory("MockUSDC").then((f) => f.deploy());

  const vaultManager = await ethers.getContractFactory("VaultManager")
    .then(async (f) => f.deploy(await usdc.getAddress()));

  const savingCore = await ethers.getContractFactory("SavingCore")
    .then(async (f) => f.deploy(await usdc.getAddress(), await vaultManager.getAddress()));

  await vaultManager.setSavingCore(await savingCore.getAddress());

  await usdc.mint(await owner.getAddress(), toUSDC(10_000));
  await usdc.mint(await user.getAddress(), toUSDC(10_000));

  // Fund vault with 10,000 USDC for interest payments
  await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(10_000));
  await vaultManager.connect(owner).fundVault(toUSDC(10_000));

  // Set fee receiver for early withdrawal penalties
  await vaultManager.connect(owner).setFeeReceiver(await owner.getAddress());

  // User approves SavingCore to pull USDC on openDeposit
  // unlimited approval for test convenience only — do not use this pattern in production integrations
  await usdc.connect(user).approve(await savingCore.getAddress(), ethers.MaxUint256);

  return { usdc, savingCore, vaultManager, owner, user };
}

export async function deployAllContractsFixture() {
  return loadFixture(deployAllContracts);
}

/**
 * Minimal VaultManager fixture: deploys MockUSDC, VaultManager, SavingCore,
 * links them, mints to owner+user, but does NOT fund vault or set feeReceiver.
 * Used by VaultManager unit tests that need a clean vault state.
 */
export async function deployVaultManager() {
  const [owner, user] = await ethers.getSigners();

  const usdc = await ethers.getContractFactory("MockUSDC").then((f) => f.deploy());

  const vaultManager = await ethers.getContractFactory("VaultManager")
    .then(async (f) => f.deploy(await usdc.getAddress()));

  const savingCore = await ethers.getContractFactory("SavingCore")
    .then(async (f) => f.deploy(await usdc.getAddress(), await vaultManager.getAddress()));

  await vaultManager.setSavingCore(await savingCore.getAddress());

  await usdc.mint(await owner.getAddress(), toUSDC(10_000));
  await usdc.mint(await user.getAddress(), toUSDC(10_000));

  return { usdc, savingCore, vaultManager, owner, user };
}

/** Creates a default plan (planId 0) and returns the base fixture for convenience. */
export async function fixtureWithPlan() {
  const base = await loadFixture(deployAllContracts);
  const { savingCore, owner } = base;

  await savingCore
    .connect(owner)
    .createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

  return base;
}
