import { useState, useEffect, useCallback } from 'react'
import { Contract, EventLog } from 'ethers'
import { formatUSDC } from '../utils/format'
import AddressDisplay from './AddressDisplay'
import './AuditLog.css'

const PAGE_SIZES = [10, 25, 50]

const EVENT_META: Record<string, { label: string; emoji: string; cls: string }> = {
  DepositOpened: { label: 'Deposit', emoji: '🟢', cls: 'deposit' },
  Withdrawn: { label: 'Withdraw', emoji: '🔴', cls: 'withdraw' },
  Renewed: { label: 'Renew', emoji: '🔵', cls: 'renew' },
  InterestClaimed: { label: 'Interest', emoji: '🟡', cls: 'interest' },
  VaultFunded: { label: 'Fund', emoji: '⚪', cls: 'fund' },
}

interface AuditRow {
  id: string
  blockNumber: number
  txHash: string
  eventName: string
  address: string
  amount: string
}

interface AuditLogProps {
  savingCore: Contract | null
  vaultManager: Contract | null
}

export default function AuditLog({ savingCore, vaultManager }: AuditLogProps) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!savingCore || !vaultManager) return
    setLoading(true)
    setError(null)
    try {
      const all: AuditRow[] = []
      let eventCounter = 0

      const pushEvent = (log: EventLog, name: string, addr: string, amt: string) => {
        all.push({
          id: `${log.transactionHash}-${eventCounter++}`,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          eventName: name,
          address: addr,
          amount: amt,
        })
      }

      const [deposits, withdrawns, reneweds, interests, funds] = await Promise.all([
        savingCore.queryFilter(savingCore.filters.DepositOpened(), 0, 'latest'),
        savingCore.queryFilter(savingCore.filters.Withdrawn(), 0, 'latest'),
        savingCore.queryFilter(savingCore.filters.Renewed(), 0, 'latest'),
        savingCore.queryFilter(savingCore.filters.InterestClaimed(), 0, 'latest'),
        vaultManager.queryFilter(vaultManager.filters.VaultFunded(), 0, 'latest'),
      ]) as [EventLog[], EventLog[], EventLog[], EventLog[], EventLog[]]

      for (const d of deposits) {
        pushEvent(d, 'DepositOpened', d.args.owner, formatUSDC(d.args.principal))
      }
      for (const w of withdrawns) {
        const interest = w.args.interest > 0n ? ` + ${formatUSDC(w.args.interest)}` : ''
        pushEvent(w, 'Withdrawn', w.args.owner, `${formatUSDC(w.args.principal)}${interest}`)
      }
      for (const r of reneweds) {
        pushEvent(r, 'Renewed', '', formatUSDC(r.args.newPrincipal))
      }
      for (const i of interests) {
        pushEvent(i, 'InterestClaimed', i.args.to, formatUSDC(i.args.amount))
      }
      for (const f of funds) {
        pushEvent(f, 'VaultFunded', f.args.from, formatUSDC(f.args.amount))
      }

      all.sort((a, b) => b.blockNumber - a.blockNumber)
      setRows(all)
    } catch {
      setError('Không thể tải nhật ký hoạt động')
    } finally {
      setLoading(false)
    }
  }, [savingCore, vaultManager])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize)

  useEffect(() => {
    setPage(0)
  }, [rows.length, pageSize])

  return (
    <div className="audit-section">
      <div className="audit-header">
        <h3 className="audit-title">NHẬT KÝ HOẠT ĐỘNG</h3>
        <div className="audit-controls">
          <button
            className="btn btn-outline audit-refresh-btn"
            onClick={fetchEvents}
            disabled={loading}
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
          <select
            className="input audit-page-size"
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} dòng</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: 12 }}>
          <span>❌</span> {error}
        </div>
      )}

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Sự kiện</th>
              <th>Địa chỉ</th>
              <th>Số tiền</th>
              <th>Block</th>
              <th>Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => {
              const meta = EVENT_META[r.eventName] ?? { label: r.eventName, emoji: '⚪', cls: '' }
              return (
                <tr key={r.id}>
                  <td>
                    <span className={`audit-badge audit-badge-${meta.cls}`}>
                      {meta.emoji} {meta.label}
                    </span>
                  </td>
                  <td className="audit-addr"><AddressDisplay address={r.address} /></td>
                  <td className="audit-amount">{r.amount}</td>
                  <td className="audit-block">{r.blockNumber}</td>
                  <td className="audit-txhash"><AddressDisplay address={r.txHash} /></td>
                </tr>
              )
            })}
            {pageRows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="audit-empty">Chưa có hoạt động nào.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} style={{ padding: 20 }}>
                  <div className="skeleton-line" style={{ width: '100%', height: 16 }} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="audit-pagination">
          <button
            className="btn btn-outline audit-page-btn"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ‹ Trước
          </button>
          <span className="audit-page-info">
            Trang {safePage + 1} / {totalPages}
          </span>
          <button
            className="btn btn-outline audit-page-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Sau ›
          </button>
        </div>
      )}
    </div>
  )
}
