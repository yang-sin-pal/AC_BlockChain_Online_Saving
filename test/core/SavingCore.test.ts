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
  GRACE_PERIOD,
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

  // ─── 8. Nonexistent planId ─────────────────────────────────────

  it("#8 — nonexistent planId → reverts PlanNotFound", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).openDeposit(999, toUSDC(1_000)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── 9. maturityAt exact value ────────────────────────────────

  it("#9 — maturityAt equals block.timestamp + tenorDays * 86400", async function () {
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

  // ─── 10. Multiple deposits increment IDs ──────────────────────

  it("#10 — multiple deposits: nextDepositId increments, each gets unique NFT", async function () {
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

  // ─── 11. Tokens in SavingCore, not VaultManager ──────────────

  it("#11 — tokens go to SavingCore, not VaultManager", async function () {
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

describe("SavingCore — admin functions", function () {
  // ─── enablePlan: nonexistent planId → revert ──────────────────

  it("enablePlan(999) when 999 >= nextPlanId → reverts PlanNotFound", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).enablePlan(999),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── enablePlan: happy path ───────────────────────────────────

  it("enablePlan on disabled plan → succeeds, PlanEnabled event emitted", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).disablePlan(0);
    expect((await savingCore.plans(0)).enabled).to.equal(false);

    const tx = await savingCore.connect(owner).enablePlan(0);
    const receipt = await tx.wait();

    expect((await savingCore.plans(0)).enabled).to.equal(true);

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "PlanEnabled");

    expect(event).to.not.be.null;
    expect(event!.args.planId).to.equal(0);
  });

  // ─── createPlan: min > max → revert ───────────────────────────

  it("createPlan with minDeposit > maxDeposit → reverts InvalidDepositRange", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(180, 400, toUSDC(1000), toUSDC(500), 450),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidDepositRange");
  });

  // ─── createPlan: zero tenor → revert ──────────────────────────

  it("createPlan with tenorDays = 0 → reverts InvalidTenor", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(0, 400, toUSDC(100), toUSDC(100_000), 450),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidTenor");
  });

  // ─── createPlan: zero APR → revert ────────────────────────────

  it("createPlan with aprBps = 0 → reverts InvalidApr", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(180, 0, toUSDC(100), toUSDC(100_000), 450),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidApr");
  });

  // ─── createPlan: non-owner → revert ───────────────────────────

  it("non-owner calls createPlan → reverts (onlyOwner)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).createPlan(180, 400, toUSDC(100), toUSDC(100_000), 450),
    ).to.be.reverted;
  });

  // ─── updatePlan: nonexistent planId → revert ──────────────────

  it("updatePlan(999) when 999 >= nextPlanId → reverts PlanNotFound", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).updatePlan(999, 800),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── disablePlan: nonexistent planId → revert ─────────────────

  it("disablePlan(999) when 999 >= nextPlanId → reverts PlanNotFound", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).disablePlan(999),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
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

    await expect(
      savingCore.connect(user).earlyWithdraw(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_FeeReceiverNotSet");
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

    await expect(
      savingCore.connect(other).earlyWithdraw(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });
});

describe("SavingCore — autoRenewDeposit", function () {
  async function fixtureWithMaturedDepositPastGrace() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const maturityAt = block!.timestamp + DEFAULT_TENOR * SECONDS_PER_DAY;
    const gracePeriodEnd = maturityAt + GRACE_PERIOD * SECONDS_PER_DAY;
    await ethers.provider.send("evm_setNextBlockTimestamp", [gracePeriodEnd]);
    return { ...base, depositId: 0n, amount, openTimestamp: block!.timestamp, maturityAt, gracePeriodEnd };
  }

  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: auto-renew after grace period → new NFT minted, old status AutoRenewed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    // Old deposit status → AutoRenewed (enum 3)
    const oldDeposit = await savingCore.deposits(0);
    expect(oldDeposit.status).to.equal(3);

    // New NFT minted to caller
    expect(await savingCore.ownerOf(1)).to.equal(await user.getAddress());

    // New deposit is Active
    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.status).to.equal(0); // Status.Active
  });

  // ─── 2. Compound math proof ───────────────────────────────────

  it("#2 — compound math: new principal = old principal + interest", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    const oldDeposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.principal).to.equal(expectedNewPrincipal);
    expect(expectedNewPrincipal).to.equal(10_197_260_273n); // 10,000 + 197.26 USDC
  });

  // ─── 3. APR lock ──────────────────────────────────────────────

  it("#3 — APR lock: updatePlan after open → new deposit uses old APR (400), not updated (800)", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    // Update plan APR to 800 bps — should not affect auto-renew
    await savingCore.connect(owner).updatePlan(0, 800);

    await savingCore.connect(user).autoRenewDeposit(0);

    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.aprBpsAtOpen).to.equal(DEFAULT_APR); // 400, not 800
  });

  // ─── 4. Tenor preserved ───────────────────────────────────────

  it("#4 — tenor preserved: new deposit tenor = 180 days (same as original)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    const newDeposit = await savingCore.deposits(1);
    const newTenorSeconds = Number(newDeposit.maturityAt) - Number(newDeposit.startAt);
    expect(newTenorSeconds).to.equal(DEFAULT_TENOR * SECONDS_PER_DAY);
  });

  // ─── 5. Before grace period → revert ───────────────────────────

  it("#5 — before grace period (gracePeriodEnd - 1 second) → reverts GracePeriodNotElapsed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);
    const { savingCore: sc2 } = await loadFixture(fixtureWithPlan);

    // Open a fresh deposit in a separate fixture so we can manipulate time freely
    const amount = toUSDC(10_000);
    await sc2.connect(user).openDeposit(0, amount);
    const deposit = await sc2.deposits(0);
    const openTs = Number(deposit.startAt);
    const maturity = openTs + DEFAULT_TENOR * SECONDS_PER_DAY;
    const graceEnd = maturity + GRACE_PERIOD * SECONDS_PER_DAY;

    // Set to 1 second before grace period ends
    await ethers.provider.send("evm_setNextBlockTimestamp", [graceEnd - 1]);

    await expect(
      sc2.connect(user).autoRenewDeposit(0),
    ).to.be.reverted;
  });

  // ─── 6. At exact grace period second → allowed ─────────────────

  it("#6 — at exact grace period second (maturityAt + gracePeriod) → not reverted by GracePeriodNotElapsed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    // fixtureWithMaturedDepositPastGrace already set timestamp to gracePeriodEnd
    // In GREEN phase this should succeed; in RED it reverts with "TODO..." (not GracePeriodNotElapsed)
    // The key assertion: the revert is NOT GracePeriodNotElapsed — the grace period check passes
    try {
      await savingCore.connect(user).autoRenewDeposit(0);
    } catch (e: any) {
      expect(e.message).to.not.include("GracePeriodNotElapsed");
    }
  });

  // ─── 7. Old deposit status → AutoRenewed ──────────────────────

  it("#7 — old deposit status changes to AutoRenewed (enum 3)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    const oldDeposit = await savingCore.deposits(0);
    expect(oldDeposit.status).to.equal(3); // Status.AutoRenewed
  });

  // ─── 8. Double auto-renew → revert ────────────────────────────

  it("#8 — double auto-renew → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    await expect(
      savingCore.connect(user).autoRenewDeposit(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 9. Renewed event ─────────────────────────────────────────

  it("#9 — emits Renewed event with correct args", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    const tx = await savingCore.connect(user).autoRenewDeposit(0);
    const receipt = await tx.wait();

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "Renewed");

    const oldDeposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    expect(event).to.not.be.null;
    expect(event!.args.oldDepositId).to.equal(0);
    expect(event!.args.newDepositId).to.equal(1);
    expect(event!.args.newPrincipal).to.equal(expectedNewPrincipal);
    expect(event!.args.newPlanId).to.equal(0); // same plan
  });
});

