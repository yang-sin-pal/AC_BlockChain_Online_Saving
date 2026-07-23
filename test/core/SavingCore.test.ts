import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { deployAllContractsFixture } from "../helpers/fixtures";
import { toUSDC } from "../helpers/utils";
import {
  DEFAULT_TENOR,
  DEFAULT_APR,
  PENALTY,
  SECONDS_PER_DAY,
} from "../helpers/constants";

describe("SavingCore — openDeposit", function () {
  /** Creates a default plan (planId 0) and returns it for convenience. */
  async function fixtureWithPlan() {
    const base = await loadFixture(deployAllContractsFixture);
    const { savingCore, owner } = base;

    await savingCore
      .connect(owner)
      .createPlan(DEFAULT_TENOR, DEFAULT_APR, toUSDC(100), toUSDC(100_000), PENALTY);

    return base;
  }

  // ─── 1. Happy path ────────────────────────────────────────────

  it("#1 — happy path: deposit created, NFT minted, tokens transferred", async function () {
    const { savingCore, usdc, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(1_000);

    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();

    // NFT minted to user
    expect(await savingCore.ownerOf(0)).to.equal(await user.getAddress());

    // Deposit stored correctly
    const deposit = await savingCore.deposits(0);
    expect(deposit.planId).to.equal(0);
    expect(deposit.principal).to.equal(amount);
    expect(deposit.status).to.equal(0); // Status.Active

    // Tokens moved from user → SavingCore (not VaultManager)
    expect(await usdc.balanceOf(await savingCore.getAddress())).to.equal(amount);
  });

  // ─── 2. DepositOpened event ───────────────────────────────────

  it("#2 — emits DepositOpened with correct args", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(500);

    const tx = await savingCore.connect(user).openDeposit(0, amount);
    const receipt = await tx.wait();

    // Parse the DepositOpened event from the receipt
    const iface = savingCore.interface;
    const event = receipt!.logs
      .map((log) => {
        try { return iface.parseLog(log); } catch { return null; }
      })
      .find((e) => e?.name === "DepositOpened");

    expect(event).to.not.be.null;
    expect(event!.args.depositId).to.equal(0);
    expect(event!.args.owner).to.equal(await user.getAddress());
    expect(event!.args.planId).to.equal(0);
    expect(event!.args.principal).to.equal(amount);
    expect(event!.args.aprBpsAtOpen).to.equal(DEFAULT_APR);

    // maturityAt: verify it matches expected formula
    const deposit = await savingCore.deposits(0);
    expect(event!.args.maturityAt).to.equal(deposit.maturityAt);
  });

  // ─── 3. APR snapshot immutability ─────────────────────────────

  it("#3 — APR snapshot: updatePlan after open does not change deposit's aprBpsAtOpen", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);

    // Open deposit with 400 bps APR
    await savingCore.connect(user).openDeposit(0, toUSDC(1_000));

    // Update plan APR to 800 bps
    await savingCore.connect(owner).updatePlan(0, 800);

    // Deposit's snapshot should still be 400
    const deposit = await savingCore.deposits(0);
    expect(deposit.aprBpsAtOpen).to.equal(DEFAULT_APR);
    expect(deposit.penaltyBpsAtOpen).to.equal(PENALTY);
  });

  // ─── 4. Disabled plan reverts ─────────────────────────────────

  it("#4 — disabled plan → reverts PlanNotEnabled", async function () {
    const { savingCore, owner, user } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(owner).disablePlan(0);

    // GREEN phase: the error will appear in ABI once openDeposit uses it in a revert
    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(1_000)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_PlanNotEnabled");
  });

  // ─── 5. Amount below minDeposit ───────────────────────────────

  it("#5 — amount below minDeposit → reverts DepositBelowMin", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    // minDeposit is toUSDC(100) from fixtureWithPlan
    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(50)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_DepositBelowMin");
  });

  // ─── 6. Amount above maxDeposit ───────────────────────────────

  it("#6 — amount above maxDeposit → reverts DepositAboveMax", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    // maxDeposit is toUSDC(100_000) from fixtureWithPlan
    await expect(
      savingCore.connect(user).openDeposit(0, toUSDC(200_000)),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_DepositAboveMax");
  });

  // ─── 7. Zero amount ───────────────────────────────────────────

  it("#7 — zero amount → reverts ZeroAmount", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await expect(
      savingCore.connect(user).openDeposit(0, 0),
    ).to.be.revertedWithCustomError(savingCore, "SavingCore_ZeroAmount");
  });

  // ─── 8. maturityAt exact value ────────────────────────────────

  it("#8 — maturityAt equals block.timestamp + tenorDays * 86400", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    const tx = await savingCore.connect(user).openDeposit(0, toUSDC(1_000));
    const receipt = await tx.wait();

    // Get the block timestamp of the openDeposit transaction
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const expectedStartAt = block!.timestamp;
    const expectedMaturity = expectedStartAt + DEFAULT_TENOR * SECONDS_PER_DAY;

    const deposit = await savingCore.deposits(0);
    expect(deposit.startAt).to.equal(expectedStartAt);
    expect(deposit.maturityAt).to.equal(expectedMaturity);
  });

  // ─── 9. Multiple deposits increment IDs ───────────────────────

  it("#9 — multiple deposits: nextDepositId increments, each gets unique NFT", async function () {
    const { savingCore, user } = await loadFixture(fixtureWithPlan);

    await savingCore.connect(user).openDeposit(0, toUSDC(1_000));
    await savingCore.connect(user).openDeposit(0, toUSDC(2_000));

    expect(await savingCore.nextDepositId()).to.equal(2);

    // Each NFT owned by user
    expect(await savingCore.ownerOf(0)).to.equal(await user.getAddress());
    expect(await savingCore.ownerOf(1)).to.equal(await user.getAddress());

    // Different principals
    const d0 = await savingCore.deposits(0);
    const d1 = await savingCore.deposits(1);
    expect(d0.principal).to.not.equal(d1.principal);
  });

  // ─── 10. Tokens in SavingCore, not VaultManager ───────────────

  it("#10 — tokens go to SavingCore, not VaultManager", async function () {
    const { savingCore, usdc, vaultManager, user } = await loadFixture(fixtureWithPlan);
    const amount = toUSDC(3_000);

    const vaultBefore = await vaultManager.vaultBalance();

    await savingCore.connect(user).openDeposit(0, amount);

    // SavingCore received the tokens
    expect(await usdc.balanceOf(await savingCore.getAddress())).to.equal(amount);

    // VaultManager balance unchanged
    expect(await vaultManager.vaultBalance()).to.equal(vaultBefore);
  });
});
