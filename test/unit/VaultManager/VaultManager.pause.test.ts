import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";

describe("VaultManager — pause / unpause", function () {
  it("#10 — owner pauses → succeeds", async function () {
    const { vaultManager, owner } = await loadFixture(deployVaultManager);

    await expect(vaultManager.connect(owner).pause())
      .to.emit(vaultManager, "Paused")
      .withArgs(await owner.getAddress());
  });

  it("#11 — owner unpauses after pause → succeeds", async function () {
    const { vaultManager, owner } = await loadFixture(deployVaultManager);

    await vaultManager.connect(owner).pause();
    await expect(vaultManager.connect(owner).unpause())
      .to.emit(vaultManager, "Unpaused")
      .withArgs(await owner.getAddress());
  });

  it("#12 — non-owner calls pause → reverts", async function () {
    const { vaultManager, user } = await loadFixture(deployVaultManager);

    await expect(
      vaultManager.connect(user).pause()
    ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
  });

  it("#13 — non-owner calls unpause → reverts", async function () {
    const { vaultManager, owner, user } = await loadFixture(deployVaultManager);

    await vaultManager.connect(owner).pause();
    await expect(
      vaultManager.connect(user).unpause()
    ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
  });

  it("#14 — withdrawVault called while paused → reverts with EnforcedPause", async function () {
    const { usdc, vaultManager, owner } = await loadFixture(deployVaultManager);

    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await vaultManager.connect(owner).fundVault(toUSDC(1000));
    await vaultManager.connect(owner).pause();

    await expect(
      vaultManager.connect(owner).withdrawVault(toUSDC(100))
    ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
  });

  it("#15 — fundVault called while paused → succeeds (pause only blocks withdrawals)", async function () {
    const { usdc, vaultManager, owner } = await loadFixture(deployVaultManager);

    await vaultManager.connect(owner).pause();
    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(100));

    await expect(vaultManager.connect(owner).fundVault(toUSDC(100)))
      .to.emit(vaultManager, "VaultFunded")
      .withArgs(await owner.getAddress(), toUSDC(100));
  });
});
