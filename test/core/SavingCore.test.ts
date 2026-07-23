import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { deployAllContractsFixture } from "../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  PENALTY,
  SECONDS_PER_DAY,
} from "../helpers/constants";

/** Creates a default plan (planId 0) and returns it for convenience. */
async function fixtureWithPlan() {
  const base = await loadFixture(deployAllContractsFixture);
  const { savingCore, owner } = base;

  await savingCore
    .connect(owner)
    .createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

  return base;
}

describe("SavingCore — openDeposit", function () {
  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: deposit created, NFT minted, tokens transferred", async function () {
    const { savingCore, usdc, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(1_000);

    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();

    // NFT minted to user
    expect(await savingCore.ownerOf(0)).to.equal(await user.getAddress());

    // Deposit stored correctly
    const deposit = await savingCore.deposits(0);
    expect(deposit.planId).to.equal(0);
    expect(deposit.principal).to.equal(amount);
    expect(deposit.status).to.equal(0); // Status.Active

    // Tokens moved from user → SavingCore (not VaultManager)
    expect(await usdc.balanceOf(await savingCore.getAddress())).to.equal(amount);
  });

  // ─── 2. DepositOpened event ───────────────────────────────────

  it("#2 — emits DepositOpened with correct args", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(500);

    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();

    // Parse the DepositOpened event from the receipt
    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "DepositOpened");

    expect(event).to.not.be.null;
    expect(event!.args.depositId).to.equal(0);
    expect(event!.args.owner).to.equal(await user.getAddress());
    expect(event!.args.planId).to.equal(0);
    expect(event!.args.principal).to.equal(amount);
    expect(event!.args.aprBpsAtOpen).to.equal(DEFAULT_APR);

    // maturityAt: verify it matches expected formula
    const deposit = await savingCore.deposits(0);
    expect(event!.args.maturityAt).to.equal(deposit.maturityAt);
  });

  // ─── 3. APR snapshot immutability ─────────────────────────────

  it("#3 — APR snapshot: updatePlan after open does not change deposit's aprBpsAtOpen", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);

    // Open deposit with 400 bps APR
    await savingCore.connect(user).openDeposit(0, toUSDC(1_000));

    // Update plan APR to 800 bps
    await savingCore.connect(owner).updatePlan(0, 800);

    // Deposit's snapshot should still be 400
    const deposit = await savingCore.deposits(0);
    expect(deposit.aprBpsAtOpen).to.equal(DEFAULT_APR);
    expect(deposit.penaltyBpsAtOpen).to.equal(PENALTY);
  });

  // ─── 4. Disabled plan reverts ─────────────────────────────────

  it("#4 — disabled plan → reverts PlanNotEnabled", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).disablePlan(0);

    // GREEN phase: the error will appear in ABI once openDeposit uses it in a revert
    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(1_000)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotEnabled");
  });

  // ─── 5. Amount below minDeposit ───────────────────────────────

  it("#5 — amount below minDeposit → reverts DepositBelowMin", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    // minDeposit is toUSDC(100) from fixtureWithPlan
    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(50)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_DepositBelowMin");
  });

  // ─── 6. Amount above maxDeposit ───────────────────────────────

  it("#6 — amount above maxDeposit → reverts DepositAboveMax", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    // maxDeposit is toUSDC(100_000) from fixtureWithPlan
    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(200_000)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_DepositAboveMax");
  });

  // ─── 7. Zero amount ───────────────────────────────────────────

  it("#7 — zero amount → reverts ZeroAmount", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).openDeposit(0, 0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_ZeroAmount");
  });

  // ─── 8. maturityAt exact value ────────────────────────────────

  it("#8 — maturityAt equals block.timestamp + tenorDays * 86400", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    const tx = await savingCore.connect(user).openDeposit(0, toUSDC(1_000));
    const receipt = await tx.wait();

    // Get the block timestamp of the openDeposit transaction
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const expectedStartAt = block!.timestamp;
    const expectedMaturity = expectedStartAt + DEFAULT_TENOR * SECONDS_PER_DAY;

    const deposit = await savingCore.deposits(0);
    expect(deposit.startAt).to.equal(expectedStartAt);
    expect(deposit.maturityAt).to.equal(expectedMaturity);
  });

  // ─── 9. Multiple deposits increment IDs ───────────────────────

  it("#9 — multiple deposits: nextDepositId increments, each gets unique NFT", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(user).openDeposit(0, toUSDC(1_000));
    await savingCore.connect(user).openDeposit(0, toUSDC(2_000));

    expect(await savingCore.nextDepositId()).to.equal(2);

    // Each NFT owned by user
    expect(await savingCore.ownerOf(0)).to.equal(await user.getAddress());
    expect(await savingCore.ownerOf(1)).to.equal(await user.getAddress());

    // Different principals
    const d0 = await savingCore.deposits(0);
    const d1 = await savingCore.deposits(1);
    expect(d0.principal).to.not.equal(d1.principal);
  });

  // ─── 10. Tokens in SavingCore, not VaultManager ───────────────

  it("#10 — tokens go to SavingCore, not VaultManager", async function () {
    const { savingCore, usdc, vaultManager, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(3_000);

    const vaultBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).openDeposit(0, amount);

    // SavingCore received the tokens
    expect(await usdc.balanceOf(await savingCore.getAddress())).to.equal(amount);

    // VaultManager balance unchanged
    expect(await vaultManager.vaultBalance()).to.equal(vaultBefore);
  });
});

