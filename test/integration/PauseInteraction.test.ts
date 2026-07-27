import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployAllContractsFixture } from "../helpers/fixtures";
import { toUSDC, increaseTime } from "../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, PENALTY, SECONDS_PER_DAY } from "../helpers/constants";

/**
 * Integration tests for cross-contract pause interactions.
 *
 * Security model:
 * - VaultManager pause = complete vault freeze (no money out at all)
 * - SavingCore pause = blocks user operations (withdraw, renew, claimInterest)
 * - claimPrincipal always works (no whenNotPaused) — user can always get principal back
 * - claimInterest blocked during VaultManager pause (payInterest reverts)
 */
describe("Integration — Pause Interaction", function () {
  async function fixtureWithMaturedDeposit() {
    const base = await loadFixture(deployAllContractsFixture);
    const { savingCore, owner } = base;

    // Create plan
    await savingCore
      .connect(owner)
      .createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

    // User opens deposit
    const { user } = base;
    const amount = toUSDC(10_000);
    await savingCore.connect(user).openDeposit(0, amount);

    // Advance past maturity
    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);

    return { ...base, depositId: 0n, amount };
  }

  // ─── 1. VaultManager paused → claimPrincipal succeeds ────────────

  it("#1 — VaultManager paused → claimPrincipal succeeds (no vault dependency)", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause VaultManager (not SavingCore)
    await vaultManager.connect(owner).pause();

    // claimPrincipal should work — principal is in SavingCore, not vault
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    await savingCore.connect(user).claimPrincipal(0);
    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.be.greaterThan(userBalBefore);
    // Interest stored as pending
    expect(await savingCore.pendingInterest(0)).to.be.greaterThan(0);
  });

  // ─── 2. VaultManager paused → claimInterest reverts ──────────────

  it("#2 — VaultManager paused → claimInterest reverts (payInterest blocked)", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause VaultManager
    await vaultManager.connect(owner).pause();

    // claimInterest should revert — payInterest reverts due to vault pause
    await expect(
      savingCore.connect(user).claimInterest(0)
    ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
  });

  // ─── 3. VaultManager paused → withdrawAtMaturity reverts ─────────

  it("#3 — VaultManager paused → withdrawAtMaturity reverts (SavingCore whenNotPaused)", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause VaultManager
    await vaultManager.connect(owner).pause();

    // withdrawAtMaturity should revert — SavingCore has whenNotPaused
    await expect(
      savingCore.connect(user).withdrawAtMaturity(0)
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 4. Both paused → claimPrincipal still succeeds ──────────────

  it("#4 — Both SavingCore + VaultManager paused → claimPrincipal succeeds", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause both contracts
    await vaultManager.connect(owner).pause();
    await savingCore.connect(owner).pause();

    // claimPrincipal should still work — no whenNotPaused on either contract
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    await savingCore.connect(user).claimPrincipal(0);
    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.be.greaterThan(userBalBefore);
  });

  // ─── 5. Both paused → claimInterest reverts ──────────────────────

  it("#5 — Both SavingCore + VaultManager paused → claimInterest reverts", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause both contracts
    await vaultManager.connect(owner).pause();
    await savingCore.connect(owner).pause();

    // claimInterest should revert — SavingCore whenNotPaused fires first
    await expect(
      savingCore.connect(user).claimInterest(0)
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });

  // ─── 6. VaultManager unpause → claimInterest works again ─────────

  it("#6 — VaultManager unpause → claimInterest succeeds after vault unfreeze", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause then unpause VaultManager
    await vaultManager.connect(owner).pause();
    await vaultManager.connect(owner).unpause();

    // claimInterest should work now
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    await savingCore.connect(user).claimInterest(0);
    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.be.greaterThan(userBalBefore);
  });

  // ─── 7. claimPrincipal then unpause → claimInterest clears pending ─

  it("#7 — claimPrincipal (vault paused) then unpause → claimInterest clears pending", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause VaultManager, claim principal (interest goes to pending)
    await vaultManager.connect(owner).pause();
    await savingCore.connect(user).claimPrincipal(0);
    expect(await savingCore.pendingInterest(0)).to.be.greaterThan(0);

    // Unpause VaultManager
    await vaultManager.connect(owner).unpause();

    // claimInterest clears pending
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    await savingCore.connect(user).claimInterest(0);
    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.be.greaterThan(userBalBefore);
    expect(await savingCore.pendingInterest(0)).to.equal(0);
  });

  // ─── 8. VaultManager paused → earlyWithdraw succeeds ─────────────

  it("#8 — VaultManager paused → earlyWithdraw succeeds (no vault dependency)", async function () {
    const { savingCore, usdc, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause VaultManager
    await vaultManager.connect(owner).pause();

    // earlyWithdraw should work — penalty comes from SavingCore, not vault
    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    await savingCore.connect(user).earlyWithdraw(0);
    const userBalAfter = await usdc.balanceOf(await user.getAddress());

    expect(userBalAfter).to.be.greaterThan(userBalBefore);
  });

  // ─── 9. VaultManager paused → renewDeposit reverts ───────────────

  it("#9 — VaultManager paused → renewDeposit reverts (SavingCore whenNotPaused)", async function () {
    const { savingCore, owner, user, vaultManager } = await loadFixture(fixtureWithMaturedDeposit);

    // Pause VaultManager
    await vaultManager.connect(owner).pause();

    // renewDeposit should revert — SavingCore has whenNotPaused
    await expect(
      savingCore.connect(user).renewDeposit(0, 0)
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });
});
