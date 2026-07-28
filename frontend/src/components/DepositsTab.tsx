import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useContracts } from '../hooks/useContracts'
import { formatUSDC, formatBps, formatDate, timeUntil } from '../utils/format'
import './DepositsTab.css'

const GRACE_PERIOD_DAYS = 4

interface DepositInfo {
  id: bigint
  planId: bigint
  principal: bigint
  startAt: bigint
  maturityAt: bigint
  aprBpsAtOpen: number
  penaltyBpsAtOpen: number
  status: number
  interestClaimed: boolean
}

interface PlanInfo {
  tenorDays: number
  aprBps: number
}

interface DepositsTabProps {
  onNavigateToPlans?: () => void
}

type ModalType = 'early' | 'renew' | 'burn' | null

const STATUS_LABELS: Record<number, { label: string; badgeClass: string; emoji: string }> = {
  0: { label: 'Đang hoạt động', badgeClass: 'badge-success', emoji: '🟢' },
  1: { label: 'Đã đóng', badgeClass: 'badge-neutral', emoji: '⚫' },
  2: { label: 'Đã rút gốc', badgeClass: 'badge-warning', emoji: '🔵' },
  3: { label: 'Đã gia hạn thủ công', badgeClass: 'badge-info', emoji: '🟣' },
  4: { label: 'Đã tự gia hạn', badgeClass: 'badge-info', emoji: '🟠' },
}

const PAGE_SIZES = [10, 25, 50]

