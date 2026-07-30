import { ethers } from "hardhat";
import fs from "fs";

const toUSDC = (n: number) => BigInt(n) * 1_000_000n;

function fmtUSDC(amount: bigint): string {
  return `${(Number(amount) / 1_000_000).toLocaleString()} USDC`;
}

async function main() {
  // ──────────────────────────────────────────────
  // Part A: Deploy contracts
  // ──────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed:", usdcAddress);

  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vaultManager = await VaultManager.deploy(usdcAddress);
  await vaultManager.waitForDeployment();
  const vmAddress = await vaultManager.getAddress();
  console.log("VaultManager deployed:", vmAddress);

  const SavingCore = await ethers.getContractFactory("SavingCore");
  const savingCore = await SavingCore.deploy(usdcAddress, vmAddress);
  await savingCore.waitForDeployment();
  const scAddress = await savingCore.getAddress();
  console.log("SavingCore deployed:", scAddress);

  const txSetSC = await vaultManager.setSavingCore(scAddress);
  await txSetSC.wait();
  console.log("VaultManager.setSavingCore() done");

  const txSetFee = await vaultManager.setFeeReceiver(deployer.address);
  await txSetFee.wait();
  console.log("VaultManager.setFeeReceiver() done");

  const network = await ethers.provider.getNetwork();
  const artifact = {
    network: network.name === "unknown" ? "localhost" : network.name,
    chainId: Number(network.chainId),
    MockUSDC: usdcAddress,
    SavingCore: scAddress,
    VaultManager: vmAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync("deployments", { recursive: true });
  const artifactPath = `deployments/${artifact.network}.json`;
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`Deployment artifact saved to ${artifactPath}`);

  const frontendPath = "frontend/src/config/contracts.json";
  fs.mkdirSync("frontend/src/config", { recursive: true });
  fs.writeFileSync(frontendPath, JSON.stringify(artifact, null, 2));
  console.log(`Frontend config synced to ${frontendPath}`);

  console.log(JSON.stringify(artifact, null, 2));

  // ──────────────────────────────────────────────
  // Part B: Seed — plans, vault funding, demo deposits
  // ──────────────────────────────────────────────
  const savedArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const user = (await ethers.getSigners())[1];

  const usdcContract = await ethers.getContractAt("MockUSDC", savedArtifact.MockUSDC);
  const vmContract = await ethers.getContractAt("VaultManager", savedArtifact.VaultManager);
  const savingCoreContract = await ethers.getContractAt("SavingCore", savedArtifact.SavingCore);

  console.log("\nSeeding with account:", deployer.address);

  const plans = [
    { tenor: 90, apr: 400, min: 100, max: 50_000, penalty: 450 },
    { tenor: 180, apr: 400, min: 100, max: 50_000, penalty: 450 },
    { tenor: 365, apr: 600, min: 500, max: 100_000, penalty: 450 },
    { tenor: 7, apr: 400, min: 100, max: 50_000, penalty: 450 },
  ];

  for (const p of plans) {
    const tx = await savingCoreContract.createPlan(
      p.tenor,
      p.apr,
      toUSDC(p.min),
      toUSDC(p.max),
      p.penalty
    );
    await tx.wait();
    console.log(`Plan created: ${p.tenor}d, APR ${p.apr / 100}%, min ${p.min} USDC, max ${p.max} USDC`);
  }

  await (await usdcContract.mint(deployer.address, toUSDC(100_000))).wait();
  console.log("Minted 100,000 USDC to deployer");

  await (await usdcContract.approve(vmContract.target, toUSDC(100_000))).wait();
  console.log("Approved VaultManager for 100,000 USDC");

  await (await vmContract.fundVault(toUSDC(100_000))).wait();
  console.log("Vault funded with 100,000 USDC");

  await (await usdcContract.mint(deployer.address, toUSDC(10_000))).wait();
  console.log("Minted 10,000 USDC to deployer (demo wallet)");

  const vaultBal = await vmContract.vaultBalance();
  const deployerBal = await usdcContract.balanceOf(deployer.address);
  console.log("\n--- Seed Summary (Infra) ---");
  console.log(`Plans created: ${await savingCoreContract.nextPlanId()}`);
  console.log(`Vault balance: ${vaultBal / 1_000_000n} USDC`);
  console.log(`Deployer USDC balance: ${deployerBal / 1_000_000n} USDC`);

  console.log("\n========== Creating Demo Deposits ==========");
  console.log("Demo user:", user.address);

  const userUsdc = usdcContract.connect(user);
  const userSavingCore = savingCoreContract.connect(user);

  const needed = toUSDC(3_500);
  const userBal = await usdcContract.balanceOf(user.address);
  if (userBal < needed) {
    await (await usdcContract.mint(user.address, needed * 2n)).wait();
  }
  await (await userUsdc.approve(savingCoreContract.target, needed * 2n)).wait();
  console.log("Minted and approved USDC for user");

  const block0 = await ethers.provider.getBlock("latest");
  const T0 = Number(block0!.timestamp);

  console.log("\n========== Timeline: T0 = now ==========");

  console.log("\n--- Deposit #0: 365-day, 1000 USDC (within grace at T0+367) ---");
  const tx0 = await userSavingCore.openDeposit(2, toUSDC(1_000));
  await tx0.wait();
  console.log("  #0: T0 — 365d plan → matures at T0+365d; use for withdrawAtMaturity");

  console.log("\n--- Deposit #1: 365-day, 1000 USDC (within grace at T0+367) ---");
  const tx1 = await userSavingCore.openDeposit(2, toUSDC(1_000));
  await tx1.wait();
  console.log("  #1: T0 — 365d plan → matures at T0+365d; use for claimPrincipal→claimInterest");

  console.log("\n--- Deposit #2: 365-day, 500 USDC (within grace at T0+367) ---");
  const tx2 = await userSavingCore.openDeposit(2, toUSDC(500));
  await tx2.wait();
  console.log("  #2: T0 — 365d plan → matures at T0+365d; use for claimInterest directly");

  console.log("\n--- Deposit #3: 90-day, 1000 USDC (past grace at T0+367) ---");
  const tx3 = await userSavingCore.openDeposit(0, toUSDC(1_000));
  await tx3.wait();
  console.log("  #3: T0 — 90d plan → matures at T0+90d; use for autoRenewDeposit");

  // ── Advance to T0+357d, open #4 with 7-day plan ──
  const MID = T0 + 357 * 86400;
  console.log(`\n---------- T0+357d: open deposit #4 (past start demo) ----------`);
  await ethers.provider.send("evm_setNextBlockTimestamp", [MID]);
  await ethers.provider.send("evm_mine", []);

  console.log("\n--- Deposit #4: 7-day, 500 USDC (within grace at T0+367) ---");
  const tx4 = await userSavingCore.openDeposit(3, toUSDC(500));
  await tx4.wait();
  console.log("  #4: T0+357d — 7d plan → matures at T0+364d; use for in-grace demo (past start, grace today)");

  // ── Fast-forward to T0+367d ──
  const END = T0 + 367 * 86400;
  await ethers.provider.send("evm_setNextBlockTimestamp", [END]);
  await ethers.provider.send("evm_mine", []);
  console.log(`\n========== Fast-forwarded to T0+367d ==========`);
  console.log("  #0, #1, #2 (365d): opened 367d ago, matured 2d ago → within 4d grace");
  console.log("  #3          (90d): opened 367d ago, matured 277d ago → past grace");
  console.log("  #4           (7d): opened 10d ago,  matured 3d ago  → within 4d grace (past start)");

  const bal = await usdcContract.balanceOf(user.address);
  console.log(`\n--- Demo Summary ---`);
  console.log(`User USDC balance: ${fmtUSDC(bal)}`);
  const total = await savingCoreContract.nextDepositId();
  for (let i = 0n; i < total; i++) {
    const d = await savingCoreContract.deposits(i);
    const plan = await savingCoreContract.plans(d.planId);
    const openedAgo = Math.round((END - Number(d.startAt)) / 86400);
    const maturedAgo = Math.round((END - Number(d.maturityAt)) / 86400);
    const pastGrace = END >= Number(d.maturityAt) + 4 * 86400;
    const status = pastGrace ? "past grace" : "in grace";
    console.log(`  #${i}: ${fmtUSDC(d.principal)}, ${plan.tenorDays}d, opened ${openedAgo}d ago, matured ${maturedAgo}d ago → ${status}`);
  }
  console.log(`\nSuggested test flow:`);
  console.log(`  1. withdrawAtMaturity(0) — full principal + interest`);
  console.log(`  2. claimPrincipal(1) → claimInterest(1) — C1 path`);
  console.log(`  3. claimInterest(2) — Path A, pays from vault`);
  console.log(`  4. autoRenewDeposit(3) — past grace, auto-renew`);
  console.log(`  5. withdrawAtMaturity(4) or claimPrincipal(4) — short-tenor, in grace`);
  console.log("Deploy + seed complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
