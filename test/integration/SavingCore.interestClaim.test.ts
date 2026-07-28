import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, PENALTY, SECONDS_PER_DAY } from "../helpers/constants";

describe("SavingCore — claimInterest", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return { ...base, depositId: 0n, amount, openTimestamp: block!.timestamp };
  }

  // ─── 1. claimInterest (Path A): vault funded → pays interest, principal stays ──

  it("#1 — Path A: pays interest from vault, principal stays in SavingCore", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const vaultBalBefore = await vaultManager.vaultBalance();
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const savingCoreBalBefore = await usdc.balanceOf(await savingCore.getAddress());

    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();
    const savingCoreBalAfter = await usdc.balanceOf(await savingCore.getAddress());

    expect(userBalAfter).to.equal(userBalBefore + expectedInterest);
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);
    // Principal stays in SavingCore
    expect(savingCoreBalAfter).to.equal(savingCoreBalBefore);
  });

  // ─── 2. claimInterest (Path A): interestClaimed=true, status stays Active ──

  it("#2 — Path A: sets interestClaimed=true, status stays Active (0)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    const deposit = await savingCore.deposits(0);
    expect(deposit.status).to.equal(0); // Status.Active
    expect(deposit.interestClaimed).to.equal(true);
  });

  // ─── 3. claimInterest: NFT stays with caller (not burned) ──────────

  it("#3 — claimInterest: NFT stays with caller", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    expect(await savingCore.ownerOf(0)).to.equal(await user.getAddress());
  });

  // ─── 4. claimInterest: double claim → revert InterestAlreadyClaimed ──

  it("#4 — double claimInterest → reverts InterestAlreadyClaimed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InterestAlreadyClaimed");
  });

  // ─── 5. claimInterest: not mature → revert ─────────────────────────

  it("#5 — claimInterest: not mature → reverts NotYetMature", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotYetMature");
  });

  // ─── 6. claimInterest: non-owner → revert ──────────────────────────

  it("#6 — claimInterest by non-owner → reverts NotOwner", async function () {
    const { savingCore } = await loadFixture(fixtureWithDeposit);
    const [, , other] = await ethers.getSigners();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await expect(
      savingCore.connect(other).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 7. claimInterest: when paused → reverts ──────────────────────

  it("#7 — claimInterest when paused → reverts EnforcedPause", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 8. claimInterest: emits InterestClaimed event ─────────────────

  it("#8 — claimInterest: emits InterestClaimed event", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);
    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.emit(savingCore, "InterestClaimed").withArgs(0, await user.getAddress(), expectedInterest);
  });

  // ─── 9. renewDeposit after claimInterest → principal only (no compound) ─

  it("#9 — renewDeposit after claimInterest → new principal = old principal (no interest)", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    // Renew into same plan
    const newDepositId = await savingCore.connect(user).renewDeposit.staticCall(0, 0);
    await savingCore.connect(user).renewDeposit(0, 0);

    const oldDeposit = await savingCore.deposits(0);
    const newDeposit = await savingCore.deposits(newDepositId);

    // Old deposit marked ManualRenewed
    expect(oldDeposit.status).to.equal(3); // Status.ManualRenewed
    // New principal = old principal only (interest was already paid out)
    expect(newDeposit.principal).to.equal(10_000_000_000n); // toUSDC(10_000)
  });

  // ─── 10. withdrawAtMaturity after claimInterest → reverts UseClaimPrincipal ──

  it("#10 — withdrawAtMaturity after claimInterest → reverts UseClaimPrincipal", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    await expect(
      savingCore.connect(user).withdrawAtMaturity(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_UseClaimPrincipal");
  });

  // ─── 11. claimPrincipal after claimInterest → pays principal, status=Withdrawn ──

  it("#11 — claimPrincipal after claimInterest → pays principal only, status=Withdrawn", async function () {
    const { savingCore, usdc, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const deposit = await savingCore.deposits(0);

    expect(userBalAfter).to.equal(userBalBefore + deposit.principal);
    expect(deposit.status).to.equal(1); // Withdrawn
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });

  // ─── 12. claimInterest partial vault → pays what vault has, remainder pending ──

  it("#12 — claimInterest partial vault → pays partial, remainder as pendingInterest", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    // Drain vault to leave only half the interest
    const halfInterest = expectedInterest / 2n;
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal - halfInterest);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.equal(userBalBefore + halfInterest);
    // Remainder stored as pending
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest - halfInterest);
    // interestClaimed stays false (partial payment)
    expect((await savingCore.deposits(0)).interestClaimed).to.be.false;
  });

  // ─── 13. claimInterest Path B: after claimPrincipal → pays pending, Withdrawn ──

  it("#13 — Path B: claimInterest after claimPrincipal → pays pending, status=Withdrawn", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    // claimPrincipal stores interest as pending
    await savingCore.connect(user).claimPrincipal(0);
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();

    expect(userBalAfter).to.equal(userBalBefore + expectedInterest);
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);

    const depositAfter = await savingCore.deposits(0);
    expect(depositAfter.status).to.equal(1); // Withdrawn
    expect(depositAfter.interestClaimed).to.be.true;
  });

  // ─── 14. claimInterest Path B: after full claim → reverts InterestAlreadyClaimed ──

  it("#14 — Path B: claimInterest after claimPrincipal+claimInterest → reverts InterestAlreadyClaimed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);
    await savingCore.connect(user).claimInterest(0);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InterestAlreadyClaimed");
  });

  // ─── 15. claimInterest on Withdrawn deposit → reverts AlreadyWithdrawn ──

  it("#15 — claimInterest on Withdrawn deposit → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    // earlyWithdraw → Withdrawn
    await savingCore.connect(user).earlyWithdraw(0);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });
});
