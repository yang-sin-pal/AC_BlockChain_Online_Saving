import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useContracts } from '../hooks/useContracts'
import { formatUSDC, parseUSDC, formatBps } from '../utils/format'
import { calcTotalInterestObligations, calcActivePrincipal, checkFundHealth } from '../utils/health'
import contractsConfig from '../config/contracts.json'
import AuditLog from './AuditLog'
import AddressDisplay from './AddressDisplay'
import './AdminTab.css'

interface PlanRow {
  id: number
  tenorDays: number
  aprBps: number
  penaltyBps: number
  minDeposit: bigint
  maxDeposit: bigint
  enabled: boolean
}

export default function AdminTab() {
  const { address, signer, isConnected } = useWallet()
  const { savingCore, vaultManager, usdc } = useContracts(signer)

  const [isOwner, setIsOwner] = useState(false)
  const [ownerCheckDone, setOwnerCheckDone] = useState(false)
  const [loading, setLoading] = useState(true)

  const [vaultBalance, setVaultBalance] = useState(0n)
  const [activePrincipal, setActivePrincipal] = useState(0n)
  const [totalObligations, setTotalObligations] = useState(0n)
  const [scPaused, setScPaused] = useState(false)
  const [vmPaused, setVmPaused] = useState(false)
  const [plans, setPlans] = useState<PlanRow[]>([])

  const [fundAmount, setFundAmount] = useState('')
  const [fundAllowance, setFundAllowance] = useState(0n)
  const [fundApproveLoading, setFundApproveLoading] = useState(false)
  const [fundLoading, setFundLoading] = useState(false)

  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const [currentFeeReceiver, setCurrentFeeReceiver] = useState('')
  const [newFeeReceiver, setNewFeeReceiver] = useState('')
  const [feeReceiverLoading, setFeeReceiverLoading] = useState(false)

  const [tenorDays, setTenorDays] = useState('')
  const [aprBps, setAprBps] = useState('')
  const [penaltyBps, setPenaltyBps] = useState('')
  const [minDeposit, setMinDeposit] = useState('')
  const [maxDeposit, setMaxDeposit] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const [toggleLoading, setToggleLoading] = useState<number | null>(null)
  const [pauseLoading, setPauseLoading] = useState<string | null>(null)

  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => setRefreshTrigger(n => n + 1), [])

  const fetchData = useCallback(async () => {
    if (!savingCore || !vaultManager || !usdc || !address) return
    setLoading(true)
    setError(null)

    try {
      const owner = await savingCore.owner()
      const isOwnerAddr = owner.toLowerCase() === address.toLowerCase()
      setIsOwner(isOwnerAddr)
      setOwnerCheckDone(true)

      if (!isOwnerAddr) {
        setLoading(false)
        return
      }

      const [vb, td, tp, scp, vmp, fr] = await Promise.all([
        vaultManager.vaultBalance(),
        savingCore.nextDepositId(),
        savingCore.nextPlanId(),
        savingCore.paused(),
        vaultManager.paused(),
        vaultManager.feeReceiver(),
      ])
      setVaultBalance(vb)
      setCurrentFeeReceiver(fr)

      setScPaused(scp)
      setVmPaused(vmp)

      const [obligations, activeP] = await Promise.all([
        calcTotalInterestObligations(savingCore, td),
        calcActivePrincipal(savingCore, td),
      ])
      setTotalObligations(obligations)
      setActivePrincipal(activeP)

      const planRows: PlanRow[] = []
      for (let i = 0n; i < tp; i++) {
        const p = await savingCore.plans(i)
        planRows.push({
          id: Number(i),
          tenorDays: Number(p.tenorDays),
          aprBps: Number(p.aprBps),
          penaltyBps: Number(p.earlyWithdrawPenaltyBps),
          minDeposit: p.minDeposit,
          maxDeposit: p.maxDeposit,
          enabled: p.enabled,
        })
      }
      setPlans(planRows)
    } catch {
      setError('Không thể tải dữ liệu quản trị')
    } finally {
      setLoading(false)
    }
  }, [savingCore, vaultManager, usdc, address])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  useEffect(() => {
    if (!usdc || !address) return
    usdc.allowance(address, contractsConfig.VaultManager).then(setFundAllowance).catch(() => setFundAllowance(0n))
  }, [usdc, address, fundAmount])

  const fundAmountParsed = parseUSDC(fundAmount)
  const fundApproved = fundAmountParsed > 0n && fundAllowance >= fundAmountParsed
  const withdrawParsed = parseUSDC(withdrawAmount)

  const health = checkFundHealth(vaultBalance, totalObligations)

  const surplus = vaultBalance > totalObligations ? vaultBalance - totalObligations : 0n
  const obligationPct = vaultBalance > 0n
    ? Math.min(Number((totalObligations * 10000n) / vaultBalance), 10000) / 100
    : 0

  const tdParsed = parseInt(tenorDays)
  const apParsed = parseInt(aprBps)
  const ppParsed = parseInt(penaltyBps)

  const tenorError = !isNaN(tdParsed) && tdParsed <= 0 ? 'Kỳ hạn phải lớn hơn 0' : ''
  const aprError = !isNaN(apParsed) && apParsed <= 0 ? 'APR phải lớn hơn 0' : ''
  const penaltyError = !isNaN(ppParsed) && (ppParsed > 3000 || ppParsed < 0)
    ? ppParsed > 3000 ? 'Phạt tối đa 3000 bps (30%)' : 'Phạt không thể âm'
    : ''

  const minDParsed = parseUSDC(minDeposit)
  const maxDParsed = parseUSDC(maxDeposit)
  const minMaxError = minDParsed > 0n && maxDParsed > 0n && minDParsed > maxDParsed
    ? 'Tối thiểu không thể lớn hơn tối đa'
    : ''

  const fundError = fundAmount && fundAmountParsed <= 0n ? 'Số tiền phải lớn hơn 0' : ''
  const withdrawError = withdrawAmount && (withdrawParsed <= 0n || withdrawParsed > vaultBalance)
    ? withdrawParsed <= 0n ? 'Số tiền phải lớn hơn 0' : 'Số tiền vượt quá số dư quỹ'
    : ''
  const feeReceiverError = newFeeReceiver && !/^0x[0-9a-fA-F]{40}$/.test(newFeeReceiver)
    ? 'Địa chỉ không hợp lệ'
    : ''

  const formatLimit = (value: bigint): string => {
    if (value === 0n) return 'Không giới hạn'
    return formatUSDC(value)
  }

  const handleFundApprove = async () => {
    if (!usdc || fundAmountParsed <= 0n) {
      setError('Số tiền không hợp lệ')
      return
    }
    setFundApproveLoading(true)
    setError(null)
    try {
      const tx = await usdc.approve(contractsConfig.VaultManager, fundAmountParsed, { gasLimit: 300_000n })
      await tx.wait()
      const newAllowance = await usdc.allowance(address, contractsConfig.VaultManager)
      setFundAllowance(newAllowance)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Phê duyệt thất bại')
    } finally {
      setFundApproveLoading(false)
    }
  }

  const handleFundVault = async () => {
    if (!vaultManager || fundAmountParsed <= 0n) {
      setError('Số tiền không hợp lệ')
      return
    }
    setFundLoading(true)
    setError(null)
    try {
      const tx = await vaultManager.fundVault(fundAmountParsed, { gasLimit: 300_000n })
      await tx.wait()
      setFundAmount('')
      setFundAllowance(0n)
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nạp quỹ thất bại')
    } finally {
      setFundLoading(false)
    }
  }

  const handleWithdrawVault = async () => {
    if (!vaultManager || withdrawParsed <= 0n || withdrawParsed > vaultBalance) {
      setError('Số tiền không hợp lệ')
      return
    }
    setWithdrawLoading(true)
    setError(null)
    try {
      const tx = await vaultManager.withdrawVault(withdrawParsed, { gasLimit: 300_000n })
      await tx.wait()
      setWithdrawAmount('')
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rút quỹ thất bại')
    } finally {
      setWithdrawLoading(false)
    }
  }

  const handleSetFeeReceiver = async () => {
    if (!vaultManager || !/^0x[0-9a-fA-F]{40}$/.test(newFeeReceiver)) {
      setError('Địa chỉ không hợp lệ')
      return
    }
    setFeeReceiverLoading(true)
    setError(null)
    try {
      const tx = await vaultManager.setFeeReceiver(newFeeReceiver, { gasLimit: 300_000n })
      await tx.wait()
      setNewFeeReceiver('')
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cập nhật địa chỉ thất bại')
    } finally {
      setFeeReceiverLoading(false)
    }
  }

  const handleCreatePlan = async () => {
    if (!savingCore) return
    const td = tdParsed
    const ap = apParsed
    const pp = ppParsed
    const minD = minDParsed
    const maxD = maxDParsed
    setCreateLoading(true)
    setError(null)
    try {
      const tx = await savingCore.createPlan(td, ap, minD, maxD, pp, { gasLimit: 300_000n })
      await tx.wait()
      setTenorDays('')
      setAprBps('')
      setPenaltyBps('')
      setMinDeposit('')
      setMaxDeposit('')
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tạo kế hoạch thất bại')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleTogglePlan = async (planId: number, enable: boolean) => {
    if (!savingCore) return
    setToggleLoading(planId)
    setError(null)
    try {
      const tx = enable
        ? await savingCore.enablePlan(planId, { gasLimit: 300_000n })
        : await savingCore.disablePlan(planId, { gasLimit: 300_000n })
      await tx.wait()
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Thay đổi trạng thái thất bại')
    } finally {
      setToggleLoading(null)
    }
  }

  const handleTogglePause = async () => {
    if (!savingCore || !vaultManager) return
    setError(null)
    try {
      const [scPausedNow, vmPausedNow] = await Promise.all([
        savingCore.paused(),
        vaultManager.paused(),
      ])
      const shouldPause = !scPausedNow && !vmPausedNow
      setPauseLoading(shouldPause ? 'pause' : 'unpause')
      if (shouldPause) {
        await (await savingCore.pause({ gasLimit: 300_000n })).wait()
        await (await vaultManager.pause({ gasLimit: 300_000n })).wait()
      } else {
        await (await savingCore.unpause({ gasLimit: 300_000n })).wait()
        await (await vaultManager.unpause({ gasLimit: 300_000n })).wait()
      }
      refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Thay đổi trạng thái thất bại')
    } finally {
      setPauseLoading(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="empty-state">
        <p>Vui lòng kết nối ví để xem trang quản trị.</p>
      </div>
    )
  }

  if (!ownerCheckDone || loading) {
    return (
      <div className="admin-loading">
        <div className="admin-stats" style={{ marginBottom: 20 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="admin-stat-card">
              <div className="skeleton-line" style={{ width: '60%', height: 12 }} />
              <div className="skeleton-line" style={{ width: '40%', height: 24, marginTop: 10 }} />
            </div>
          ))}
        </div>
        <div className="skeleton-line" style={{ width: '100%', height: 60 }} />
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="empty-state">
        <p>Chỉ admin mới có thể xem trang này.</p>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          <span>❌</span> {error}
        </div>
      )}

      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Số dư quỹ</div>
          <div className="admin-stat-value" style={{ color: 'var(--color-success)' }}>
            {formatUSDC(vaultBalance)} <span className="admin-stat-unit">USDC</span>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Tổng nghĩa vụ lãi</div>
          <div className="admin-stat-value" style={{ color: 'var(--color-danger)' }}>
            {formatUSDC(totalObligations)} <span className="admin-stat-unit">USDC</span>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Tổng tiền gửi hoạt động</div>
          <div className="admin-stat-value" style={{ color: 'var(--color-primary)' }}>
            {formatUSDC(activePrincipal)} <span className="admin-stat-unit">USDC</span>
          </div>
        </div>
      </div>

      <div className={`admin-health-banner${health.isHealthy ? ' healthy' : ' danger'}`}>
        <span className="admin-health-icon">{health.isHealthy ? '✅' : '🔴'}</span>
        <div className="admin-health-text">
          {health.isHealthy
            ? `Quỹ an toàn — Đủ khả năng trả lãi. Nợ lãi: ${formatUSDC(totalObligations)} USDC`
            : `CẢNH BÁO: Quỹ không đủ trả lãi! Số dư: ${formatUSDC(vaultBalance)} USDC — Nợ lãi: ${formatUSDC(totalObligations)} USDC`}
        </div>
      </div>

      {totalObligations > 0n && vaultBalance > 0n && (
        <div className="admin-health-metrics">
          <div className="admin-health-metric">
            <span className="admin-health-metric-label">Tỷ lệ nghĩa vụ lãi / Số dư quỹ</span>
            <strong className="admin-health-metric-value">{obligationPct}%</strong>
            <div className="admin-health-metric-bar">
              <div
                className={`admin-health-metric-fill${obligationPct >= 90 ? ' danger' : obligationPct >= 70 ? ' warning' : ' healthy'}`}
                style={{ width: `${Math.min(obligationPct, 100)}%` }}
              />
            </div>
          </div>
          <div className="admin-health-metric">
            <span className="admin-health-metric-label">Số dư có thể rút</span>
            <strong className="admin-health-metric-value" style={{ color: surplus > 0n ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {formatUSDC(surplus)} <span className="admin-stat-unit">USDC</span>
            </strong>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        {(scPaused || vmPaused) ? (
          <button
            className="btn btn-success"
            disabled={pauseLoading !== null}
            onClick={handleTogglePause}
          >
            {pauseLoading !== null ? 'Đang xử lý...' : 'Tiếp tục'}
          </button>
        ) : (
          <button
            className="btn btn-danger"
            disabled={pauseLoading !== null}
            onClick={handleTogglePause}
          >
            {pauseLoading !== null ? 'Đang xử lý...' : 'Tạm dừng'}
          </button>
        )}
      </div>

      {scPaused && (
        <div className="pause-banner" style={{ marginTop: 0 }}>
          <span>⚠️</span>
          <span>
            Tạm dừng sẽ ngăn: rút khi đáo hạn, nhận lãi, gia hạn, tự động gia hạn.
            {' '}<strong>Vẫn hoạt động:</strong> rút gốc (C1), rút trước hạn, đốt NFT.
          </span>
        </div>
      )}

      <div className="admin-vault-sections">
        <div className="admin-section">
          <h3 className="admin-section-title">Nạp tiền vào quỹ</h3>
        <div className="admin-form-row">
          <div className="admin-form-field">
            <label className="admin-form-label">SỐ TIỀN (USDC)</label>
            <input
              className="input"
              type="number"
              placeholder="0"
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              disabled={fundLoading}
            />
            {fundError && <div className="admin-field-error">{fundError}</div>}
          </div>
          <div className="admin-form-actions">
            <button
              className={`btn ${fundApproved ? 'btn-outline' : 'btn-primary'}`}
              disabled={fundAmountParsed <= 0n || fundApproved || fundApproveLoading || !!fundError}
              onClick={handleFundApprove}
            >
              {fundApproveLoading
                ? 'Đang phê duyệt...'
                : fundApproved
                  ? 'Đã phê duyệt ✅'
                  : 'Phê duyệt'}
            </button>
            <button
              className="btn btn-success"
              disabled={!fundApproved || fundLoading}
              onClick={handleFundVault}
            >
              {fundLoading ? 'Đang nạp tiền...' : 'Nạp tiền vào quỹ'}
            </button>
          </div>
        </div>
        <div className="admin-form-hint">
          Số dư quỹ hiện tại: {formatUSDC(vaultBalance)} USDC
        </div>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Rút tiền từ quỹ</h3>
        <div className="admin-form-row">
          <div className="admin-form-field">
            <label className="admin-form-label">SỐ TIỀN (USDC)</label>
            <input
              className="input"
              type="number"
              placeholder="0"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              disabled={withdrawLoading}
            />
            {withdrawError && <div className="admin-field-error">{withdrawError}</div>}
          </div>
          <div className="admin-form-actions">
            <button
              className="btn btn-danger"
              disabled={withdrawParsed <= 0n || withdrawParsed > vaultBalance || withdrawLoading || !!withdrawError}
              onClick={handleWithdrawVault}
            >
              {withdrawLoading ? 'Đang rút tiền...' : 'Rút tiền'}
            </button>
          </div>
        </div>
        <div className="admin-form-hint">
          Số dư quỹ hiện tại: {formatUSDC(vaultBalance)} USDC
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Người nhận phí</h3>
        <div className="admin-form-row">
          <div className="admin-form-field" style={{ flex: 1 }}>
            <label className="admin-form-label">ĐỊA CHỈ HIỆN TẠI</label>
            <div className="admin-address-display">
              {currentFeeReceiver
                ? <AddressDisplay address={currentFeeReceiver} />
                : 'Chưa thiết lập'}
            </div>
          </div>
        </div>
        <div className="admin-form-row">
          <div className="admin-form-field" style={{ flex: 1 }}>
            <label className="admin-form-label">ĐỊA CHỈ MỚI</label>
            <input
              className="input"
              type="text"
              placeholder="0x..."
              value={newFeeReceiver}
              onChange={e => setNewFeeReceiver(e.target.value)}
              disabled={feeReceiverLoading}
            />
            {feeReceiverError && <div className="admin-field-error">{feeReceiverError}</div>}
          </div>
          <div className="admin-form-actions">
            <button
              className="btn btn-primary"
              disabled={!/^0x[0-9a-fA-F]{40}$/.test(newFeeReceiver) || feeReceiverLoading || !!feeReceiverError}
              onClick={handleSetFeeReceiver}
            >
              {feeReceiverLoading ? 'Đang cập nhật...' : 'Cập nhật'}
            </button>
          </div>
        </div>
        {address && (
          <div className="admin-form-hint">
            <span
              style={{ cursor: 'pointer', color: 'var(--color-primary)', textDecoration: 'underline' }}
              onClick={() => setNewFeeReceiver(address)}
            >
              Dùng địa chỉ của tôi
            </span>
          </div>
        )}
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Tạo kế hoạch mới</h3>
        <div className="admin-form-grid">
          <div className="admin-form-field">
            <label className="admin-form-label">Kỳ hạn (ngày)</label>
            <input className="input" type="number" placeholder="180" value={tenorDays} onChange={e => setTenorDays(e.target.value)} disabled={createLoading} />
            {tenorError && <div className="admin-field-error">{tenorError}</div>}
          </div>
          <div className="admin-form-field">
            <label className="admin-form-label">APR (bps)</label>
            <input className="input" type="number" placeholder="400" value={aprBps} onChange={e => setAprBps(e.target.value)} disabled={createLoading} />
            {aprError && <div className="admin-field-error">{aprError}</div>}
          </div>
          <div className="admin-form-field">
            <label className="admin-form-label">Phạt (bps)</label>
            <input className="input" type="number" placeholder="450" value={penaltyBps} onChange={e => setPenaltyBps(e.target.value)} disabled={createLoading} />
            {penaltyError && <div className="admin-field-error">{penaltyError}</div>}
            <div className="admin-form-hint">Tối đa 3000 bps (30%)</div>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-label">Tối thiểu (USDC)</label>
            <input className="input" type="number" placeholder="100" value={minDeposit} onChange={e => setMinDeposit(e.target.value)} disabled={createLoading} />
            <div className="admin-form-hint">Để trống = không giới hạn</div>
          </div>
          <div className="admin-form-field">
            <label className="admin-form-label">Tối đa (USDC)</label>
            <input className="input" type="number" placeholder="50000" value={maxDeposit} onChange={e => setMaxDeposit(e.target.value)} disabled={createLoading} />
            {minMaxError && <div className="admin-field-error">{minMaxError}</div>}
            <div className="admin-form-hint">Để trống = không giới hạn</div>
          </div>
          <div className="admin-form-field admin-form-field-btn">
            <button className="btn btn-primary" onClick={handleCreatePlan} disabled={createLoading || !tenorDays || !aprBps || !penaltyBps || !minDeposit || !maxDeposit || !!tenorError || !!aprError || !!penaltyError || !!minMaxError} style={{ width: '100%', marginTop: 22 }}>
              {createLoading ? 'Đang tạo...' : 'Tạo kế hoạch'}
            </button>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Gói tiết kiệm</h3>
        <div className="admin-plan-table-wrap">
          <table className="admin-plan-table">
            <thead>
              <tr>
                <th>Gói</th>
                <th>Kỳ hạn</th>
                <th>APR</th>
                <th>Phạt sớm</th>
                <th>Min USDC</th>
                <th>Max USDC</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < plans.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                  <td className="admin-plan-name">{`Gói #${p.id}`}</td>
                  <td className="admin-plan-cell">{p.tenorDays} ngày</td>
                  <td className="admin-plan-cell admin-plan-apr">{formatBps(p.aprBps)}</td>
                  <td className="admin-plan-cell admin-plan-penalty">{formatBps(p.penaltyBps)}</td>
                  <td className="admin-plan-cell admin-plan-mono">{formatLimit(p.minDeposit)}</td>
                  <td className="admin-plan-cell admin-plan-mono">{formatLimit(p.maxDeposit)}</td>
                  <td>
                    <button
                      className="admin-plan-toggle"
                      onClick={() => handleTogglePlan(p.id, !p.enabled)}
                      disabled={toggleLoading === p.id}
                    >
                      <div className={`admin-plan-toggle-track${p.enabled ? ' on' : ''}`}>
                        <div className="admin-plan-toggle-thumb" />
                      </div>
                      <span style={{ fontSize: 12, color: p.enabled ? 'var(--color-success)' : 'var(--color-text-muted)', fontWeight: 500 }}>
                        {toggleLoading === p.id ? '...' : p.enabled ? 'Bật' : 'Tắt'}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    Chưa có kế hoạch nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <AuditLog savingCore={savingCore} vaultManager={vaultManager} />
      </div>
    </div>
  )
}