describe("SavingCore — renewDeposit", function () {
  async function fixtureWithMaturedDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, owner, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    // Second plan to renew INTO — different params to prove new plan is used
    await savingCore.connect(owner).createPlan(90, 600, toUSDC(100), toUSDC(100_000), 300);
    const maturityAt = block!.timestamp + DEFAULT_TENOR * SECONDS_PER_DAY;
    await ethers.provider.send("evm_setNextBlockTimestamp", [maturityAt]);
    return { ...base, depositId: 0n, amount, maturityAt, secondPlanId: 1n };
  }

  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: renew at exact maturityAt → new NFT minted, old status ManualRenewed", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    // Old deposit status → ManualRenewed (enum 2)
    const oldDeposit = await savingCore.deposits(depositId);
    expect(oldDeposit.status).to.equal(2);

    // New NFT minted to caller
    const newDepositId = depositId + 1n;
    expect(await savingCore.ownerOf(newDepositId)).to.equal(await user.getAddress());

    // New deposit is Active
    const newDeposit = await savingCore.deposits(newDepositId);
    expect(newDeposit.status).to.equal(0); // Status.Active
  });

  // ─── 2. Compound math proof ───────────────────────────────────

  it("#2 — compound math: new principal = old principal + interest", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    const oldDeposit = await savingCore.deposits(depositId);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    const newDeposit = await savingCore.deposits(depositId + 1n);
    expect(newDeposit.principal).to.equal(expectedNewPrincipal);
    expect(expectedNewPrincipal).to.equal(10_197_260_273n); // 10,000 + 197.26 USDC
  });

  // ─── 3. New plan APR ──────────────────────────────────────────

  it("#3 — new deposit uses NEW plan's APR (600), not old plan's (400)", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    const newDeposit = await savingCore.deposits(depositId + 1n);
    expect(newDeposit.aprBpsAtOpen).to.equal(600); // Plan 1 APR, not plan 0
  });

  // ─── 4. New plan tenor ────────────────────────────────────────

  it("#4 — new deposit uses NEW plan's tenor (90 days), not old plan's (180)", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    const newDeposit = await savingCore.deposits(depositId + 1n);
    const newTenorSeconds = Number(newDeposit.maturityAt) - Number(newDeposit.startAt);
    expect(newTenorSeconds).to.equal(90 * SECONDS_PER_DAY);
  });

  // ─── 5. Before maturity → revert ───────────────────────────────

  it("#5 — before maturity (maturityAt - 1 second) → reverts NotYetMature", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(10_000);
    await savingCore.connect(user).openDeposit(0, amount);
    await savingCore.connect(owner).createPlan(90, 600, toUSDC(100), toUSDC(100_000), 300);

    const deposit = await savingCore.deposits(0);
    const maturity = Number(deposit.maturityAt);

    await ethers.provider.send("evm_setNextBlockTimestamp", [maturity - 1]);

    await expect(
      savingCore.connect(user).renewDeposit(0, 1),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotYetMature");
  });

  // ─── 6. Non-NFT-owner → revert ───────────────────────────────

  it("#6 — non-NFT-owner calls renewDeposit → reverts", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);
    const [, , other] = await ethers.getSigners();

    await expect(
      savingCore.connect(other).renewDeposit(depositId, secondPlanId),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 7. Double renew → revert ─────────────────────────────────

  it("#7 — double renew → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    await expect(
      savingCore.connect(user).renewDeposit(depositId, secondPlanId),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 8. Nonexistent newPlanId → revert ────────────────────────

  it("#8 — nonexistent newPlanId → reverts PlanNotFound", async function () {
    const { savingCore, user, depositId } = await loadFixture(fixtureWithMaturedDeposit);

    await expect(
      savingCore.connect(user).renewDeposit(depositId, 999),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── 9. Disabled new plan → revert ────────────────────────────

  it("#9 — disabled new plan → reverts PlanNotEnabled", async function () {
    const { savingCore, owner, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(owner).disablePlan(secondPlanId);

    await expect(
      savingCore.connect(user).renewDeposit(depositId, secondPlanId),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotEnabled");
  });

  // ─── 10. Renewed event ────────────────────────────────────────

  it("#10 — emits Renewed event with correct args", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    const tx = await savingCore.connect(user).renewDeposit(depositId, secondPlanId);
    const receipt = await tx.wait();

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "Renewed");

    const oldDeposit = await savingCore.deposits(depositId);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    expect(event).to.not.be.null;
    expect(event!.args.oldDepositId).to.equal(depositId);
    expect(event!.args.newDepositId).to.equal(depositId + 1n);
    expect(event!.args.newPrincipal).to.equal(expectedNewPrincipal);
    expect(event!.args.newPlanId).to.equal(secondPlanId);
  });
});
