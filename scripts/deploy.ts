import { ethers } from "hardhat";
import fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 1. Deploy MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed:", usdcAddress);

  // 2. Deploy VaultManager(usdc)
  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vaultManager = await VaultManager.deploy(usdcAddress);
  await vaultManager.waitForDeployment();
  const vmAddress = await vaultManager.getAddress();
  console.log("VaultManager deployed:", vmAddress);

  // 3. Deploy SavingCore(usdc, vaultManager)
  const SavingCore = await ethers.getContractFactory("SavingCore");
  const savingCore = await SavingCore.deploy(usdcAddress, vmAddress);
  await savingCore.waitForDeployment();
  const scAddress = await savingCore.getAddress();
  console.log("SavingCore deployed:", scAddress);

  // 4. Wire VaultManager ← SavingCore (ONE-TIME CALL)
  const txSetSC = await vaultManager.setSavingCore(scAddress);
  await txSetSC.wait();
  console.log("VaultManager.setSavingCore() done");

  // 5. Set fee receiver
  const txSetFee = await vaultManager.setFeeReceiver(deployer.address);
  await txSetFee.wait();
  console.log("VaultManager.setFeeReceiver() done");

  // 6. Save deployment artifact
  const network = await ethers.provider.getNetwork();
  const artifact = {
    network: network.name === "unknown" ? "localhost" : network.name,
    chainId: Number(network.chainId),
    MockUSDC: usdcAddress,
    SavingCore: scAddress,
    VaultManager: vmAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync("deployments", { recursive: true });
  const artifactPath = `deployments/${artifact.network}.json`;
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`Deployment artifact saved to ${artifactPath}`);
  console.log(JSON.stringify(artifact, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
