import { ethers } from "hardhat";
import fs from "fs";

const toUSDC = (n: number) => BigInt(n) * 1_000_000n;

function fmtUSDC(amount: bigint): string {
  return `${(Number(amount) / 1_000_000).toLocaleString()} USDC`;
}

async function main() {
  const artifact = JSON.parse(fs.readFileSync("deployments/localhost.json", "utf8"));
  const [deployer] = await ethers.getSigners();
  console.log("Demo seed with account:", deployer.address);

  const savingCore = await ethers.getContractAt("SavingCore", artifact.SavingCore);
  const usdc = await ethers.getContractAt("MockUSDC", artifact.MockUSDC);

  // Verify plans exist (seed.ts must have been run)
  const nextPlanId = await savingCore.nextPlanId();
  if (nextPlanId === 0n) {
    console.error("No plans found. Run 'npx hardhat run scripts/seed.ts --network localhost' first.");
    process.exit(1);
  }
  console.log(`Found ${nextPlanId} plans. Creating demo deposits...`);

  // Prepare USDC for demo deposits
  const depositAmount = toUSDC(1_000);
  const deployerBal = await usdc.balanceOf(deployer.address);
  if (deployerBal < depositAmount) {
    await (await usdc.mint(deployer.address, depositAmount * 2n)).wait();
  }
  await (await usdc.approve(savingCore.target, depositAmount * 10n)).wait();
  console.log(`Approved SavingCore for demo deposits`);

  // --- Deposit #1: Open → autoRenew after grace ---
  console.log("\n--- Deposit #1: 90-day plan, auto-renewed ---");
  const tx1 = await savingCore.openDeposit(0, depositAmount);
  const receipt1 = await tx1.wait();
  console.log(`Opened deposit #1: ${fmtUSDC(depositAmount)}, 90-day plan`);
  const block1 = await ethers.provider.getBlock(receipt1!.blockNumber);
  console.log(`  Maturity: ${new Date(Number(block1!.timestamp + 90 * 86400) * 1000).toISOString()}`);

  // Fast-forward past maturity (90 days) + grace (4 days)
  await ethers.provider.send("evm_increaseTime", [94 * 86400]);
  await ethers.provider.send("evm_mine", []);
  console.log("  Fast-forwarded 94 days → past maturity + grace");

  const txAuto1 = await savingCore.autoRenewDeposit(1n);
  await txAuto1.wait();
  console.log("  ✅ Deposit #1 auto-renewed → Deposit #2");

  const d1 = await savingCore.deposits(1n);
  console.log(`  Old deposit #1 status: ${d1.status} (4 = AutoRenewed)`);
  const d2 = await savingCore.deposits(2n);
  console.log(`  New deposit #2 : ${fmtUSDC(d2.principal)}, status: ${d2.status} (0 = Active)`);

  // --- Deposit #2: autoRenew again → demonstrates compounding ---
  console.log("\n--- Deposit #2: auto-renew again (compounding) ---");

  await ethers.provider.send("evm_increaseTime", [94 * 86400]);
  await ethers.provider.send("evm_mine", []);
  console.log("  Fast-forwarded another 94 days");

  const txAuto2 = await savingCore.autoRenewDeposit(2n);
  await txAuto2.wait();
  console.log("  ✅ Deposit #2 auto-renewed → Deposit #3");

  const d3 = await savingCore.deposits(3n);
  console.log(`  New deposit #3 : ${fmtUSDC(d3.principal)} (compounded principal + interest)`);
  console.log(`  APR locked at: ${d3.aprBpsAtOpen} bps (4.00%)`);

  // --- Deposit #3: User deposit for manual demo ---
  console.log("\n--- Deposit #3: Active deposit for manual demo ---");
  const tx4 = await savingCore.openDeposit(1, toUSDC(500));
  await tx4.wait();
  console.log(`Opened deposit #4: ${fmtUSDC(toUSDC(500))}, 180-day plan (Active)`);

  // Summary
  const nextId = await savingCore.nextDepositId();
  console.log(`\n--- Demo Summary ---`);
  console.log(`Total deposits: ${nextId - 1n}`);
  console.log(`  #1: AutoRenewed (status=4)`);
  console.log(`  #2: AutoRenewed (status=4)`);
  console.log(`  #3: Active (status=0) — compounded principal`);
  console.log(`  #4: Active (status=0) — 500 USDC, 180-day plan (manual demo)`);
  console.log(`\nOpen frontend → DepositsTab to see AutoRenewed badges!`);
  console.log("Demo seed complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
