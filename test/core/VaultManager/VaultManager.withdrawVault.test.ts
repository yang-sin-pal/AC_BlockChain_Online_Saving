import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";

describe("VaultManager — withdrawVault", function () {
  async function fundVaultFixture() {
    const base = await deployVaultManager();
    const { usdc, vaultManager, owner } = base;

    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await vaultManager.connect(owner).fundVault(toUSDC(1000));

    return base;
  }

  it("#4 — owner withdraws 500 from vault (balance=1000) → balance decreases, VaultWithdrawn event", async function () {
    const { usdc, vaultManager, owner } = await loadFixture(fundVaultFixture);

    await expect(vaultManager.connect(owner).withdrawVault(toUSDC(500)))
      .to.emit(vaultManager, "VaultWithdrawn")
      .withArgs(await owner.getAddress(), toUSDC(500));

    expect(await vaultManager.vaultBalance()).to.equal(toUSDC(500));
  });

  it("#5 — non-owner calls withdrawVault → reverts", async function () {
    const { vaultManager, user } = await loadFixture(fundVaultFixture);

    await expect(
      vaultManager.connect(user).withdrawVault(toUSDC(100))
    ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
  });

  it("#6 — owner withdraws more than vault balance → reverts with VaultManager_InsufficientBalance", async function () {
    const { vaultManager, owner } = await loadFixture(fundVaultFixture);

    await expect(
      vaultManager.connect(owner).withdrawVault(toUSDC(2000))
    ).to.be.revertedWithCustomError(vaultManager, "VaultManager_InsufficientBalance");
  });

  it("#7 — owner withdraws exact vault balance (zero dust left) → succeeds, balance = 0", async function () {
    const { vaultManager, owner } = await loadFixture(fundVaultFixture);

    await expect(vaultManager.connect(owner).withdrawVault(toUSDC(1000)))
      .to.emit(vaultManager, "VaultWithdrawn")
      .withArgs(await owner.getAddress(), toUSDC(1000));
    expect(await vaultManager.vaultBalance()).to.equal(0n);
  });
});
