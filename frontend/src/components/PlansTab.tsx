import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useContracts } from '../hooks/useContracts'
import { formatUSDC, parseUSDC, formatBps } from '../utils/format'
import contractsConfig from '../config/contracts.json'

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
  const [approved, setApproved] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)
  const [depositLoading, setDepositLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState(0n)
  const [fetching, setFetching] = useState(true)
  const [allowance, setAllowance] = useState(0n)

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
    usdc.balanceOf(address).then(setUsdcBalance).catch(() => setUsdcBalance(0n))
  }, [usdc, address])

  useEffect(() => {
    if (!usdc || !address || !savingCore) return
    usdc.allowance(address, contractsConfig.SavingCore).then(setAllowance).catch(() => setAllowance(0n))
    setApproved(false)
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

  const needsApprove = derived.amountNum > 0n && !approveLoading && !depositLoading

  useEffect(() => {
    if (!needsApprove || !approved) return
    if (allowance >= derived.amountNum) return
    setApproved(false)
  }, [needsApprove, approved, allowance, derived.amountNum])

  const handleApprove = async () => {
    if (!usdc || !derived.isValid) return
    setApproveLoading(true)
    setError(null)
    try {
      const tx = await usdc.approve(contractsConfig.SavingCore, derived.amountNum)
      await tx.wait()
      const newAllowance = await usdc.allowance(address, contractsConfig.SavingCore)
      setAllowance(newAllowance)
      if (newAllowance >= derived.amountNum) {
        setApproved(true)
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
      const tx = await savingCore.openDeposit(BigInt(selectedPlan.id), derived.amountNum)
      await tx.wait()
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
    return (
      <div className="plans-grid">
        {[1, 2, 3].map(i => (
          <div key={i} className="plan-card plan-card-skeleton">
            <div className="skeleton-line" style={{ width: '60%', height: 18 }} />
            <div className="skeleton-line" style={{ width: '40%', height: 14, marginTop: 8 }} />
            <div className="skeleton-line" style={{ width: '80%', height: 14, marginTop: 8 }} />
          </div>
        ))}
      </div>
    )
  }

  if (plans.length === 0) {
    return <div className="empty-state"><p>Không có kế hoạch tiết kiệm nào.</p></div>
  }

  const currentAllowance = (allowance >= derived.amountNum) && derived.isValid

  return (
    <div>
      <div className="plans-grid">
        {plans.map(plan => {
          const isSelected = selectedPlanId === plan.id
          const isDefault = plan.tenorDays === 180
          return (
            <button
              key={plan.id}
              className={`plan-card${isSelected ? ' selected' : ''}`}
              onClick={() => setSelectedPlanId(plan.id)}
            >
              {isDefault && <span className="plan-card__badge">Mặc định</span>}
              <div className="plan-card__tenor">{plan.tenorDays} ngày</div>
              <div className="plan-card__meta">
                <span className="plan-card__apr">APR {formatBps(plan.aprBps)}</span>
                <span className="plan-card__penalty">Phạt {formatBps(plan.penaltyBps)}</span>
              </div>
              <div className="plan-card__limits">
                {formatLimit(plan.minDeposit)} – {formatLimit(plan.maxDeposit)}
              </div>
              <div className="plan-card__grace">
                Kỳ hạn: {plan.tenorDays} ngày — includes {GRACE_PERIOD_DAYS} ngày ân hạn
              </div>
            </button>
          )
        })}
      </div>

      <div className="deposit-form card">
        <h2 className="deposit-form__title">MỞ TÀI KHOẢN TIẾT KIỆM</h2>

        <div className="deposit-form__cols">
          <div className="deposit-form__left">
            <div className="form-group">
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
              <div className="form-group">
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
            )}
          </div>

          <div className="deposit-form__right">
            {selectedPlan && (
              <>
                <div className="form-group">
                  <label className="form-label">THÔNG TIN GÓI</label>
                  <div className="deposit-form__info">
                    <div className="deposit-form__info-row">
                      <span>Kỳ hạn</span>
                      <span className="font-mono">{selectedPlan.tenorDays} ngày</span>
                    </div>
                    <div className="deposit-form__info-row">
                      <span>APR</span>
                      <span className="font-mono" style={{ color: 'var(--color-gold-text)' }}>{formatBps(selectedPlan.aprBps)}</span>
                    </div>
                    <div className="deposit-form__info-row">
                      <span>Phạt rút trước hạn</span>
                      <span className="font-mono" style={{ color: 'var(--color-danger)' }}>{formatBps(selectedPlan.penaltyBps)}</span>
                    </div>
                    <div className="deposit-form__info-row">
                      <span>Ân hạn</span>
                      <span className="font-mono">{GRACE_PERIOD_DAYS} ngày</span>
                    </div>
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
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
                  style={{ width: '100%', marginTop: 10 }}
                  disabled={!currentAllowance || depositLoading}
                  onClick={handleOpenDeposit}
                >
                  {depositLoading
                    ? 'Đang mở tài khoản...'
                    : 'Mở tài khoản tiết kiệm'}
                </button>
              </>
            )}

            {error && (
              <div className="toast toast-error" style={{ marginTop: 12 }}>
                <span>❌</span> {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
