import { Contract } from 'ethers'

export async function calcTotalInterestObligations(
  savingCore: Contract
): Promise<bigint> {
  return savingCore.totalOwedInterest()
}

export async function calcActivePrincipal(
  savingCore: Contract,
  nextDepositId: bigint
): Promise<bigint> {
  let total = 0n
  for (let i = 0n; i < nextDepositId; i++) {
    const d = await savingCore.deposits(i)
    const status = Number(d.status)
    if (status === 0) total += d.principal
  }
  return total
}

export function checkFundHealth(
  vaultBalance: bigint,
  totalObligations: bigint
): { isHealthy: boolean; ratio: number } {
  const required = (totalObligations * 110n) / 100n
  const ratio = required === 0n
    ? 100
    : Number((vaultBalance * 10000n) / required) / 100
  return {
    isHealthy: vaultBalance >= required,
    ratio: Math.min(ratio, 100),
  }
}
