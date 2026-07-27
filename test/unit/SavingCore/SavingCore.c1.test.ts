import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, SECONDS_PER_DAY } from "../../helpers/constants";

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

  // ─── 1. claimPrincipal: vault funded → pays principal + full interest ──

  it("#1 — claimPrincipal: vault funded → pays principal + full interest, no pending", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();

    expect(userBalAfter).to.equal(userBalBefore + principal + expectedInterest);
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });

  // ─── 2. claimPrincipal: vault empty → pays principal only ──────────────

  it("#2 — claimPrincipal: vault empty → pays principal only, pendingInterest = full interest", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    // Drain vault completely
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    // User gets principal only
    expect(userBalAfter).to.equal(userBalBefore + principal);
    // Interest recorded as pending
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);
  });

  // ─── 3. claimPrincipal: vault partial → pays principal + partial interest ─

  it("#3 — claimPrincipal: vault partial → pays partial interest, pending = remainder", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    // Leave exactly half the interest in vault
    const halfInterest = expectedInterest / 2n;
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal - halfInterest);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    await savingCore.connect(user).claimPrincipal(0);

    // Pending = total interest - what vault paid
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest - halfInterest);
  });

  // ─── 4. claimInterest: pays pending remainder ──────────────────────────

  it("#4 — claimInterest: after partial claim → pays remainder, pending = 0", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    // Drain vault so claimPrincipal records full interest as pending
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // Now admin funds vault
    await usdc.connect(owner).approve(await vaultManager.getAddress(), expectedInterest);
    await vaultManager.connect(owner).fundVault(expectedInterest);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());

    await savingCore.connect(user).claimInterest(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.equal(userBalBefore + expectedInterest);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });

  // ─── 5. claimInterest: no pending → revert ─────────────────────────────

  it("#5 — claimInterest: no pending interest → reverts NoPendingInterest", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    // claimPrincipal with vault funded → no pending interest
    await savingCore.connect(user).claimPrincipal(0);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NoPendingInterest");
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
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    // Drain vault, claim principal to create pending interest
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);
    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    const [, , other] = await ethers.getSigners();
    await expect(
      savingCore.connect(other).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 8. double claimPrincipal → revert ────────────────────────────────

  it("#8 — double claimPrincipal → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    await expect(
      savingCore.connect(user).claimPrincipal(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 9. double claimInterest → revert ─────────────────────────────────

  it("#9 — double claimInterest → reverts NoPendingInterest", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);
    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // Fund vault and claim
    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    await usdc.connect(owner).approve(await vaultManager.getAddress(), expectedInterest);
    await vaultManager.connect(owner).fundVault(expectedInterest);
    await savingCore.connect(user).claimInterest(0);

    // Double claim → reverts
    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NoPendingInterest");
  });

  // ─── 10. claimPrincipal when paused → succeeds ────────────────────────

  it("#10 — claimPrincipal when paused → succeeds (C1 guarantee)", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    // Drain vault to prove principal-only works when paused
    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

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

  // ─── 15. claimPrincipal when paused, vault funded → defers 100% interest ─

  it("#15 — claimPrincipal when paused + vault funded → principal paid, full interest deferred", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const deposit = await savingCore.deposits(0);
    const principal = deposit.principal;
    const expectedInterest = calculateExpectedInterest(principal, DEFAULT_APR, DEFAULT_TENOR);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(owner).pause();

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();

    // User gets principal only
    expect(userBalAfter).to.equal(userBalBefore + principal);
    // Vault untouched — even though it had enough funds
    expect(vaultBalAfter).to.equal(vaultBalBefore);
    // Full interest deferred to pendingInterest
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);
  });

  // ─── 12. NFT transferred after claimPrincipal → new owner can claimInterest ─

  it("#12 — NFT transferred after claimPrincipal → new owner can claimInterest", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // Transfer NFT from user to other
    const [, , other] = await ethers.getSigners();
    await savingCore.connect(user).transferFrom(
      await user.getAddress(), await other.getAddress(), 0,
    );

    // Fund vault so claimInterest succeeds
    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    await usdc.connect(owner).approve(await vaultManager.getAddress(), expectedInterest);
    await vaultManager.connect(owner).fundVault(expectedInterest);

    // New owner claims interest
    await expect(
      savingCore.connect(other).claimInterest(0),
    ).to.emit(savingCore, "InterestClaimed");
  });

  // ─── 13. burn with pending interest → revert ───────────────────────────

  it("#13 — burn with pending interest → reverts PendingInterestExists", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // pendingInterest > 0 → burn should revert
    await expect(
      savingCore.connect(user).burn(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PendingInterestExists");
  });

  // ─── 14. burn after full claimInterest → succeeds ──────────────────────

  it("#14 — burn after full claimInterest → succeeds", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    const vaultBal = await vaultManager.vaultBalance();
    await vaultManager.connect(owner).withdrawVault(vaultBal);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimPrincipal(0);

    // Fund vault and claim interest
    const deposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    await usdc.connect(owner).approve(await vaultManager.getAddress(), expectedInterest);
    await vaultManager.connect(owner).fundVault(expectedInterest);
    await savingCore.connect(user).claimInterest(0);

    // pendingInterest == 0 → burn should succeed
    await savingCore.connect(user).burn(0);
    await expect(
      savingCore.ownerOf(0),
    ).to.be.reverted;
  });
});
