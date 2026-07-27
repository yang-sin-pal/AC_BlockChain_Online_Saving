import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../../helpers/utils";
import { DEFAULT_TENOR, DEFAULT_APR, PENALTY, SECONDS_PER_DAY } from "../../helpers/constants";

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

  // ─── 1. claimInterest: vault funded → pays interest, principal stays ──

  it("#1 — claimInterest: pays interest from vault, principal stays in SavingCore", async function () {
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

  // ─── 2. claimInterest: interestClaimed flag set, status stays Active ──

  it("#2 — claimInterest: sets interestClaimed=true, status stays Active (0)", async function () {
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

  // ─── 4. claimInterest: double claim → revert ───────────────────────

  it("#4 — claimInterest: double claim → reverts NoPendingInterest", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    await expect(
      savingCore.connect(user).claimInterest(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NoPendingInterest");
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
    // Vault balance decreased by 0 (no vault call for InterestClaimed renewal)
    // Vault still has original 10,000 USDC minus what claimInterest took
  });

  // ─── 10. withdrawAtMaturity after claimInterest → principal only ──────

  it("#10 — withdrawAtMaturity after claimInterest → pays principal only, no vault call", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).withdrawAtMaturity(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();
    const deposit = await savingCore.deposits(0);

    expect(userBalAfter).to.equal(userBalBefore + deposit.principal);
    expect(vaultBalAfter).to.equal(vaultBalBefore); // no vault call
    expect(deposit.status).to.equal(1); // Withdrawn
  });

  // ─── 11. claimPrincipal after claimInterest → principal only ───────

  it("#11 — claimPrincipal after claimInterest → pays principal only, no vault call", async function () {
    const { savingCore, usdc, user, vaultManager } = await loadFixture(fixtureWithDeposit);

    await increaseTime(DEFAULT_TENOR * SECONDS_PER_DAY);
    await savingCore.connect(user).claimInterest(0);

    const userBalBefore = await usdc.balanceOf(await user.getAddress());
    const vaultBalBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).claimPrincipal(0);

    const userBalAfter = await usdc.balanceOf(await user.getAddress());
    const vaultBalAfter = await vaultManager.vaultBalance();
    const deposit = await savingCore.deposits(0);

    expect(userBalAfter).to.equal(userBalBefore + deposit.principal);
    expect(vaultBalAfter).to.equal(vaultBalBefore); // no vault call
    expect(deposit.status).to.equal(2); // PrincipalClaimed
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });
});
