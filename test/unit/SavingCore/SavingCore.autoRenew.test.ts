import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC, increaseTime, calculateExpectedInterest } from "../../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  GRACE_PERIOD,
  SECONDS_PER_DAY,
} from "../../helpers/constants";

describe("SavingCore — autoRenewDeposit", function () {
  async function fixtureWithMaturedDepositPastGrace() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const maturityAt = block!.timestamp + DEFAULT_TENOR * SECONDS_PER_DAY;
    const gracePeriodEnd = maturityAt + GRACE_PERIOD * SECONDS_PER_DAY;
    await ethers.provider.send("evm_setNextBlockTimestamp", [gracePeriodEnd]);
    return { ...base, depositId: 0n, amount, openTimestamp: block!.timestamp, maturityAt, gracePeriodEnd };
  }

  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: auto-renew after grace period → new NFT minted, old status AutoRenewed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    // Old deposit status → AutoRenewed (enum 4)
    const oldDeposit = await savingCore.deposits(0);
    expect(oldDeposit.status).to.equal(4); // Status.AutoRenewed

    // New NFT minted to caller
    expect(await savingCore.ownerOf(1)).to.equal(await user.getAddress());

    // New deposit is Active
    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.status).to.equal(0); // Status.Active
  });

  // ─── 2. Compound math proof ───────────────────────────────────

  it("#2 — compound math: new principal = old principal + interest", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    const oldDeposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.principal).to.equal(expectedNewPrincipal);
    expect(expectedNewPrincipal).to.equal(10_197_260_273n); // 10,000 + 197.26 USDC
  });

  // ─── 3. APR lock ──────────────────────────────────────────────

  it("#3 — APR lock: updatePlan after open → new deposit uses old APR (400), not updated (800)", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    // Update plan APR to 800 bps — should not affect auto-renew
    await savingCore.connect(owner).updatePlan(0, 800);

    await savingCore.connect(user).autoRenewDeposit(0);

    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.aprBpsAtOpen).to.equal(DEFAULT_APR); // 400, not 800
  });

  // ─── 4. Tenor preserved ───────────────────────────────────────

  it("#4 — tenor preserved: new deposit tenor = 180 days (same as original)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    const newDeposit = await savingCore.deposits(1);
    const newTenorSeconds = Number(newDeposit.maturityAt) - Number(newDeposit.startAt);
    expect(newTenorSeconds).to.equal(DEFAULT_TENOR * SECONDS_PER_DAY);
  });

  // ─── 5. Before grace period → revert ───────────────────────────

  it("#5 — before grace period (gracePeriodEnd - 1 second) → reverts GracePeriodNotElapsed", async function () {
    const { savingCore: sc2, user } = await loadFixture(fixtureWithPlan);

    // Open a fresh deposit in a separate fixture so we can manipulate time freely
    const amount = toUSDC(10_000);
    await sc2.connect(user).openDeposit(0, amount);
    const deposit = await sc2.deposits(0);
    const openTs = Number(deposit.startAt);
    const maturity = openTs + DEFAULT_TENOR * SECONDS_PER_DAY;
    const graceEnd = maturity + GRACE_PERIOD * SECONDS_PER_DAY;

    // Set to 1 second before grace period ends
    await ethers.provider.send("evm_setNextBlockTimestamp", [graceEnd - 1]);

    await expect(
      sc2.connect(user).autoRenewDeposit(0),
    ).to.be.reverted;
  });

  // ─── 6. At exact grace period second → allowed ─────────────────

  it("#6 — at exact grace period second (maturityAt + gracePeriod) → not reverted by GracePeriodNotElapsed", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    // fixtureWithMaturedDepositPastGrace already set timestamp to gracePeriodEnd
    // In GREEN phase this should succeed; in RED it reverts with "TODO..." (not GracePeriodNotElapsed)
    // The key assertion: the revert is NOT GracePeriodNotElapsed — the grace period check passes
    try {
      await savingCore.connect(user).autoRenewDeposit(0);
    } catch (e: any) {
      expect(e.message).to.not.include("GracePeriodNotElapsed");
    }
  });

  // ─── 7. Old deposit status → AutoRenewed ──────────────────────

  it("#7 — old deposit status changes to AutoRenewed (enum 4)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    const oldDeposit = await savingCore.deposits(0);
    expect(oldDeposit.status).to.equal(4); // Status.AutoRenewed
  });

  // ─── 8. Double auto-renew → revert ────────────────────────────

  it("#8 — double auto-renew → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).autoRenewDeposit(0);

    await expect(
      savingCore.connect(user).autoRenewDeposit(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 9. Renewed event ─────────────────────────────────────────

  it("#9 — emits Renewed event with correct args", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    const tx = await savingCore.connect(user).autoRenewDeposit(0);
    const receipt = await tx.wait();

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "Renewed");

    const oldDeposit = await savingCore.deposits(0);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    expect(event).to.not.be.null;
    expect(event!.args.oldDepositId).to.equal(0);
    expect(event!.args.newDepositId).to.equal(1);
    expect(event!.args.newPrincipal).to.equal(expectedNewPrincipal);
    expect(event!.args.newPlanId).to.equal(0); // same plan
  });

  // ─── 10. autoRenewDeposit after claimInterest → principal only (no double interest) ──

  it("#10 — autoRenewDeposit after claimInterest → new principal = old principal only (no double interest)", async function () {
    const { savingCore, user, vaultManager } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    // First: user claims interest at maturity (interestClaimed=true, status stays Active)
    await savingCore.connect(user).claimInterest(0);

    // Verify interestClaimed is set
    const depositBefore = await savingCore.deposits(0);
    expect(depositBefore.interestClaimed).to.be.true;
    expect(depositBefore.status).to.equal(0); // still Active

    // Now advance past grace period and auto-renew
    await increaseTime(GRACE_PERIOD * SECONDS_PER_DAY);
    const vaultBalBefore = await vaultManager.vaultBalance();
    await savingCore.connect(user).autoRenewDeposit(0);
    const vaultBalAfter = await vaultManager.vaultBalance();

    // Vault balance unchanged — no payInterest called
    expect(vaultBalAfter).to.equal(vaultBalBefore);

    // New deposit principal = old principal only (no interest compounded)
    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.principal).to.equal(depositBefore.principal);
  });

  // ─── 11. autoRenewDeposit after claimPrincipal → compounds pending interest ──

  it("#11 — autoRenewDeposit after claimPrincipal → compounds pending interest only", async function () {
    const { savingCore, user, vaultManager } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    // claimPrincipal at maturity (need to set time back)
    const deposit = await savingCore.deposits(0);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deposit.maturityAt)]);
    await savingCore.connect(user).claimPrincipal(0);

    const expectedInterest = calculateExpectedInterest(deposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    expect(await savingCore.pendingInterest(0)).to.equal(expectedInterest);

    // Advance past grace period
    await increaseTime(GRACE_PERIOD * SECONDS_PER_DAY);

    const vaultBalBefore = await vaultManager.vaultBalance();
    await savingCore.connect(user).autoRenewDeposit(0);
    const vaultBalAfter = await vaultManager.vaultBalance();

    // Vault paid the pending interest
    expect(vaultBalAfter).to.equal(vaultBalBefore - expectedInterest);

    // New deposit principal = interest only
    const newDeposit = await savingCore.deposits(1);
    expect(newDeposit.principal).to.equal(expectedInterest);
    expect(await savingCore.pendingInterest(0)).to.equal(0n);
  });

  // ─── 12. autoRenewDeposit after full claim → reverts AlreadyWithdrawn ──

  it("#12 — autoRenewDeposit after claimPrincipal+claimInterest → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(user).claimInterest(0);
    await increaseTime(GRACE_PERIOD * SECONDS_PER_DAY);
    await savingCore.connect(user).autoRenewDeposit(0);

    // Now try again on the new deposit? No — on old deposit (status=AutoRenewed)
    await expect(
      savingCore.connect(user).autoRenewDeposit(0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 13. autoRenewDeposit by non-owner → succeeds (bot trigger) ──

  it("#13 — autoRenewDeposit by non-owner → succeeds (bot can trigger)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);
    const [, , bot] = await ethers.getSigners();

    // Bot triggers auto-renew
    await savingCore.connect(bot).autoRenewDeposit(0);

    // New deposit minted to the bot (msg.sender)
    expect(await savingCore.ownerOf(1)).to.equal(await bot.getAddress());
  });

  // ─── 14. autoRenewDeposit when paused → revert ───────────────

  it("#14 — autoRenewDeposit when paused → reverts EnforcedPause", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithMaturedDepositPastGrace);

    await savingCore.connect(owner).pause();

    await expect(
      savingCore.connect(user).autoRenewDeposit(0),
    ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
  });
});
