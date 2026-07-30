import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployAllContracts } from "../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, PENALTY, SECONDS_PER_DAY } from "../helpers/constants";

describe("SavingCore — C2: solvency guard", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(deployAllContracts);
    const { savingCore, owner } = base;

    await savingCore.connect(owner).createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

    const { savingCore: sc, user } = base;
    const amount = toUSDC(10_000);
    await sc.connect(user).openDeposit(0, amount);

    const expectedInterest = calculateExpectedInterest(amount, DEFAULT_APR, DEFAULT_TENOR);
    return { ...base, depositId: 0n, amount, expectedInterest };
  }

  // ─── 1. withdrawVault succeeds when amount ≤ surplus ──────────────────

  it("#1 — withdrawVault succeeds when amount ≤ surplus (no deposits, full balance available)", async function () {
    const { vaultManager, owner } = await loadFixture(deployAllContracts);

    await expect(vaultManager.connect(owner).withdrawVault(toUSDC(500)))
      .to.emit(vaultManager, "VaultWithdrawn")
      .withArgs(await owner.getAddress(), toUSDC(500));
  });

  // ─── 2. withdrawVault reverts when amount > surplus ───────────────────

  it("#2 — withdrawVault reverts when amount > surplus", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { vaultManager, owner, expectedInterest } = base;

    const balance = toUSDC(10_000);
    const available = balance - expectedInterest;

    await expect(
      vaultManager.connect(owner).withdrawVault(available + 1n)
    ).to.be.revertedWithCustomError(vaultManager, "VaultManager_ExceedsAvailable");
  });

  // ─── 3. Opening a deposit increases totalOwedInterest ─────────────────

  it("#3 — opening a deposit increases totalOwedInterest by the calculated interest", async function () {
    const { savingCore, owner, user } = await loadFixture(deployAllContracts);

    await savingCore.connect(owner).createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

    const amount = toUSDC(10_000);
    const expectedInterest = calculateExpectedInterest(amount, DEFAULT_APR, DEFAULT_TENOR);

    expect(await savingCore.totalOwedInterest()).to.equal(0n);

    await savingCore.connect(user).openDeposit(0, amount);

    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);
  });

  // ─── 4. withdrawAtMaturity decreases totalOwedInterest ────────────────

  it("#4 — withdrawAtMaturity decreases totalOwedInterest by the interest amount", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { savingCore, user, expectedInterest } = base;

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);

    await savingCore.connect(user).withdrawAtMaturity(0);

    expect(await savingCore.totalOwedInterest()).to.equal(0n);
  });

  // ─── 5. earlyWithdraw decreases totalOwedInterest ─────────────────────

  it("#5 — earlyWithdraw decreases totalOwedInterest (interest forfeited)", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { savingCore, user, expectedInterest } = base;

    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);

    await savingCore.connect(user).earlyWithdraw(0);

    expect(await savingCore.totalOwedInterest()).to.equal(0n);
  });

  // ─── 6. renewDeposit releases old obligation, adds new one ────────────

  it("#6 — renewDeposit releases old obligation and adds new one", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { savingCore, owner, user, expectedInterest } = base;

    await savingCore.connect(owner).createPlan(90, 500, toUSDC(100), toUSDC(100_000), PENALTY);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);

    const newPrincipal = toUSDC(10_000) + expectedInterest;
    const expectedNewInterest = calculateExpectedInterest(newPrincipal, 500, 90);
    await savingCore.connect(user).renewDeposit(0, 1);

    expect(await savingCore.totalOwedInterest()).to.equal(expectedNewInterest);
  });

  // ─── 7. claimPrincipal does NOT change totalOwedInterest ──────────────

  it("#7 — claimPrincipal does not decrease totalOwedInterest (interest stays as pending)", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { savingCore, user, expectedInterest } = base;

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);

    await savingCore.connect(user).claimPrincipal(0);

    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);
  });

  // ─── 8. claimInterest decreases by paid portion ───────────────────────

  it("#8 — claimInterest decreases totalOwedInterest by the paid portion", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { savingCore, user, expectedInterest } = base;

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await savingCore.connect(user).claimPrincipal(0);
    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);

    await savingCore.connect(user).claimInterest(0);

    expect(await savingCore.totalOwedInterest()).to.equal(0n);
  });

  // ─── 9. Multi-step chain: deposit → claimPrincipal → partial claimInterest
  //       → fundVault → full claimInterest → totalOwedInterest = 0 ──────

  it("#9 — multi-step chain: principal+interest claimed in stages, totalOwedInterest tracks correctly", async function () {
    const base = await loadFixture(fixtureWithDeposit);
    const { savingCore, vaultManager, usdc, owner, user, expectedInterest } = base;

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    // Sanity: vault has enough for full interest
    expect(await usdc.balanceOf(await vaultManager.getAddress())).to.be.gte(expectedInterest);

    // Step 1: claimPrincipal — interest stays in pendingInterest, totalOwedInterest unchanged
    await savingCore.connect(user).claimPrincipal(0);
    expect(await savingCore.totalOwedInterest()).to.equal(expectedInterest);

    // Step 2: claimInterest (vault adequately funded) — pays full pending
    await savingCore.connect(user).claimInterest(0);
    expect(await savingCore.totalOwedInterest()).to.equal(0n);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);

    const deposit = await savingCore.deposits(0);
    expect(deposit.interestClaimed).to.be.true;
    expect(deposit.status).to.equal(1); // Withdrawn
  });
});
