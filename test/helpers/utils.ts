import { ethers } from "hardhat";
import { USDC_UNIT } from "./constants";

export function toUSDC(n: number): bigint {
  return BigInt(n) * BigInt(USDC_UNIT);
}

export async function increaseTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}
