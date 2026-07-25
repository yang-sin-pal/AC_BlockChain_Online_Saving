import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultManager } from "../../helpers/fixtures";

describe("VaultManager — setFeeReceiver", function () {
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
