import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";

describe("VaultManager — fundVault", function () {
  it("#1 — owner funds vault with 1000 USDC → balance increases, VaultFunded event", async function () {
    const { usdc, vaultManager, owner } = await loadFixture(deployVaultManager);

    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await expect(vaultManager.connect(owner).fundVault(toUSDC(1000)))
      .to.emit(vaultManager, "VaultFunded")
      .withArgs(await owner.getAddress(), toUSDC(1000));

    expect(await vaultManager.vaultBalance()).to.equal(toUSDC(1000));
  });

  it("#2 — non-owner calls fundVault → reverts", async function () {
    const { usdc, vaultManager, user } = await loadFixture(deployVaultManager);

    await usdc.connect(user).approve(await vaultManager.getAddress(), toUSDC(100));
    await expect(
      vaultManager.connect(user).fundVault(toUSDC(100))
    ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
  });

  it("#3 — fund with 0 amount → reverts with VaultManager_ZeroAmount", async function () {
    const { vaultManager, owner } = await loadFixture(deployVaultManager);

    await expect(
      vaultManager.connect(owner).fundVault(0)
    ).to.be.revertedWithCustomError(vaultManager, "VaultManager_ZeroAmount");
  });
});
