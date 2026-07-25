import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";

describe("VaultManager — setSavingCore", function () {
  it("#20 — non-owner calls setSavingCore → reverts", async function () {
    const { vaultManager, user } = await loadFixture(deployVaultManager);

    await expect(
      vaultManager.connect(user).setSavingCore(await user.getAddress()),
    ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
  });

  it("#21 — setSavingCore called twice → reverts SavingCoreAlreadySet", async function () {
    const { vaultManager, savingCore, owner } = await loadFixture(deployVaultManager);

    // setSavingCore was already called in deployVaultManager fixture
    // Second call should revert
    await expect(
      vaultManager.connect(owner).setSavingCore(await savingCore.getAddress()),
    ).to.be.revertedWithCustomError(vaultManager, "VaultManager_SavingCoreAlreadySet");
  });
});
