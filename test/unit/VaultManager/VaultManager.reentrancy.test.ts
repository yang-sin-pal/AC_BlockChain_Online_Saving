import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { toUSDC } from "../../helpers/utils";

describe("VaultManager — reentrancy", function () {
  async function fixtureWithReentrantAttacker() {
    const [owner, user] = await ethers.getSigners();

    // Deploy ReentrantToken instead of MockUSDC
    const token = await ethers.getContractFactory("ReentrantToken").then((f) => f.deploy());

    const vaultManager = await ethers.getContractFactory("VaultManager")
      .then(async (f) => f.deploy(await token.getAddress()));

    const savingCore = await ethers.getContractFactory("SavingCore")
      .then(async (f) => f.deploy(await token.getAddress(), await vaultManager.getAddress()));

    await vaultManager.setSavingCore(await savingCore.getAddress());

    await token.mint(await owner.getAddress(), toUSDC(10_000));
    await token.mint(await user.getAddress(), toUSDC(10_000));

    // Fund vault
    await token.connect(owner).approve(await vaultManager.getAddress(), toUSDC(10_000));
    await vaultManager.connect(owner).fundVault(toUSDC(10_000));

    // Deploy attacker
    const attacker = await ethers.getContractFactory("ReentrantAttacker")
      .then(async (f) => f.deploy(await savingCore.getAddress(), await vaultManager.getAddress(), await token.getAddress()));

    // Mint tokens to attacker
    await token.mint(await attacker.getAddress(), toUSDC(10_000));

    return { token, savingCore, vaultManager, owner, user, attacker };
  }

  // ─── R5. Reentrancy on withdrawVault ───────────────────────────

  it("#R5 — reentrancy on withdrawVault → reverts ReentrancyGuardReentrantCall", async function () {
    const { token, vaultManager, attacker, owner } = await loadFixture(fixtureWithReentrantAttacker);

    // Transfer VaultManager ownership to attacker (2-step)
    await vaultManager.connect(owner).transferOwnership(await attacker.getAddress());
    await attacker.acceptVaultOwnership();

    // Set up attack: re-enter withdrawVault during token transfer callback
    await attacker.setAttack(4, 0, 0); // Target.WithdrawVault = 4
    await token.setHook(true, await attacker.getAddress());

    // Attack should revert — nonReentrant blocks the re-entrant call
    await expect(
      attacker.attackWithdrawVault(),
    ).to.be.revertedWithCustomError(vaultManager, "ReentrancyGuardReentrantCall");
  });
});
