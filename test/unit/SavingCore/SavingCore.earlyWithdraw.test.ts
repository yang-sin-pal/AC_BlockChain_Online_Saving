import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  PENALTY,
} from "../../helpers/constants";

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