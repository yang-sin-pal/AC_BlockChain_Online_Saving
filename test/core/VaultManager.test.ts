import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { toUSDC } from "../helpers/utils";

describe("VaultManager", function () {
  async function deployVaultManager() {
    const [owner, user] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    const SavingCore = await ethers.getContractFactory("SavingCore");
    const savingCore = await SavingCore.deploy();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    const vaultManager = await VaultManager.deploy(
      await usdc.getAddress(),
      await savingCore.getAddress()
    );

    await usdc.mint(await owner.getAddress(), toUSDC(10_000));
    await usdc.mint(await user.getAddress(), toUSDC(10_000));

    return { usdc, savingCore, vaultManager, owner, user };
  }

  // ─── fundVault ────────────────────────────────────────────────

  describe("fundVault", function () {
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

  // ─── withdrawVault ────────────────────────────────────────────

  describe("withdrawVault", function () {
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

  // ─── setFeeReceiver ───────────────────────────────────────────

  describe("setFeeReceiver", function () {
    it("#8 — owner sets fee receiver → feeReceiver() returns new addr, FeeReceiverUpdated event", async function () {
      const { vaultManager, owner, user } = await loadFixture(deployVaultManager);

      const userAddr = await user.getAddress();
      await expect(vaultManager.connect(owner).setFeeReceiver(userAddr))
        .to.emit(vaultManager, "FeeReceiverUpdated")
        .withArgs(userAddr);

      expect(await vaultManager.feeReceiver()).to.equal(userAddr);
    });

    it("#9 — non-owner calls setFeeReceiver → reverts", async function () {
      const { vaultManager, user } = await loadFixture(deployVaultManager);

      await expect(
        vaultManager.connect(user).setFeeReceiver(await user.getAddress())
      ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
    });
  });

  // ─── pause / unpause ──────────────────────────────────────────

  describe("pause / unpause", function () {
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

  // ─── payInterest ──────────────────────────────────────────────

  describe("payInterest", function () {
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

  // ─── views ────────────────────────────────────────────────────

  describe("views", function () {
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
});