export default function DepositsTab({ onNavigateToPlans }: DepositsTabProps) {
  const { address, signer, isConnected } = useWallet()
  const { savingCore } = useContracts(signer)

  const [deposits, setDeposits] = useState<DepositInfo[]>([])
  const [planCache, setPlanCache] = useState<Record<string, PlanInfo>>({})
  const planCacheRef = useRef(planCache)
  planCacheRef.current = planCache
  const [pendingInterestMap, setPendingInterestMap] = useState<Record<string, bigint>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [subTab, setSubTab] = useState<'active' | 'history'>('active')
  const [historyPage, setHistoryPage] = useState(0)
  const [historyPageSize, setHistoryPageSize] = useState(15)
  const [paused, setPaused] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initialLoadDone = useRef(false)

  const [modal, setModal] = useState<ModalType>(null)
  const [modalDepositId, setModalDepositId] = useState<bigint | null>(null)

  const refresh = useCallback(() => setRefreshTrigger(n => n + 1), [])

  const fetchData = useCallback(async () => {
    if (!savingCore || !address) {
      setDeposits([])
      setLoading(false)
      return
    }

    try {
      setRefreshing(true)
      const nextId = await savingCore.nextDepositId()
      const pausedState = await savingCore.paused()
      setPaused(pausedState)

      const fetched: DepositInfo[] = []
      const pendingMap: Record<string, bigint> = {}
      const plansToFetch = new Set<string>()

      for (let i = 1n; i < nextId; i++) {
        const owner = await savingCore.ownerOf(i)
        if (owner.toLowerCase() !== address.toLowerCase()) continue

        const d = await savingCore.deposits(i)
        const info: DepositInfo = {
          id: i,
          planId: d.planId,
          principal: d.principal,
          startAt: d.startAt,
          maturityAt: d.maturityAt,
          aprBpsAtOpen: Number(d.aprBpsAtOpen),
          penaltyBpsAtOpen: Number(d.penaltyBpsAtOpen),
          status: Number(d.status),
          interestClaimed: d.interestClaimed,
        }
        fetched.push(info)
        plansToFetch.add(d.planId.toString())

        if (Number(d.status) === 2) {
          const pi = await savingCore.pendingInterest(i)
          if (pi > 0n) pendingMap[i.toString()] = pi
        }
      }

      const newPlanCache = { ...planCacheRef.current }
      for (const pid of plansToFetch) {
        if (newPlanCache[pid]) continue
        const p = await savingCore.plans(pid)
        newPlanCache[pid] = {
          tenorDays: Number(p.tenorDays),
          aprBps: Number(p.aprBps),
        }
      }

      fetched.sort((a, b) => Number(b.id - a.id))
      setDeposits(fetched)
      setPlanCache(newPlanCache)
      setPendingInterestMap(pendingMap)
      setError(null)
    } catch {
      setError('Không thể tải danh sách tiền gửi')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [savingCore, address])

  useEffect(() => {
    if (!initialLoadDone.current) {
      setLoading(true)
    }
    fetchData()
    initialLoadDone.current = true
  }, [fetchData, refreshTrigger])

  const activeDeposits = useMemo(() => deposits.filter(d => d.status === 0 || d.status === 2), [deposits])
  const historyDeposits = useMemo(() => deposits.filter(d => d.status === 1 || d.status === 3 || d.status === 4), [deposits])
  const totalHistoryPages = useMemo(() => Math.max(1, Math.ceil(historyDeposits.length / historyPageSize)), [historyDeposits, historyPageSize])

  const isMatured = (maturityAt: bigint): boolean => {
    return Math.floor(Date.now() / 1000) >= Number(maturityAt)
  }

  const isPastGrace = (maturityAt: bigint): boolean => {
    return Math.floor(Date.now() / 1000) >= Number(maturityAt) + GRACE_PERIOD_DAYS * 86400
  }

  const calcExpectedInterest = (d: DepositInfo): bigint | null => {
    if (d.interestClaimed) return null
    const plan = planCache[d.planId.toString()]
    if (!plan) return null
    return (d.principal * BigInt(d.aprBpsAtOpen) * BigInt(plan.tenorDays)) / (365n * 10_000n)
  }

  const getButtonConfig = (d: DepositInfo) => {
    const matured = isMatured(d.maturityAt)

    switch (d.status) {
      case 0:
        if (!matured) {
          return [
            { key: 'early', label: 'Rút trước hạn', style: 'btn-danger' as const, blockedByPause: false },
          ]
        }
        const buttons: { key: string; label: string; style: 'btn-success' | 'btn-outline' | 'btn-danger'; blockedByPause: boolean }[] = [
          { key: 'withdraw', label: 'Rút khi đáo hạn', style: 'btn-success' as const, blockedByPause: true },
          { key: 'claimPrincipal', label: 'Nhận gốc', style: 'btn-success' as const, blockedByPause: false },
          ...(d.interestClaimed ? [] : [{ key: 'claimInterest' as const, label: 'Nhận lãi' as const, style: 'btn-success' as const, blockedByPause: true }]),
          { key: 'renew', label: 'Gia hạn', style: 'btn-outline' as const, blockedByPause: true },
        ]
        if (isPastGrace(d.maturityAt)) {
          buttons.splice(3, 0, { key: 'autoRenew', label: 'Tự động gia hạn', style: 'btn-outline' as const, blockedByPause: true })
        }
        return buttons
      case 2:
        return [
          { key: 'claimInterest', label: 'Nhận lãi', style: 'btn-success' as const, blockedByPause: true },
          { key: 'renew', label: 'Gia hạn', style: 'btn-outline' as const, blockedByPause: true },
        ]
      case 1:
      case 3:
      case 4:
        return [
          { key: 'burn', label: 'Đốt NFT', style: 'btn-outline' as const, blockedByPause: false },
        ]
      default:
        return []
    }
  }

  const handleAction = async (depositId: bigint, action: string) => {
    if (!savingCore) return
    const actionKey = `${depositId.toString()}-${action}`
    setLoadingAction(actionKey)
    setError(null)

    try {
      let tx
      switch (action) {
        case 'withdraw':
          tx = await savingCore.withdrawAtMaturity(depositId)
          break
        case 'autoRenew':
          tx = await savingCore.autoRenewDeposit(depositId)
          break
        case 'early':
          setModalDepositId(depositId)
          setModal('early')
          setLoadingAction(null)
          return
        case 'claimPrincipal':
          tx = await savingCore.claimPrincipal(depositId)
          break
        case 'claimInterest':
          tx = await savingCore.claimInterest(depositId)
          break
        case 'renew':
          setModalDepositId(depositId)
          setRenewFetching(true)
          try {
            const nextId = await savingCore.nextPlanId()
            const plans: { id: bigint; tenorDays: number; aprBps: number }[] = []
            for (let i = 0n; i < nextId; i++) {
              const p = await savingCore.plans(i)
              if (p.enabled) {
                plans.push({ id: i, tenorDays: Number(p.tenorDays), aprBps: Number(p.aprBps) })
              }
            }
            setRenewPlans(plans)
            if (plans.length > 0) setRenewPlanId(plans[0].id)
          } catch {
            setError('Không thể tải danh sách kế hoạch')
          } finally {
            setRenewFetching(false)
          }
          setModal('renew')
          setLoadingAction(null)
          return
        case 'burn':
          setModalDepositId(depositId)
          setModal('burn')
          setLoadingAction(null)
          return
      }

      if (tx) {
        await tx.wait()
      }

      setModal(null)
      setModalDepositId(null)
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Giao dịch thất bại')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleConfirmEarly = async () => {
    if (!savingCore || modalDepositId === null) return
    const actionKey = `${modalDepositId.toString()}-early`
    setLoadingAction(actionKey)
    setError(null)
    try {
      const tx = await savingCore.earlyWithdraw(modalDepositId)
      await tx.wait()
      setModal(null)
      setModalDepositId(null)
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rút trước hạn thất bại')
    } finally {
      setLoadingAction(null)
    }
  }

  const [renewPlanId, setRenewPlanId] = useState<bigint>(0n)
  const [renewPlans, setRenewPlans] = useState<{ id: bigint; tenorDays: number; aprBps: number }[]>([])
  const [renewFetching, setRenewFetching] = useState(false)

  const handleConfirmRenew = async () => {
    if (!savingCore || modalDepositId === null) return
    const actionKey = `${modalDepositId.toString()}-renew`
    setLoadingAction(actionKey)
    setError(null)
    try {
      const tx = await savingCore.renewDeposit(modalDepositId, renewPlanId)
      await tx.wait()
      setModal(null)
      setModalDepositId(null)
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gia hạn thất bại')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleConfirmBurn = async () => {
    if (!savingCore || modalDepositId === null) return
    const actionKey = `${modalDepositId.toString()}-burn`
    setLoadingAction(actionKey)
    setError(null)
    try {
      const tx = await savingCore.burn(modalDepositId)
      await tx.wait()
      setModal(null)
      setModalDepositId(null)
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đốt NFT thất bại')
    } finally {
      setLoadingAction(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="empty-state">
        <p>Vui lòng kết nối ví để xem tiền gửi.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="deposits-list">
        {[1, 2, 3].map(i => (
          <div key={i} className="deposit-card deposit-card-skeleton">
            <div className="skeleton-line" style={{ width: '30%', height: 18 }} />
            <div className="skeleton-line" style={{ width: '50%', height: 14, marginTop: 12 }} />
            <div className="skeleton-line" style={{ width: '70%', height: 14, marginTop: 8 }} />
            <div className="skeleton-line" style={{ width: '40%', height: 14, marginTop: 8 }} />
          </div>
        ))}
      </div>
    )
  }

  if (deposits.length === 0) {
    return (
      <div className="empty-state">
        <p>Chưa có khoản gửi nào</p>
        {onNavigateToPlans && (
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onNavigateToPlans}>
            Mở tài khoản
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {paused && (
        <div className="pause-banner">
          <span>⚠️</span>
          <span>
            Hệ thống đang tạm dừng. Rút gốc, rút trước hạn và đốt NFT vẫn hoạt động.
          </span>
        </div>
      )}

      {refreshing && (
        <div className="toast toast-success" style={{ marginBottom: 12 }}>
          <span>🔄</span> Đang làm mới...
        </div>
      )}

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          <span>❌</span> {error}
        </div>
      )}

      <div className="deposit-tabs">
        <button
          className={`deposit-tab-btn${subTab === 'active' ? ' active' : ''}`}
          onClick={() => setSubTab('active')}
        >
          Số dư hoạt động
        </button>
        <button
          className={`deposit-tab-btn${subTab === 'history' ? ' active' : ''}`}
          onClick={() => { setSubTab('history'); setHistoryPage(0) }}
        >
          Lịch sử
        </button>
      </div>

      {subTab === 'active' && (
        <>
          <div className="deposits-list">
            {activeDeposits.length === 0 ? (
              <div className="empty-state">
                <p>Không có khoản gửi nào đang hoạt động.</p>
              </div>
            ) : activeDeposits.map(d => (
              <DepositCard
                key={d.id.toString()}
                deposit={d}
                plan={planCache[d.planId.toString()] ?? null}
                pendingInterest={pendingInterestMap[d.id.toString()] ?? null}
                paused={paused}
                expectedInterest={calcExpectedInterest(d)}
                buttons={getButtonConfig(d)}
                loadingAction={loadingAction}
                onAction={handleAction}
              />
            ))}
          </div>
        </>
      )}

      {subTab === 'history' && (
        <>
          {historyDeposits.length === 0 ? (
            <div className="empty-state">
              <p>Chưa có khoản gửi nào trong lịch sử.</p>
            </div>
          ) : (
            <>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Số tiền</th>
                    <th>Gói</th>
                    <th>APR</th>
                    <th>Kết thúc</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historyDeposits.slice(historyPage * historyPageSize, (historyPage + 1) * historyPageSize).map(d => {
                    const plan = planCache[d.planId.toString()]
                    const si = STATUS_LABELS[d.status]
                    return (
                      <tr key={d.id.toString()}>
                        <td className="font-mono">#{d.id.toString()}</td>
                        <td className="font-mono">{formatUSDC(d.principal)}</td>
                        <td>{plan ? `${plan.tenorDays} ngày` : '—'}</td>
                        <td className="font-mono">{formatBps(d.aprBpsAtOpen)}</td>
                        <td>{formatDate(Number(d.maturityAt))}</td>
                        <td><span className={`badge ${si.badgeClass}`}>{si.emoji} {si.label}</span></td>
                        <td>
                          <button className="btn btn-outline" style={{ height: 28, fontSize: 11, padding: '0 10px', whiteSpace: 'nowrap' }}
                            onClick={() => handleAction(d.id, 'burn')}
                            disabled={loadingAction === `${d.id.toString()}-burn`}>
                            {loadingAction === `${d.id.toString()}-burn` ? '...' : 'Đốt NFT'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="history-pagination">
                <span className="pagination-info">
                  {historyDeposits.length} khoản gửi
                </span>
                <div className="pagination-controls">
                  <button className="btn btn-outline" style={{ height: 30, fontSize: 12, padding: '0 12px' }}
                    disabled={historyPage === 0}
                    onClick={() => setHistoryPage(p => Math.max(0, p - 1))}>
                    ‹ Trước
                  </button>
                  <span className="pagination-pages">
                    {historyPage + 1} / {totalHistoryPages}
                  </span>
                  <button className="btn btn-outline" style={{ height: 30, fontSize: 12, padding: '0 12px' }}
                    disabled={historyPage >= totalHistoryPages - 1}
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages - 1, p + 1))}>
                    Sau ›
                  </button>
                  <select className="input" style={{ width: 80, height: 30, fontSize: 12, marginLeft: 8 }}
                    value={historyPageSize}
                    onChange={e => { setHistoryPageSize(Number(e.target.value)); setHistoryPage(0) }}>
                    {PAGE_SIZES.map(s => (
                      <option key={s} value={s}>{s} dòng</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {modal === 'early' && modalDepositId !== null && (
        <EarlyWithdrawModal
          deposit={deposits.find(d => d.id === modalDepositId)!}
          loading={loadingAction === `${modalDepositId.toString()}-early`}
          onConfirm={handleConfirmEarly}
          onClose={() => { setModal(null); setModalDepositId(null) }}
        />
      )}

      {modal === 'renew' && modalDepositId !== null && (
        <RenewModal
          plans={renewPlans}
          selectedPlanId={renewPlanId}
          onSelectPlan={setRenewPlanId}
          fetching={renewFetching}
          loading={loadingAction === `${modalDepositId.toString()}-renew`}
          onConfirm={handleConfirmRenew}
          onClose={() => { setModal(null); setModalDepositId(null) }}
        />
      )}

      {modal === 'burn' && modalDepositId !== null && (
        <BurnModal
          depositId={modalDepositId}
          loading={loadingAction === `${modalDepositId.toString()}-burn`}
          onConfirm={handleConfirmBurn}
          onClose={() => { setModal(null); setModalDepositId(null) }}
        />
      )}
    </div>
  )
}

function DepositCard({
  deposit: d,
  plan,
  pendingInterest,
  paused,
  expectedInterest,
  buttons,
  loadingAction,
  onAction,
}: {
  deposit: DepositInfo
  plan: PlanInfo | null
  pendingInterest: bigint | null
  paused: boolean
  expectedInterest: bigint | null
  buttons: { key: string; label: string; style: 'btn-success' | 'btn-danger' | 'btn-outline'; blockedByPause: boolean }[]
  loadingAction: string | null
  onAction: (id: bigint, action: string) => void
}) {
  const statusInfo = STATUS_LABELS[d.status] ?? { label: 'Không xác định', badgeClass: 'badge-neutral', emoji: '⚪' }
  const actionKey = `${d.id.toString()}`
  const isLoading = (action: string) => loadingAction === `${actionKey}-${action}`
  const planLabel = plan ? `${plan.tenorDays} ngày` : '—'

  const now = Math.floor(Date.now() / 1000)
  const matured = now >= Number(d.maturityAt)
  const totalDuration = Number(d.maturityAt - d.startAt)
  const elapsed = Math.min(Math.max(now - Number(d.startAt), 0), totalDuration)
  const progressPct = totalDuration > 0 ? Math.round((elapsed / totalDuration) * 100) : 0

  return (
    <div className="deposit-card">
      <div className="deposit-card__top-row">
        {/* NFT thumbnail */}
        <div className="deposit-card__nft-thumb">
          <div className="deposit-card__nft-seal" />
          <div className="deposit-card__nft-medallion">VN</div>
          <div className="deposit-card__nft-token">TOKEN #{d.id.toString()}</div>
          <div className="deposit-card__nft-plan">{planLabel}</div>
          <div className="deposit-card__nft-apr">{formatBps(d.aprBpsAtOpen)}</div>
        </div>

        {/* Center content */}
        <div className="deposit-card__content">
          <div className="deposit-card__status-row">
            <span className="deposit-card__id">#{d.id.toString()}</span>
            <span className={`badge ${statusInfo.badgeClass}`}>
              {statusInfo.emoji} {statusInfo.label}
            </span>
          </div>

          <div className="deposit-card__principal">
            {formatUSDC(d.principal)} <span className="deposit-card__principal-unit">USDC</span>
          </div>

          <div className="deposit-card__meta-row">
            <span>Gói {planLabel}</span>
            <span className="deposit-card__apr-value">APR {formatBps(d.aprBpsAtOpen)}</span>
            <span>Đáo hạn: {formatDate(Number(d.maturityAt))}</span>
            {d.status === 0 && !matured && (
              <span className="deposit-card__countdown">{timeUntil(Number(d.maturityAt))}</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="deposit-card__progress">
            <div className="deposit-card__progress-labels">
              <span>Bắt đầu {formatDate(Number(d.startAt))}</span>
              <span>Đáo hạn {formatDate(Number(d.maturityAt))}</span>
              {d.status === 0 && <span className="deposit-card__grace-label">+{GRACE_PERIOD_DAYS} ngày ân hạn</span>}
            </div>
            <div className="deposit-card__progress-track">
              <div
                className={`deposit-card__progress-fill${progressPct >= 100 ? ' is-mature' : ''}`}
                style={{ width: `${Math.min(progressPct, 100)}%` }}
              />
              {/* Maturity marker */}
              <div className="deposit-card__progress-marker" />
              {/* Grace band */}
              {d.status === 0 && <div className="deposit-card__progress-grace" />}
            </div>
          </div>

          {/* Interest info */}
          {expectedInterest !== null && (
            <div className="deposit-card__interest-row">
              Lãi dự kiến: <span className="deposit-card__interest-value">{formatUSDC(expectedInterest)} USDC</span>
            </div>
          )}
          {d.interestClaimed && d.status === 0 && (
            <div className="deposit-card__interest-claimed">✅ Đã nhận lãi</div>
          )}
          {pendingInterest !== null && pendingInterest > 0n && d.status === 2 && (
            <div className="deposit-card__pending-label">
              Còn {formatUSDC(pendingInterest)} USDC lãi chờ nhận
            </div>
          )}
        </div>

        {/* Action buttons column */}
        <div className="deposit-card__actions">
          {buttons.map(btn => {
            const blocked = btn.blockedByPause && paused
            return (
              <button
                key={btn.key}
                className={`btn ${btn.style}`}
                disabled={blocked || isLoading(btn.key)}
                onClick={() => onAction(d.id, btn.key)}
              >
                {isLoading(btn.key) ? 'Đang xử lý...' : btn.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EarlyWithdrawModal({
  deposit,
  loading,
  onConfirm,
  onClose,
}: {
  deposit: DepositInfo
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { penalty, receive } = (() => {
    const p = (deposit.principal * BigInt(deposit.penaltyBpsAtOpen)) / 10000n
    return { penalty: p, receive: deposit.principal - p }
  })()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal__title">Rút trước hạn</h3>
        <div className="modal__body">
          <div className="modal__warning">
            ⚠️ Khoản gửi sẽ bị phạt {formatBps(deposit.penaltyBpsAtOpen)} do rút trước hạn.
          </div>
          <div className="modal__row">
            <span>Số tiền gốc</span>
            <span className="font-mono">{formatUSDC(deposit.principal)} USDC</span>
          </div>
          <div className="modal__row">
            <span>Tiền phạt</span>
            <span className="font-mono" style={{ color: 'var(--color-danger)' }}>-{formatUSDC(penalty)} USDC</span>
          </div>
          <div className="modal__row modal__total">
            <span>Số tiền nhận được</span>
            <span className="font-mono" style={{ color: 'var(--color-success)', fontWeight: 700 }}>{formatUSDC(receive)} USDC</span>
          </div>
        </div>
        <div className="modal__actions">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Hủy</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Xác nhận rút'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RenewModal({
  plans,
  selectedPlanId,
  onSelectPlan,
  fetching,
  loading,
  onConfirm,
  onClose,
}: {
  plans: { id: bigint; tenorDays: number; aprBps: number }[]
  selectedPlanId: bigint
  onSelectPlan: (id: bigint) => void
  fetching: boolean
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal__title">Gia hạn khoản gửi</h3>
        <div className="modal__body">
          <label className="form-label">CHỌN GÓI MỚI</label>
          {fetching ? (
            <div className="skeleton-line" style={{ width: '100%', height: 44, marginTop: 6 }} />
          ) : (
            <select
              className="input"
              value={selectedPlanId.toString()}
              onChange={e => onSelectPlan(BigInt(e.target.value))}
            >
              {plans.map(p => (
                <option key={p.id.toString()} value={p.id.toString()}>
                  {p.tenorDays} ngày — {formatBps(p.aprBps)} APR
                </option>
              ))}
            </select>
          )}
          {!fetching && plans.length > 0 && (
            <div className="deposit-form__info" style={{ marginTop: 12 }}>
              {plans.filter(p => p.id === selectedPlanId).map(p => (
                <div key={p.id.toString()}>
                  <div className="deposit-form__info-row">
                    <span>Kỳ hạn</span>
                    <span className="font-mono">{p.tenorDays} ngày</span>
                  </div>
                  <div className="deposit-form__info-row">
                    <span>APR</span>
                    <span className="font-mono" style={{ color: 'var(--color-gold-text)' }}>{formatBps(p.aprBps)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal__actions">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Hủy</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading || fetching}>
            {loading ? 'Đang xử lý...' : 'Gia hạn'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BurnModal({
  depositId,
  loading,
  onConfirm,
  onClose,
}: {
  depositId: bigint
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal__title">Đốt NFT</h3>
        <div className="modal__body">
          <p>Bạn có chắc muốn đốt NFT #{depositId.toString()}? Hành động này không thể hoàn tác.</p>
        </div>
        <div className="modal__actions">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Hủy</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đốt NFT'}
          </button>
        </div>
      </div>
    </div>
  )
}
