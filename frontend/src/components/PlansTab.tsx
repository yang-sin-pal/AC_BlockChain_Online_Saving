import { useState, useEffect, useMemo, useRef } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useContracts } from '../hooks/useContracts'
import { formatUSDC, parseUSDC, formatBps } from '../utils/format'
import contractsConfig from '../config/contracts.json'
import './PlansTab.css'

const GRACE_PERIOD_DAYS = 4

interface Plan {
  id: number
  tenorDays: number
  aprBps: number
  penaltyBps: number
  minDeposit: bigint
  maxDeposit: bigint
}

interface PlansTabProps {
  onDepositSuccess: (depositId: bigint) => void
}

export default function PlansTab({ onDepositSuccess }: PlansTabProps) {
  const { address, signer, isConnected } = useWallet()
  const { savingCore, usdc } = useContracts(signer)

  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [approveLoading, setApproveLoading] = useState(false)
  const [depositLoading, setDepositLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState(0n)
  const [fetching, setFetching] = useState(true)
  const [allowance, setAllowance] = useState(0n)
  const approvedRef = useRef(false)

  useEffect(() => {
    if (!savingCore) return
    setFetching(true)
    savingCore.nextPlanId()
      .then(async (nextId: bigint) => {
        const fetched: Plan[] = []
        for (let i = 0n; i < nextId; i++) {
          const p = await savingCore.plans(i)
          if (p.enabled) {
            fetched.push({
              id: Number(i),
              tenorDays: Number(p.tenorDays),
              aprBps: Number(p.aprBps),
              penaltyBps: Number(p.earlyWithdrawPenaltyBps),
              minDeposit: p.minDeposit,
              maxDeposit: p.maxDeposit,
            })
          }
        }
        setPlans(fetched)
        if (fetched.length > 0 && selectedPlanId === null) {
          const defaultPlan = fetched.find(p => p.tenorDays === 180) ?? fetched[0]
          setSelectedPlanId(defaultPlan.id)
        }
        setFetching(false)
      })
      .catch(() => setFetching(false))
  }, [savingCore, selectedPlanId])

  useEffect(() => {
    if (!usdc || !address) {
      setUsdcBalance(0n)
      return
    }
    const fetchBal = () => usdc.balanceOf(address).then(setUsdcBalance).catch(() => setUsdcBalance(0n))
    fetchBal()
    const p = signer?.provider
    if (p) {
      p.on('block', fetchBal)
      return () => { void p.off('block', fetchBal) }
    }
  }, [usdc, address, signer])

  useEffect(() => {
    if (!usdc || !address || !savingCore) return
    usdc.allowance(address, contractsConfig.SavingCore).then((a: bigint) => {
      setAllowance(a)
      const amt = parseUSDC(amount)
      approvedRef.current = amt > 0n && a >= amt
    }).catch(() => setAllowance(0n))
  }, [usdc, address, savingCore, amount])

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  )

  const derived = useMemo(() => {
    const amountNum = parseUSDC(amount)
    if (!selectedPlan || amountNum <= 0n) {
      return { amountNum, tooLow: false, tooHigh: false, exceedsBalance: false, isValid: false }
    }
    const tooLow = selectedPlan.minDeposit > 0n && amountNum < selectedPlan.minDeposit
    const tooHigh = selectedPlan.maxDeposit > 0n && amountNum > selectedPlan.maxDeposit
    const exceedsBalance = amountNum > usdcBalance
    const isValid = !tooLow && !tooHigh && !exceedsBalance
    return { amountNum, tooLow, tooHigh, exceedsBalance, isValid }
  }, [amount, selectedPlan, usdcBalance])

  const estimatedInterest = useMemo(() => {
    if (!selectedPlan || derived.amountNum <= 0n || !derived.isValid) return null
    return (derived.amountNum * BigInt(selectedPlan.aprBps) * BigInt(selectedPlan.tenorDays)) / (365n * 10_000n)
  }, [selectedPlan, derived])

  const handleApprove = async () => {
    if (!usdc || !derived.isValid) return
    setApproveLoading(true)
    setError(null)
    try {
      const tx = await usdc.approve(contractsConfig.SavingCore, derived.amountNum, { gasLimit: 300_000n })
      await tx.wait()
      const newAllowance = await usdc.allowance(address, contractsConfig.SavingCore)
      setAllowance(newAllowance)
      if (newAllowance >= derived.amountNum) {
        approvedRef.current = true
      } else {
        setError('Phê duyệt không thành công. Vui lòng thử lại.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Phê duyệt thất bại')
    } finally {
      setApproveLoading(false)
    }
  }

  const handleOpenDeposit = async () => {
    if (!savingCore || !selectedPlan || !derived.isValid) return
    setDepositLoading(true)
    setError(null)
    try {
      const tx = await savingCore.openDeposit(BigInt(selectedPlan.id), derived.amountNum, { gasLimit: 300_000n })

      let receipt
      try {
        receipt = await tx.wait()
      } catch {
        receipt = await signer?.provider?.getTransactionReceipt(tx.hash)
      }

      if (receipt && receipt.status === 0) {
        throw new Error('Giao dịch bị từ chối')
      }

      const nextId = await savingCore.nextDepositId()
      const depositId = nextId - 1n
      onDepositSuccess(depositId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Mở tài khoản thất bại')
    } finally {
      setDepositLoading(false)
    }
  }

  const formatLimit = (value: bigint): string => {
    if (value === 0n) return 'Không giới hạn'
    return `${formatUSDC(value)} USDC`
  }

  if (!isConnected) {
    return (
      <div className="empty-state">
        <p>Vui lòng kết nối ví để xem kế hoạch tiết kiệm.</p>
      </div>
    )
  }

  if (fetching) {
    return <div className="empty-state"><p>Đang tải kế hoạch tiết kiệm...</p></div>
  }

  if (plans.length === 0) {
    return <div className="empty-state"><p>Không có kế hoạch tiết kiệm nào.</p></div>
  }

  const currentAllowance = (allowance >= derived.amountNum) && derived.isValid

  return (
    <div className="deposit-form card">
      <h2 className="deposit-form__title">MỞ TÀI KHOẢN TIẾT KIỆM</h2>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">GÓI TIẾT KIỆM</label>
        <select
          className="input deposit-form__select"
          value={selectedPlanId ?? ''}
          onChange={e => setSelectedPlanId(Number(e.target.value))}
        >
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>
              {plan.tenorDays} ngày — {formatBps(plan.aprBps)} APR
            </option>
          ))}
        </select>
      </div>

      {selectedPlan && (
        <div className="plan-highlight">
          <div className="plan-highlight__header">
            <span className="plan-highlight__tenor">{selectedPlan.tenorDays} ngày</span>
            {selectedPlan.tenorDays === 180 && (
              <span className="plan-highlight__badge">Mặc định</span>
            )}
          </div>
          <div className="plan-highlight__grid">
            <div className="plan-highlight__item">
              <span className="plan-highlight__item-label">APR</span>
              <span className="plan-highlight__item-value" style={{ color: 'var(--color-gold-text)' }}>{formatBps(selectedPlan.aprBps)}</span>
            </div>
            <div className="plan-highlight__item">
              <span className="plan-highlight__item-label">Phạt rút trước hạn</span>
              <span className="plan-highlight__item-value" style={{ color: 'var(--color-danger)' }}>{formatBps(selectedPlan.penaltyBps)}</span>
            </div>
            <div className="plan-highlight__item">
              <span className="plan-highlight__item-label">Hạn mức</span>
              <span className="plan-highlight__item-value">
                {selectedPlan.minDeposit === 0n ? 'Không giới hạn' : formatUSDC(selectedPlan.minDeposit)}{selectedPlan.maxDeposit !== 0n ? ` – ${formatUSDC(selectedPlan.maxDeposit)}` : ''} USDC
              </span>
            </div>
            <div className="plan-highlight__item">
              <span className="plan-highlight__item-label">Ân hạn</span>
              <span className="plan-highlight__item-value">{GRACE_PERIOD_DAYS} ngày</span>
            </div>
          </div>
        </div>
      )}

      {selectedPlan && (
        <>
          <div className="form-group" style={{ marginTop: 20 }}>
            <label className="form-label">SỐ TIỀN GỬI (USDC)</label>
            <input
              className={`input deposit-form__input${derived.amountNum > 0n ? (derived.isValid ? ' input-success' : ' input-error') : ''}`}
              type="number"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={depositLoading}
            />
            <div className="deposit-form__hints">
              <span className={`validation-hint${derived.tooLow || derived.tooHigh ? ' error' : ''}`}>
                {derived.tooLow
                  ? `Tối thiểu: ${formatLimit(selectedPlan.minDeposit)}`
                  : derived.tooHigh
                    ? `Tối đa: ${formatLimit(selectedPlan.maxDeposit)}`
                    : `Tối thiểu: ${formatLimit(selectedPlan.minDeposit)} — Tối đa: ${formatLimit(selectedPlan.maxDeposit)}`}
              </span>
              <span className="validation-hint">
                Số dư: {formatUSDC(usdcBalance)} USDC
              </span>
            </div>
            {derived.exceedsBalance && (
              <div className="validation-hint error">Số dư không đủ</div>
            )}
            {estimatedInterest !== null && derived.isValid && (
              <div className="deposit-form__interest">
                Lãi ước tính: <strong>{formatUSDC(estimatedInterest)} USDC</strong>
              </div>
            )}
          </div>

          <div className="deposit-form__actions">
            <button
              className="btn btn-primary"
              disabled={!derived.isValid || currentAllowance || approveLoading || depositLoading}
              onClick={handleApprove}
            >
              {approveLoading
                ? 'Đang phê duyệt...'
                : currentAllowance
                  ? 'Đã phê duyệt ✅'
                  : 'Phê duyệt USDC'}
            </button>

            <button
              className="btn btn-success"
              disabled={!currentAllowance || depositLoading}
              onClick={handleOpenDeposit}
            >
              {depositLoading
                ? 'Đang mở tài khoản...'
                : 'Mở tài khoản tiết kiệm'}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="toast toast-error" style={{ marginTop: 12 }}>
          <span>❌</span> {error}
        </div>
      )}
    </div>
  )
}
