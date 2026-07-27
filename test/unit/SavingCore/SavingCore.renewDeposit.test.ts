import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC, calculateExpectedInterest } from "../../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  SECONDS_PER_DAY,
} from "../../helpers/constants";

describe("SavingCore — renewDeposit", function () {
  async function fixtureWithMaturedDeposit() {
    const base = await loadFixture(fixtureWithPlan);
    const { savingCore, owner, user } = base;
    const amount = toUSDC(10_000);
    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    // Second plan to renew INTO — different params to prove new plan is used
    await savingCore.connect(owner).createPlan(90, 600, toUSDC(100), toUSDC(100_000), 300);
    const maturityAt = block!.timestamp + DEFAULT_TENOR * SECONDS_PER_DAY;
    await ethers.provider.send("evm_setNextBlockTimestamp", [maturityAt]);
    return { ...base, depositId: 0n, amount, maturityAt, secondPlanId: 1n };
  }

  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: renew at exact maturityAt → new NFT minted, old status ManualRenewed", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    // Old deposit status → ManualRenewed (enum 2)
    const oldDeposit = await savingCore.deposits(depositId);
    expect(oldDeposit.status).to.equal(4); // Status.ManualRenewed

    // New NFT minted to caller
    const newDepositId = depositId + 1n;
    expect(await savingCore.ownerOf(newDepositId)).to.equal(await user.getAddress());

    // New deposit is Active
    const newDeposit = await savingCore.deposits(newDepositId);
    expect(newDeposit.status).to.equal(0); // Status.Active
  });

  // ─── 2. Compound math proof ───────────────────────────────────

  it("#2 — compound math: new principal = old principal + interest", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    const oldDeposit = await savingCore.deposits(depositId);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    const newDeposit = await savingCore.deposits(depositId + 1n);
    expect(newDeposit.principal).to.equal(expectedNewPrincipal);
    expect(expectedNewPrincipal).to.equal(10_197_260_273n); // 10,000 + 197.26 USDC
  });

  // ─── 3. New plan APR ──────────────────────────────────────────

  it("#3 — new deposit uses NEW plan's APR (600), not old plan's (400)", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    const newDeposit = await savingCore.deposits(depositId + 1n);
    expect(newDeposit.aprBpsAtOpen).to.equal(600); // Plan 1 APR, not plan 0
  });

  // ─── 4. New plan tenor ────────────────────────────────────────

  it("#4 — new deposit uses NEW plan's tenor (90 days), not old plan's (180)", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    const newDeposit = await savingCore.deposits(depositId + 1n);
    const newTenorSeconds = Number(newDeposit.maturityAt) - Number(newDeposit.startAt);
    expect(newTenorSeconds).to.equal(90 * SECONDS_PER_DAY);
  });

  // ─── 5. Before maturity → revert ───────────────────────────────

  it("#5 — before maturity (maturityAt - 1 second) → reverts NotYetMature", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(10_000);
    await savingCore.connect(user).openDeposit(0, amount);
    await savingCore.connect(owner).createPlan(90, 600, toUSDC(100), toUSDC(100_000), 300);

    const deposit = await savingCore.deposits(0);
    const maturity = Number(deposit.maturityAt);

    await ethers.provider.send("evm_setNextBlockTimestamp", [maturity - 1]);

    await expect(
      savingCore.connect(user).renewDeposit(0, 1),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotYetMature");
  });

  // ─── 6. Non-NFT-owner → revert ───────────────────────────────

  it("#6 — non-NFT-owner calls renewDeposit → reverts", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);
    const [, , other] = await ethers.getSigners();

    await expect(
      savingCore.connect(other).renewDeposit(depositId, secondPlanId),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_NotOwner");
  });

  // ─── 7. Double renew → revert ─────────────────────────────────

  it("#7 — double renew → reverts AlreadyWithdrawn", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(user).renewDeposit(depositId, secondPlanId);

    await expect(
      savingCore.connect(user).renewDeposit(depositId, secondPlanId),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_AlreadyWithdrawn");
  });

  // ─── 8. Nonexistent newPlanId → revert ────────────────────────

  it("#8 — nonexistent newPlanId → reverts PlanNotFound", async function () {
    const { savingCore, user, depositId } = await loadFixture(fixtureWithMaturedDeposit);

    await expect(
      savingCore.connect(user).renewDeposit(depositId, 999),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── 9. Disabled new plan → revert ────────────────────────────

  it("#9 — disabled new plan → reverts PlanNotEnabled", async function () {
    const { savingCore, owner, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    await savingCore.connect(owner).disablePlan(secondPlanId);

    await expect(
      savingCore.connect(user).renewDeposit(depositId, secondPlanId),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotEnabled");
  });

  // ─── 10. Renewed event ────────────────────────────────────────

  it("#10 — emits Renewed event with correct args", async function () {
    const { savingCore, user, depositId, secondPlanId } = await loadFixture(fixtureWithMaturedDeposit);

    const tx = await savingCore.connect(user).renewDeposit(depositId, secondPlanId);
    const receipt = await tx.wait();

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "Renewed");

    const oldDeposit = await savingCore.deposits(depositId);
    const expectedInterest = calculateExpectedInterest(oldDeposit.principal, DEFAULT_APR, DEFAULT_TENOR);
    const expectedNewPrincipal = oldDeposit.principal + expectedInterest;

    expect(event).to.not.be.null;
    expect(event!.args.oldDepositId).to.equal(depositId);
    expect(event!.args.newDepositId).to.equal(depositId + 1n);
    expect(event!.args.newPrincipal).to.equal(expectedNewPrincipal);
    expect(event!.args.newPlanId).to.equal(secondPlanId);
  });
});