describe("SavingCore — withdrawAtMaturity", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return { ...base, depositId: 0n, amount, openTimestamp: block!.timestamp };
  }

  // ─── 1. Happy path at exact maturityAt ─────────────────────────

  it("#1 — happy path: withdraw at exact maturityAt → principal + interest paid", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const maturityAt = Number(deposit.maturityAt);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await ethers.provider.send("evm_setNextBlockTimestamp", [maturityAt]);
    await savingCore.connect(user).withdrawAtMaturity(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();

    expect(userBalAfter).to.equal(userBalBefore + principal + expectedInterest);
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);
    expect(await savingCore.ownerOf(0)).to.equal(await user.getAddress());
  });

  // ─── 2. After maturityAt (+1 day) ─────────────────────────────

  it("#2 — withdraw after maturityAt (+1 day) → same result", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY + SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();

    expect(userBalAfter).to.equal(userBalBefore + principal + expectedInterest);
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);
  });

  // ─── 3. Interest formula proof ─────────────────────────────────

  it("#3 — interest formula proof: 10,000 USDC, 180 days, 400 bps → 197,260,273 units", async function () {
    const { savingCore, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const vaultBalBefore = await vaultManager.vaultBalance();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    const vaultBalAfter = await vaultManager.vaultBalance();
    const interestPaid = vaultBalBefore - vaultBalAfter;
    const expectedInterest = calculateExpectedInterest(toUSDC(10_000), DEFAULT_APR, DEFAULT_TENOR);

    expect(interestPaid).to.equal(expectedInterest);
    expect(expectedInterest).to.equal(197_260_273n);
  });

  // ─── 4. Before maturity → revert ───────────────────────────────

  it("#4 — before maturity → reverts NotYetMature", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await expect(
      savingCore.connect(user).withdrawAtMaturity(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotYetMature");
  });

  // ─── 5. Double withdraw → revert ──────────────────────────────

  it("#5 — double withdraw → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    await expect(
      savingCore.connect(user).withdrawAtMaturity(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 6. Vault insufficient → revert ───────────────────────────

  it("#6 — vault insufficient → reverts", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    // Owner drains vault to 100 units (less than interest owed)
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal - 100n);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await expect(
      savingCore.connect(user).withdrawAtMaturity(0),
    ).to.be.reverted;
  });

  // ─── 7. Vault insufficient exact boundary ─────────────────────

  it("#7 — vault insufficient exact boundary: vault = interest - 1 → reverts", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    // Leave exactly interest - 1 in vault
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal - (expectedInterest - 1n));

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await expect(
      savingCore.connect(user).withdrawAtMaturity(0),
    ).to.be.reverted;
  });

  // ─── 8. Rounding dust ─────────────────────────────────────────

  it("#8 — rounding dust: odd principal → truncated interest, dust stays in vault", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithPlan);

    // Deposit odd principal above minDeposit (100 USDC)
    const oddPrincipal = toUSDC(100) + 1n;
    await savingCore.connect(user).openDeposit(0, oddPrincipal);

    const vaultBalBefore = await vaultManager.vaultBalance();
    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    const vaultBalAfter = await vaultManager.vaultBalance();
    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const interestPaid = vaultBalBefore - vaultBalAfter;
    const expectedInterest = calculateExpectedInterest(oddPrincipal, DEFAULT_APR, DEFAULT_TENOR);

    // Interest is truncated (integer division)
    expect(interestPaid).to.equal(expectedInterest);
    // User receives exactly principal + truncated interest
    expect(userBalAfter).to.equal(userBalBefore + oddPrincipal + expectedInterest);
  });

  // ─── 9. Withdrawn event ────────────────────────────────────────

  it("#9 — Withdrawn event: isEarly=false, correct principal + interest", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    const tx = await savingCore.connect(user).withdrawAtMaturity(0);
    const receipt = await tx.wait();

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "Withdrawn");

    expect(event).to.not.be.null;
    expect(event!.args.depositId).to.equal(0);
    expect(event!.args.owner).to.equal(await user.getAddress());
    expect(event!.args.principal).to.equal(principal);
    expect(event!.args.interest).to.equal(expectedInterest);
    expect(event!.args.isEarly).to.equal(false);
  });

  // ─── 10. Deposit status → Withdrawn ───────────────────────────

  it("#10 — deposit status changes to Withdrawn after withdraw", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    const deposit = await savingCore.deposits(0);
    expect(deposit.status).to.equal(1); // Status.Withdrawn
  });

  // ─── 11. Non-NFT-owner → revert ───────────────────────────────

  it("#11 — non-NFT-owner calls → reverts (OZ ERC721 check)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);
    const [, , other] = await ethers.getSigners();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await expect(
      savingCore.connect(other).withdrawAtMaturity(0),
    ).to.be.reverted;
  });

  // ─── 12. APR snapshot immutability ────────────────────────────

  it("#12 — APR snapshot: updatePlan after open → interest uses old APR", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    // Update plan APR to 800 bps — should not affect existing deposit
    await savingCore.connect(owner).updatePlan(0, 800);

    const vaultBalBefore = await vaultManager.vaultBalance();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    const vaultBalAfter = await vaultManager.vaultBalance();
    const interestPaid = vaultBalBefore - vaultBalAfter;

    // Interest calculated with original APR (400), not updated APR (800)
    const expectedInterest = calculateExpectedInterest(toUSDC(10_000), DEFAULT_APR, DEFAULT_TENOR);
    expect(interestPaid).to.equal(expectedInterest);
  });
});

