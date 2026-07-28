import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { fixtureWithPlan } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";


describe("SavingCore — admin functions", function () {
  // ─── enablePlan: nonexistent planId → revert ──────────────────

  it("enablePlan(999) when 999 >= nextPlanId → reverts PlanNotFound", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).enablePlan(999),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── enablePlan: happy path ───────────────────────────────────

  it("enablePlan on disabled plan → succeeds, PlanEnabled event emitted", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).disablePlan(0);
    expect((await savingCore.plans(0)).enabled).to.equal(false);

    const tx = await savingCore.connect(owner).enablePlan(0);
    const receipt = await tx.wait();

    expect((await savingCore.plans(0)).enabled).to.equal(true);

    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "PlanEnabled");

    expect(event).to.not.be.null;
    expect(event!.args.planId).to.equal(0);
  });

  // ─── createPlan: min > max → revert ───────────────────────────

  it("createPlan with minDeposit > maxDeposit → reverts InvalidDepositRange", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(180, 400, toUSDC(1000), toUSDC(500), 450),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidDepositRange");
  });

  // ─── createPlan: zero tenor → revert ──────────────────────────

  it("createPlan with tenorDays = 0 → reverts InvalidTenor", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(0, 400, toUSDC(100), toUSDC(100_000), 450),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidTenor");
  });

  // ─── createPlan: zero APR → revert ────────────────────────────

  it("createPlan with aprBps = 0 → reverts InvalidApr", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(180, 0, toUSDC(100), toUSDC(100_000), 450),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidApr");
  });

  // ─── createPlan: penalty > MAX_PENALTY_BPS → revert ───────────

  it("createPlan with earlyWithdrawPenaltyBps = 3001 → reverts InvalidPenalty", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(180, 400, toUSDC(100), toUSDC(100_000), 3001),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_InvalidPenalty");
  });

  // ─── createPlan: penalty = MAX_PENALTY_BPS (exact ceiling) → ok

  it("createPlan with earlyWithdrawPenaltyBps = 3000 → succeeds (exact ceiling)", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).createPlan(180, 400, toUSDC(100), toUSDC(100_000), 3000),
    ).to.emit(savingCore, "PlanCreated");
  });

  // ─── createPlan: non-owner → revert ───────────────────────────

  it("non-owner calls createPlan → reverts (onlyOwner)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).createPlan(180, 400, toUSDC(100), toUSDC(100_000), 450),
    ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
  });

  // ─── updatePlan: nonexistent planId → revert ──────────────────

  it("updatePlan(999) when 999 >= nextPlanId → reverts PlanNotFound", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).updatePlan(999, 800),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── updatePlan: non-owner → revert ───────────────────────────

  it("non-owner calls updatePlan → reverts (onlyOwner)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).updatePlan(0, 800),
    ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
  });

  // ─── enablePlan: non-owner → revert ───────────────────────────

  it("non-owner calls enablePlan → reverts (onlyOwner)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).enablePlan(0),
    ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
  });

  // ─── disablePlan: nonexistent planId → revert ─────────────────

  it("disablePlan(999) when 999 >= nextPlanId → reverts PlanNotFound", async function () {
    const { savingCore, owner } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(owner).disablePlan(999),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotFound");
  });

  // ─── disablePlan: non-owner → revert ──────────────────────────

  it("non-owner calls disablePlan → reverts (onlyOwner)", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).disablePlan(0),
    ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
  });
});