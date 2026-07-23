import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { toUSDC } from "./utils";

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