describe("SavingCore — earlyWithdraw", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return { ...base, depositId: 0n, amount, openTimestamp: block!.timestamp };
  }

  async function fixtureWithDepositNoFeeReceiver() {
    const [owner, user] = await ethers.getSigners();

    const usdc = await ethers.getContractFactory("MockUSDC").then((f) => f.deploy());

    const vaultManager = await ethers.getContractFactory("VaultManager")
      .then(async (f) => f.deploy(await usdc.getAddress()));

    const savingCore = await ethers.getContractFactory("SavingCore")
      .then(async (f) => f.deploy(await usdc.getAddress(), await vaultManager.getAddress()));

    await vaultManager.setSavingCore(await savingCore.getAddress());

    await usdc.mint(await owner.getAddress(), toUSDC(10_000));
    await usdc.mint(await user.getAddress(), toUSDC(10_000));

    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(10_000));
    await vaultManager.connect(owner).fundVault(toUSDC(10_000));
    // Intentionally do NOT call setFeeReceiver

    await usdc.connect(user).approve(await savingCore.getAddress(), ethers.MaxUint256);

    await savingCore.connect(owner).createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);
    await savingCore.connect(user).openDeposit(0, toUSDC(10_000));

    return { usdc, savingCore, vaultManager, owner, user, depositId: 0n };
  }

  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: penalty deducted, user gets principal - penalty", async function () {
    const { savingCore, usdc, user } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedPenalty = (principal * BigInt(PENALTY)) / 10_000n;

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).earlyWithdraw(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.equal(userBalBefore + principal - expectedPenalty);
  });

  // ─── 2. Zero interest assertion ───────────────────────────────

  it("#2 — zero interest: vault balance unchanged (no payInterest called)", async function () {
    const { savingCore, vaultManager, user } = await loadFixture(fixtureWithDeposit);

    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).earlyWithdraw(0);

    const vaultBalAfter = await vaultManager.vaultBalance();

    expect(vaultBalAfter).to.equal(vaultBalBefore);
  });

  // ─── 3. FeeReceiver balance increases by penalty ───────────────

  it("#3 — feeReceiver balance increases by exact penalty amount", async function () {
    const { savingCore, usdc, user, owner } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedPenalty = (principal * BigInt(PENALTY)) / 10_000n;

    const feeReceiverBalBefore = await usdc.balanceOf(await owner.getAddress());

    await savingCore.connect(user).earlyWithdraw(0);

    const feeReceiverBalAfter = await usdc.balanceOf(await owner.getAddress());

    expect(feeReceiverBalAfter).to.equal(feeReceiverBalBefore + expectedPenalty);
  });

  // ─── 4. FeeReceiver not set → revert ──────────────────────────

  it("#4 — feeReceiver not set → reverts FeeReceiverNotSet", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDepositNoFeeReceiver);

    // GREEN phase: change to .revertedWithCustomError(savingCore, "SavingCore_FeeReceiverNotSet")
    await expect(
      savingCore.connect(user).earlyWithdraw(0),
    ).to.be.reverted;
  });

  // ─── 5. Double early withdraw → revert ────────────────────────

  it("#5 — double early withdraw → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await savingCore.connect(user).earlyWithdraw(0);

    await expect(
      savingCore.connect(user).earlyWithdraw(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 6. Withdrawn event with isEarly=true ─────────────────────

  it("#6 — Withdrawn event: isEarly=true, correct principal + interest=0", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;

    const tx = await savingCore.connect(user).earlyWithdraw(0);
    const receipt = await tx.wait();

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "Withdrawn");

    expect(event).to.not.be.null;
    expect(event!.args.depositId).to.equal(0);
    expect(event!.args.owner).to.equal(await user.getAddress());
    expect(event!.args.principal).to.equal(principal);
    expect(event!.args.interest).to.equal(0);
    expect(event!.args.isEarly).to.equal(true);
  });

  // ─── 7. Deposit status → Withdrawn ───────────────────────────

  it("#7 — deposit status changes to Withdrawn after earlyWithdraw", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await savingCore.connect(user).earlyWithdraw(0);

    const deposit = await savingCore.deposits(0);
    expect(deposit.status).to.equal(1); // Status.Withdrawn
  });

  // ─── 8. Penalty formula proof ─────────────────────────────────

  it("#8 — penalty formula proof: 10,000 USDC, 450 bps → penalty = 450 USDC", async function () {
    const { savingCore, usdc, user, owner } = await loadFixture(fixtureWithDeposit);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const feeReceiverBalBefore = await usdc.balanceOf(await owner.getAddress());

    await savingCore.connect(user).earlyWithdraw(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const feeReceiverBalAfter = await usdc.balanceOf(await owner.getAddress());

    const userReceived = userBalAfter - userBalBefore;
    const penaltyCollected = feeReceiverBalAfter - feeReceiverBalBefore;

    expect(penaltyCollected).to.equal(toUSDC(450));
    expect(userReceived).to.equal(toUSDC(9_550));
  });

  // ─── 9. Non-NFT-owner → revert ───────────────────────────────

  it("#9 — non-NFT-owner calls earlyWithdraw → reverts", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);
    const [, , other] = await ethers.getSigners();

    // GREEN phase: change to .revertedWithCustomError(savingCore, "SavingCore_NotOwner")
    await expect(
      savingCore.connect(other).earlyWithdraw(0),
    ).to.be.reverted;
  });
});
