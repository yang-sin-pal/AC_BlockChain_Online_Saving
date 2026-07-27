import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
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

  it("#16 — payInterest called while paused → reverts with EnforcedPause", async function () {
    const { usdc, vaultManager, owner, savingCore } = await loadFixture(deployVaultManager);

    // Fund vault
    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await vaultManager.connect(owner).fundVault(toUSDC(1000));
    await vaultManager.connect(owner).pause();

    // Impersonate SavingCore
    const savingCoreAddr = await savingCore.getAddress();
    await impersonateAccount(savingCoreAddr);
    const savingCoreSigner = await ethers.getSigner(savingCoreAddr);
    await ethers.provider.send("hardhat_setBalance", [savingCoreAddr, "0x56BC75E2D63100000"]);

    // payInterest should revert when paused
    await expect(
      vaultManager.connect(savingCoreSigner).payInterest(await owner.getAddress(), toUSDC(100))
    ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
  });

  it("#17 — payInterest after unpause → succeeds", async function () {
    const { usdc, vaultManager, owner, savingCore } = await loadFixture(deployVaultManager);

    // Fund vault
    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await vaultManager.connect(owner).fundVault(toUSDC(1000));

    // Pause then unpause
    await vaultManager.connect(owner).pause();
    await vaultManager.connect(owner).unpause();

    // Impersonate SavingCore
    const savingCoreAddr = await savingCore.getAddress();
    await impersonateAccount(savingCoreAddr);
    const savingCoreSigner = await ethers.getSigner(savingCoreAddr);
    await ethers.provider.send("hardhat_setBalance", [savingCoreAddr, "0x56BC75E2D63100000"]);

    // payInterest should succeed after unpause
    const recipient = await owner.getAddress();
    const balBefore = await usdc.balanceOf(recipient);
    await vaultManager.connect(savingCoreSigner).payInterest(recipient, toUSDC(100));
    const balAfter = await usdc.balanceOf(recipient);

    expect(balAfter).to.be.greaterThan(balBefore);
  });
});
