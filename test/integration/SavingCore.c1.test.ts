import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, SECONDS_PER_DAY } from "../helpers/constants";

describe("SavingCore — C1: principal is always safe", function () {
  async function fixtureWithDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return { ...base, depositId: 0n, amount, openTimestamp: block!.timestamp };
  }

  // ─── 1. claimPrincipal: pays principal, interest goes to pending ──────

  it("#1 — claimPrincipal: pays principal, interest stored as pendingInterest", async function () {
    const { savingCore, usdc, user } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    // User gets principal only
    expect(userBalAfter).to.equal(userBalBefore + principal);
    // Interest stored as pending
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);
    // Status = PrincipalClaimed
    const depositAfter = await savingCore.deposits(0);
    expect(depositAfter.status).to.equal(2); // PrincipalClaimed
  });

  // ─── 2. claimPrincipal: when interestClaimed=true → status=Withdrawn ──

  it("#2 — claimPrincipal after claimInterest → status=Withdrawn (both done)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    // Claim interest first (Path A)
    await savingCore.connect(user).claimInterest(0);

    // Then claim principal
    await savingCore.connect(user).claimPrincipal(0);

    const deposit = await savingCore.deposits(0);
    expect(deposit.status).to.equal(1); // Withdrawn
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });

  // ─── 3. claimPrincipal: double claim → reverts PrincipalAlreadyClaimed ─

  it("#3 — double claimPrincipal → reverts PrincipalAlreadyClaimed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    await expect(
      savingCore.connect(user).claimPrincipal(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PrincipalAlreadyClaimed");
  });

  // ─── 4. claimInterest (Path B): after claimPrincipal → pays pending ───

  it("#4 — claimInterest after claimPrincipal → pays pending, status=Withdrawn", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    const expectedInterest = calculateExpectedInterest(toUSDC(10_000), DEFAULT_APR, DEFAULT_TENOR);
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();

    expect(userBalAfter).to.equal(userBalBefore + expectedInterest);
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);

    const deposit = await savingCore.deposits(0);
    expect(deposit.status).to.equal(1); // Withdrawn (both done)
  });

  // ─── 5. claimInterest: after full claim → reverts InterestAlreadyClaimed ──

  it("#5 — claimInterest: after claimPrincipal+claimInterest → reverts InterestAlreadyClaimed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    // claimPrincipal stores interest as pending
    await savingCore.connect(user).claimPrincipal(0);
    // claimInterest clears pending, sets interestClaimed=true
    await savingCore.connect(user).claimInterest(0);

    // interestClaimed is now true → InterestAlreadyClaimed (checked before NoPendingInterest)
    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InterestAlreadyClaimed");
  });

  // ─── 6. claimPrincipal: non-owner → revert ────────────────────────────

  it("#6 — claimPrincipal by non-owner → reverts NotOwner", async function () {
    const { savingCore } = await loadFixture(fixtureWithDeposit);
    const [, , other] = await ethers.getSigners();

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await expect(
      savingCore.connect(other).claimPrincipal(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 7. claimInterest: non-owner → revert ─────────────────────────────

  it("#7 — claimInterest by non-owner → reverts NotOwner", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    const [, , other] = await ethers.getSigners();
    await expect(
      savingCore.connect(other).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 8. claimPrincipal: before maturity → revert ─────────────────────

  it("#8 — claimPrincipal before maturity → reverts NotYetMature", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await expect(
      savingCore.connect(user).claimPrincipal(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotYetMature");
  });

  // ─── 9. double claimInterest (Path A) → reverts InterestAlreadyClaimed

  it("#9 — double claimInterest → reverts InterestAlreadyClaimed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InterestAlreadyClaimed");
  });

  // ─── 10. claimPrincipal when paused → succeeds (C1 guarantee) ────────

  it("#10 — claimPrincipal when paused → succeeds (C1 guarantee)", async function () {
    const { savingCore, usdc, owner, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    expect(userBalAfter).to.equal(userBalBefore + principal);
  });

  // ─── 11. claimInterest when paused → revert ─────────────────────────

  it("#11 — claimInterest when paused → reverts EnforcedPause", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 12. NFT transferred after claimPrincipal → new owner can claimInterest

  it("#12 — NFT transferred after claimPrincipal → new owner can claimInterest", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // Transfer NFT from user to other
    const [, , other] = await ethers.getSigners();
    await savingCore.connect(user).transferFrom(
      await user.getAddress(), await other.getAddress(), 0,
    );

    // Fund vault so claimInterest succeeds (mint extra USDC to owner first)
    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    await usdc.mint(await owner.getAddress(), expectedInterest);
    await usdc.connect(owner).approve(await vaultManager.getAddress(), expectedInterest);
    await vaultManager.connect(owner).fundVault(expectedInterest);

    // New owner claims interest
    await expect(
      savingCore.connect(other).claimInterest(0),
    ).to.emit(savingCore, "InterestClaimed");
  });

  // ─── 13. burn with pending interest → revert ───────────────────────────

  it("#13 — burn with pending interest → reverts PendingInterestExists", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // pendingInterest > 0 → burn should revert
    await expect(
      savingCore.connect(user).burn(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PendingInterestExists");
  });

  // ─── 14. burn after full claimInterest → succeeds ──────────────────────

  it("#14 — burn after full claimInterest → succeeds", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    // claimInterest (Path A) — vault funded
    await savingCore.connect(user).claimInterest(0);
    // claimPrincipal — interestClaimed=true → status=Withdrawn
    await savingCore.connect(user).claimPrincipal(0);

    // pendingInterest == 0 → burn should succeed
    await savingCore.connect(user).burn(0);
    await expect(
      savingCore.ownerOf(0),
    ).to.be.reverted;
  });

  // ─── 15. claimPrincipal when paused → interest stored as pending ─────

  it("#15 — claimPrincipal when paused → principal paid, interest deferred to pending", async function () {
    const { savingCore, usdc, owner, user } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    // User gets principal only
    expect(userBalAfter).to.equal(userBalBefore + principal);
    // Full interest deferred to pendingInterest
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);
  });

  // ─── 16. claimPrincipal after claimInterest → pays principal, Withdrawn

  it("#16 — claimPrincipal after claimInterest → pays principal, status=Withdrawn", async function () {
    const { savingCore, usdc, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    // Claim interest first
    await savingCore.connect(user).claimInterest(0);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const deposit = await savingCore.deposits(0);

    expect(userBalAfter).to.equal(userBalBefore + toUSDC(10_000));
    expect(deposit.status).to.equal(1); // Withdrawn
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });

  // ─── 17. claimInterest partial vault: vault insufficient → pays partial, remainder pending ──

  it("#17 — claimInterest partial vault → pays what vault has, remainder as pending", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    // Drain vault and leave only half the interest
    const halfInterest = expectedInterest / 2n;
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal - halfInterest);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    // claimInterest → vault only has half → partial payment
    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.equal(userBalBefore + halfInterest);
    // Remainder stored as pending
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest - halfInterest);
    // interestClaimed stays false
    expect((await savingCore.deposits(0)).interestClaimed).to.be.false;
  });

  // ─── 18. claimInterest partial vault then retry → eventually Withdrawn ──

  it("#18 — claimInterest partial then retry → eventually Withdrawn", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);

    // Leave only 1 USDC in vault
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal - toUSDC(1));

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // First claimInterest: vault has 1 USDC → partial
    await savingCore.connect(user).claimInterest(0);
    expect(await savingCore.pendingInterest(0)).to.be.greaterThan(0n);

    // Admin funds vault with remaining
    const remaining = expectedInterest - toUSDC(1);
    await usdc.connect(owner).approve(await vaultManager.getAddress(), remaining);
    await vaultManager.connect(owner).fundVault(remaining);

    // Second claimInterest: pays remainder → Withdrawn
    await savingCore.connect(user).claimInterest(0);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
    expect((await savingCore.deposits(0)).status).to.equal(1); // Withdrawn
  });
});
