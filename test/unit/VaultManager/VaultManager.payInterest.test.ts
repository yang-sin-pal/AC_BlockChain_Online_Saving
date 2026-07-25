import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";

describe("VaultManager — payInterest", function () {
  it("#16 — SavingCore calls payInterest(user, 100 USDC) → transfers tokens, InterestPaid event", async function () {
    const { usdc, savingCore, vaultManager, owner, user } = await loadFixture(deployVaultManager);

    // Fund vault
    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await vaultManager.connect(owner).fundVault(toUSDC(1000));

    // Impersonate SavingCore
    const savingCoreAddr = await savingCore.getAddress();
    await impersonateAccount(savingCoreAddr);
    const savingCoreSigner = await ethers.getSigner(savingCoreAddr);
    await ethers.provider.send("hardhat_setBalance", [savingCoreAddr, "0x56BC75E2D63100000"]);

    const userAddr = await user.getAddress();
    const userBalBefore = await usdc.balanceOf(userAddr);

    await expect(vaultManager.connect(savingCoreSigner).payInterest(userAddr, toUSDC(100)))
      .to.emit(vaultManager, "InterestPaid")
      .withArgs(userAddr, toUSDC(100));

    expect(await usdc.balanceOf(userAddr)).to.equal(userBalBefore + toUSDC(100));
  });

  it("#17 — external account calls payInterest → reverts with VaultManager_OnlySavingCore", async function () {
    const { vaultManager, user } = await loadFixture(deployVaultManager);

    await expect(
      vaultManager.connect(user).payInterest(await user.getAddress(), toUSDC(100))
    ).to.be.revertedWithCustomError(vaultManager, "VaultManager_OnlySavingCore");
  });
});
