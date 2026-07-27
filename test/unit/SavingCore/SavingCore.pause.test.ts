import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC, increaseTime } from "../../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, SECONDS_PER_DAY } from "../../helpers/constants";

describe("SavingCore — pause / unpause", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    await savingCore.connect(user).openDeposit(0, amount);
    return { ...base, depositId: 0n, amount };
  }

  // ─── 1. Owner pauses → succeeds ──────────────────────────────

  it("#1 — owner pauses → emits Paused", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(savingCore.connect(owner).pause())
      .to.emit(savingCore, "Paused")
      .withArgs(await owner.getAddress());
  });

  // ─── 2. Owner unpauses after pause → succeeds ────────────────

  it("#2 — owner unpauses after pause → emits Unpaused", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).pause();
    await expect(savingCore.connect(owner).unpause())
      .to.emit(savingCore, "Unpaused")
      .withArgs(await owner.getAddress());
  });

  // ─── 3. Non-owner calls pause → revert ───────────────────────

  it("#3 — non-owner calls pause → reverts OwnableUnauthorizedAccount", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).pause(),
    ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
  });

  // ─── 4. Non-owner calls unpause → revert ─────────────────────

  it("#4 — non-owner calls unpause → reverts OwnableUnauthorizedAccount", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).pause();
    await expect(
      savingCore.connect(user).unpause(),
    ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
  });

  // ─── 5. withdrawAtMaturity while paused → revert ─────────────

  it("#5 — withdrawAtMaturity while paused → reverts EnforcedPause", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).withdrawAtMaturity(0),
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 6. earlyWithdraw while paused → succeeds ──────────────────

  it("#6 — earlyWithdraw while paused → succeeds (no vault dependency)", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await savingCore.connect(owner).pause();

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const feeReceiverBalBefore = await usdc.balanceOf(await vaultManager.feeReceiver());

    await savingCore.connect(user).earlyWithdraw(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const feeReceiverBalAfter = await usdc.balanceOf(await vaultManager.feeReceiver());

    // User gets principal - penalty
    expect(userBalAfter).to.be.greaterThan(userBalBefore);
    // FeeReceiver gets the penalty
    expect(feeReceiverBalAfter).to.be.greaterThan(feeReceiverBalBefore);
  });

  // ─── 7. renewDeposit while paused → revert ───────────────────

  it("#7 — renewDeposit while paused → reverts EnforcedPause", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).renewDeposit(0, 0),
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 8. autoRenewDeposit while paused → revert ───────────────

  it("#8 — autoRenewDeposit while paused → reverts EnforcedPause", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithDeposit);

    // Advance past grace period (maturityAt + 4 days)
    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY + 5 * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).autoRenewDeposit(0),
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 9. openDeposit while paused → succeeds ──────────────────

  it("#9 — openDeposit while paused → succeeds (not blocked)", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(10_000)),
    ).to.emit(savingCore, "DepositOpened");
  });

  // ─── 10. After unpause → withdrawAtMaturity succeeds ─────────

  it("#10 — after unpause → withdrawAtMaturity succeeds", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await savingCore.connect(owner).pause();
    await savingCore.connect(owner).unpause();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    await savingCore.connect(user).withdrawAtMaturity(0);
    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.be.greaterThan(userBalBefore);
  });
});
