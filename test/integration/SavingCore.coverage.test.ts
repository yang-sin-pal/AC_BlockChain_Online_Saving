import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../helpers/fixtures";
import {
  toUSDC,
  increaseTime,
  calculateExpectedInterest,
} from "../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  GRACE_PERIOD,
  PENALTY,
  SECONDS_PER_DAY,
} from "../helpers/constants";

describe("SavingCore — branch coverage gaps", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return {
      ...base,
      depositId: 0n,
      amount,
      openTimestamp: block!.timestamp,
    };
  }

  // ─── 19. burn on Active deposit → reverts AlreadyWithdrawn ────────

  it("#19 — burn on Active deposit → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await expect(
      savingCore.connect(user).burn(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 20. burn by non-owner → reverts NotOwner ─────────────────────

  it("#20 — burn by non-owner → reverts NotOwner", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);
    await savingCore.connect(user).claimPrincipal(0);

    const [, , other] = await ethers.getSigners();
    await expect(
      savingCore.connect(other).burn(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 21. claimPrincipal on Withdrawn deposit → reverts AlreadyWithdrawn ──

  it("#21 — claimPrincipal on Withdrawn deposit → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    await expect(
      savingCore.connect(user).claimPrincipal(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 22. claimInterest with vault=0 → payAmount=0, no vault transfer ──

  it("#22 — claimInterest with vault=0 → payAmount=0, pending remains", async function () {
    const { savingCore, owner, user, vaultManager, usdc } =
      await loadFixture(fixtureWithDeposit);

    // Drain vault completely
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const expectedInterest = calculateExpectedInterest(
      toUSDC(10_000),
      DEFAULT_APR,
      DEFAULT_TENOR,
    );

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    // Vault was empty → user gets 0 interest now
    expect(userBalAfter).to.equal(userBalBefore);
    // Full interest stored as pending for retry
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);
    // interestClaimed stays false (partial path)
    expect((await savingCore.deposits(0)).interestClaimed).to.be.false;
  });

  // ─── 23. renewDeposit on Withdrawn deposit → reverts AlreadyWithdrawn ──

  it("#23 — renewDeposit on Withdrawn deposit → reverts AlreadyWithdrawn", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithDeposit);

    // Create a second plan to renew into
    await savingCore
      .connect(owner)
      .createPlan(90, 600, toUSDC(100), toUSDC(100_000), 300);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    await expect(
      savingCore.connect(user).renewDeposit(0, 1),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 24. autoRenewDeposit on Withdrawn deposit → reverts AlreadyWithdrawn ──

  it("#24 — autoRenewDeposit on Withdrawn deposit → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).withdrawAtMaturity(0);

    await expect(
      savingCore.connect(user).autoRenewDeposit(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 25. claimPrincipal on Withdrawn (earlyWithdraw) → AlreadyWithdrawn ──

  it("#25 — claimPrincipal on earlyWithdrawn deposit → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await savingCore.connect(user).earlyWithdraw(0);

    await expect(
      savingCore.connect(user).claimPrincipal(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });
});
