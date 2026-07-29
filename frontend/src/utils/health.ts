import { Contract } from 'ethers'

export async function calcTotalInterestObligations(
  savingCore: Contract,
  nextDepositId: bigint
): Promise<bigint> {
  let total = 0n
  for (let i = 0n; i < nextDepositId; i++) {
    const deposit = await savingCore.deposits(i)
    const status = Number(deposit.status)
    if (status === 0) {
      const plan = await savingCore.plans(deposit.planId)
      const interest = (deposit.principal * BigInt(deposit.aprBpsAtOpen) * BigInt(plan.tenorDays)) / (365n * 10_000n)
      total += interest
    } else if (status === 2) {
      const pending = await savingCore.pendingInterest(i)
      total += pending
    }
  }
  return total
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
