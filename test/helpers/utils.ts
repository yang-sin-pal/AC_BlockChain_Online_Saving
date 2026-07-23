import { ethers } from "hardhat";
import { USDC_UNIT } from "./constants";

export function toUSDC(n: number): bigint {
  return BigInt(n) * BigInt(USDC_UNIT);
}

export async function increaseTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}

/**
 * Mirror of InterestLib.calculateInterest for test assertions.
 * Formula: (principal * aprBps * tenorDays) / (365 * 10000)
 * Integer truncation matches Solidity division.
 * @deprecated Will be replaced by on-chain InterestLib in section 3.2 GREEN.
 */
export function calculateExpectedInterest(
  principal: bigint,
  aprBps: number,
  tenorDays: number,
): bigint {
  return (principal * BigInt(aprBps) * BigInt(tenorDays)) / (365n * 10000n);
}
