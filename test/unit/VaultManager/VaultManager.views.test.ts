import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";
import { toUSDC } from "../../helpers/utils";

describe("VaultManager — views", function () {
  it("#18 — vaultBalance() returns correct amount after fund + withdraw", async function () {
    const { usdc, vaultManager, owner } = await loadFixture(deployVaultManager);

    await usdc.connect(owner).approve(await vaultManager.getAddress(), toUSDC(1000));
    await vaultManager.connect(owner).fundVault(toUSDC(1000));
    await vaultManager.connect(owner).withdrawVault(toUSDC(300));

    expect(await vaultManager.vaultBalance()).to.equal(toUSDC(700));
  });

  it("#19 — feeReceiver() returns zero address before set, correct address after", async function () {
    const { vaultManager, owner, user } = await loadFixture(deployVaultManager);

    expect(await vaultManager.feeReceiver()).to.equal(ethers.ZeroAddress);

    const userAddr = await user.getAddress();
    await vaultManager.connect(owner).setFeeReceiver(userAddr);
    expect(await vaultManager.feeReceiver()).to.equal(userAddr);
  });
});
