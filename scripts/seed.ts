import { ethers } from "hardhat";
import fs from "fs";

const toUSDC = (n: number) => BigInt(n) * 1_000_000n;

async function main() {
  const artifact = JSON.parse(fs.readFileSync("deployments/localhost.json", "utf8"));
  const [deployer] = await ethers.getSigners();
  console.log("Seeding with account:", deployer.address);

  const usdc = await ethers.getContractAt("MockUSDC", artifact.MockUSDC);
  const vaultManager = await ethers.getContractAt("VaultManager", artifact.VaultManager);
  const savingCore = await ethers.getContractAt("SavingCore", artifact.SavingCore);

  // 1. Create 3 saving plans
  const plans = [
    { tenor: 90, apr: 400, min: 100, max: 50_000, penalty: 450 },
    { tenor: 180, apr: 400, min: 100, max: 50_000, penalty: 450 },
    { tenor: 365, apr: 600, min: 500, max: 100_000, penalty: 450 },
  ];

  for (const p of plans) {
    const tx = await savingCore.createPlan(
      p.tenor,
      p.apr,
      toUSDC(p.min),
      toUSDC(p.max),
      p.penalty
    );
    await tx.wait();
    console.log(`Plan created: ${p.tenor}d, APR ${p.apr / 100}%, min ${p.min} USDC, max ${p.max} USDC`);
  }

  // 2. Mint 100,000 USDC to deployer (for vault funding)
  await (await usdc.mint(deployer.address, toUSDC(100_000))).wait();
  console.log("Minted 100,000 USDC to deployer");

  // 3. Approve VaultManager to spend deployer's USDC
  await (await usdc.approve(vaultManager.target, toUSDC(100_000))).wait();
  console.log("Approved VaultManager for 100,000 USDC");

  // 4. Fund vault
  await (await vaultManager.fundVault(toUSDC(100_000))).wait();
  console.log("Vault funded with 100,000 USDC");

  // 5. Mint extra 10,000 USDC to deployer (for frontend demo deposits)
  await (await usdc.mint(deployer.address, toUSDC(10_000))).wait();
  console.log("Minted 10,000 USDC to deployer (demo wallet)");

  // Summary
  const vaultBal = await vaultManager.vaultBalance();
  const deployerBal = await usdc.balanceOf(deployer.address);
  console.log("\n--- Seed Summary ---");
  console.log(`Plans created: ${await savingCore.nextPlanId()}`);
  console.log(`Vault balance: ${vaultBal / 1_000_000n} USDC`);
  console.log(`Deployer USDC balance: ${deployerBal / 1_000_000n} USDC`);
  console.log("Seed complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
