import { ethers } from "hardhat";
import fs from "fs";

const toUSDC = (n: number) => BigInt(n) * 1_000_000n;

function fmtUSDC(amount: bigint): string {
  return `${(Number(amount) / 1_000_000).toLocaleString()} USDC`;
}

async function main() {
  const artifact = JSON.parse(fs.readFileSync("deployments/localhost.json", "utf8"));
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const user = signers[1];
  console.log("Demo seed — deposits created for user:", user.address);

  const savingCore = await ethers.getContractAt("SavingCore", artifact.SavingCore);
  const usdc = await ethers.getContractAt("MockUSDC", artifact.MockUSDC);

  const userUsdc = usdc.connect(user);
  const userSavingCore = savingCore.connect(user);

  // Verify plans exist (seed.ts must have been run)
  const nextPlanId = await savingCore.nextPlanId();
  if (nextPlanId === 0n) {
    console.error("No plans found. Run 'npx hardhat run scripts/seed.ts --network localhost' first.");
    process.exit(1);
  }
  console.log(`Found ${nextPlanId} plans. Creating demo deposits...`);

  // Plans created by seed.ts:
  //   0: 90d,  400 bps, min 100, max 50_000
  //   1: 180d, 400 bps, min 100, max 50_000
  //   2: 365d, 600 bps, min 500, max 100_000

  // Mint USDC to user for deposits
  const needed = toUSDC(3_500);
  const userBal = await usdc.balanceOf(user.address);
  if (userBal < needed) {
    await (await usdc.mint(user.address, needed * 2n)).wait();
  }
  await (await userUsdc.approve(savingCore.target, needed * 2n)).wait();
  console.log(`Minted and approved USDC for user`);

  const block0 = await ethers.provider.getBlock("latest");

  // --- Deposit #0: 365d plan, 1000 USDC → for withdrawAtMaturity ---
  console.log("\n--- Deposit #0: 365-day, 1000 USDC (within grace) ---");
  const tx0 = await userSavingCore.openDeposit(2, toUSDC(1_000));
  await tx0.wait();
  console.log("  Opened deposit #0 — use for withdrawAtMaturity");

  // --- Deposit #1: 365d plan, 1000 USDC → for claimPrincipal + claimInterest ---
  console.log("\n--- Deposit #1: 365-day, 1000 USDC (within grace) ---");
  const tx1 = await userSavingCore.openDeposit(2, toUSDC(1_000));
  await tx1.wait();
  console.log("  Opened deposit #1 — use for claimPrincipal → claimInterest");

  // --- Deposit #2: 365d plan, 500 USDC → for claimInterest (Path A) ---
  console.log("\n--- Deposit #2: 365-day, 500 USDC (within grace) ---");
  const tx2 = await userSavingCore.openDeposit(2, toUSDC(500));
  await tx2.wait();
  console.log("  Opened deposit #2 — use for claimInterest directly");

  // --- Deposit #3: 90d plan, 1000 USDC → for autoRenewDeposit ---
  console.log("\n--- Deposit #3: 90-day, 1000 USDC (past grace) ---");
  const tx3 = await userSavingCore.openDeposit(0, toUSDC(1_000));
  await tx3.wait();
  console.log("  Opened deposit #3 — use for autoRenewDeposit");

  // Fast-forward past ALL maturities + 2 extra days
  //   #0 matures at block0.timestamp + 365 days
  //   #1, #2 same
  //   #3 matures at block0.timestamp + 90 days
  //
  // Target: block0.timestamp + 365 days + 2 days = block0.timestamp + 367 days
  // At that point:
  //   #0, #1, #2: 2 days past maturity → within grace
  //   #3: 277 days past maturity → past grace
  const targetTime = Number(block0!.timestamp) + 367 * 86400;
  await ethers.provider.send("evm_setNextBlockTimestamp", [targetTime]);
  await ethers.provider.send("evm_mine", []);
  console.log(`\nFast-forwarded to T0 + 367 days (all deposits matured)`);
  console.log("  #0, #1, #2: 2 days past maturity → within grace");
  console.log("  #3: 277 days past maturity → past grace");

  // Summary
  const bal = await usdc.balanceOf(user.address);
  console.log(`\n--- Demo Summary ---`);
  console.log(`User USDC balance: ${fmtUSDC(bal)}`);
  for (let i = 0n; i < 4n; i++) {
    const d = await savingCore.deposits(i);
    const plan = await savingCore.plans(d.planId);
    const now = targetTime;
    const matured = now >= Number(d.maturityAt);
    const graceEnd = Number(d.maturityAt) + 4 * 86400;
    const pastGrace = now >= graceEnd;
    console.log(`  #${i}: ${fmtUSDC(d.principal)}, ${plan.tenorDays}d plan` +
      `, matured=${matured}, pastGrace=${pastGrace}`);
  }
  console.log(`\nSuggested test flow:`);
  console.log(`  1. withdrawAtMaturity(0) — full principal + interest`);
  console.log(`  2. claimPrincipal(1) → claimInterest(1) — C1 path`);
  console.log(`  3. claimInterest(2) — Path A, pays from vault`);
  console.log(`  4. autoRenewDeposit(3) — past grace, auto-renew`);
  console.log("Demo seed complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
