import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC, calculateExpectedInterest } from "../../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  GRACE_PERIOD,
  SECONDS_PER_DAY,
  PENALTY
} from "../../helpers/constants";

describe("SavingCore — reentrancy", function () {
  async function fixtureWithReentrantAttacker() {
    const [owner, user] = await ethers.getSigners();

    // Deploy ReentrantToken instead of MockUSDC
    const token = await ethers.getContractFactory("ReentrantToken").then((f) => f.deploy());

    const vaultManager = await ethers.getContractFactory("VaultManager")
      .then(async (f) => f.deploy(await token.getAddress()));

    const savingCore = await ethers.getContractFactory("SavingCore")
      .then(async (f) => f.deploy(await token.getAddress(), await vaultManager.getAddress()));

    await vaultManager.setSavingCore(await savingCore.getAddress());

    await token.mint(await owner.getAddress(), toUSDC(10_000));
    await token.mint(await user.getAddress(), toUSDC(10_000));

    // Fund vault
    await token.connect(owner).approve(await vaultManager.getAddress(), toUSDC(10_000));
    await vaultManager.connect(owner).fundVault(toUSDC(10_000));
    await vaultManager.connect(owner).setFeeReceiver(await owner.getAddress());

    // Create plan
    await savingCore.connect(owner).createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

    // Deploy attacker
    const attacker = await ethers.getContractFactory("ReentrantAttacker")
      .then(async (f) => f.deploy(await savingCore.getAddress(), await vaultManager.getAddress(), await token.getAddress()));

    // Mint tokens to attacker for openDeposit
    await token.mint(await attacker.getAddress(), toUSDC(10_000));

    return { token, savingCore, vaultManager, owner, user, attacker };
  }

  // ─── R1. Reentrancy on withdrawAtMaturity ──────────────────────

  it("#R1 — reentrancy on withdrawAtMaturity → reverts ReentrancyGuardReentrantCall", async function () {
    const { savingCore, token, attacker, user } = await loadFixture(fixtureWithReentrantAttacker);

    // Attacker opens a deposit
    await attacker.connect(user).openDeposit(0, toUSDC(1_000));
    const depositId = 0;

    // Fast-forward to maturity
    const deposit = await savingCore.deposits(depositId);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deposit.maturityAt)]);

    // Set up attack: re-enter withdrawAtMaturity during token transfer callback
    await attacker.setAttack(0, depositId, 0); // Target.WithdrawAtMaturity = 0
    await token.setHook(true, await attacker.getAddress());

    // Attack should revert — nonReentrant blocks the re-entrant call
    await expect(
      attacker.connect(user).attackWithdrawAtMaturity(),
    ).to.be.revertedWithCustomError(savingCore, "ReentrancyGuardReentrantCall");
  });

  // ─── R2. Reentrancy on earlyWithdraw ───────────────────────────

  it("#R2 — reentrancy on earlyWithdraw → reverts ReentrancyGuardReentrantCall", async function () {
    const { savingCore, token, attacker, user } = await loadFixture(fixtureWithReentrantAttacker);

    // Attacker opens a deposit
    await attacker.connect(user).openDeposit(0, toUSDC(1_000));
    const depositId = 0;

    // Set up attack: re-enter earlyWithdraw during token transfer callback
    await attacker.setAttack(1, depositId, 0); // Target.EarlyWithdraw = 1
    await token.setHook(true, await attacker.getAddress());

    // Attack should revert
    await expect(
      attacker.connect(user).attackEarlyWithdraw(),
    ).to.be.revertedWithCustomError(savingCore, "ReentrancyGuardReentrantCall");
  });

  // ─── R3. Reentrancy on renewDeposit ────────────────────────────

  it("#R3 — reentrancy on renewDeposit → reverts ReentrancyGuardReentrantCall", async function () {
    const { savingCore, owner, token, attacker, user } = await loadFixture(fixtureWithReentrantAttacker);

    // Create second plan for renewal
    await savingCore.connect(owner).createPlan(90, 600, toUSDC(100), toUSDC(100_000), 300);
    const secondPlanId = 1;

    await attacker.connect(user).openDeposit(0, toUSDC(1_000));
    const depositId = 0;

    // Fast-forward to maturity
    const deposit = await savingCore.deposits(depositId);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deposit.maturityAt)]);

    // Set up attack: re-enter renewDeposit during token transfer callback
    // For renewDeposit, the callback fires when VaultManager.payInterest transfers tokens to SavingCore
    await attacker.setAttack(2, depositId, secondPlanId); // Target.RenewDeposit = 2
    await token.setHook(true, await attacker.getAddress());

    // Attack should revert
    await expect(
      attacker.connect(user).attackRenewDeposit(),
    ).to.be.revertedWithCustomError(savingCore, "ReentrancyGuardReentrantCall");
  });

  // ─── R4. Reentrancy on autoRenewDeposit ────────────────────────

  it("#R4 — reentrancy on autoRenewDeposit → reverts ReentrancyGuardReentrantCall", async function () {
    const { savingCore, token, attacker, user } = await loadFixture(fixtureWithReentrantAttacker);

    await attacker.connect(user).openDeposit(0, toUSDC(1_000));
    const depositId = 0;

    // Fast-forward past grace period
    const deposit = await savingCore.deposits(depositId);
    const gracePeriodEnd = Number(deposit.maturityAt) + GRACE_PERIOD * SECONDS_PER_DAY;
    await ethers.provider.send("evm_setNextBlockTimestamp", [gracePeriodEnd]);

    // Set up attack: re-enter autoRenewDeposit during token transfer callback
    await attacker.setAttack(3, depositId, 0); // Target.AutoRenewDeposit = 3
    await token.setHook(true, await attacker.getAddress());

    // Attack should revert
    await expect(
      attacker.connect(user).attackAutoRenewDeposit(),
    ).to.be.revertedWithCustomError(savingCore, "ReentrancyGuardReentrantCall");
  });
});