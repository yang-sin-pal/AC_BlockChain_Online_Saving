import { useState, useEffect } from 'react'
import './App.css'
import Layout from './components/Layout'
import PlansTab from './components/PlansTab'
import DepositsTab from './components/DepositsTab'
import AdminTab from './components/AdminTab'
import { useWallet } from './hooks/useWallet'
import { useContracts } from './hooks/useContracts'
import type { TabId } from './components/Layout'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('plans')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [depositsKey, setDepositsKey] = useState(0)
  const { address, signer } = useWallet()
  const { savingCore } = useContracts(signer)

  useEffect(() => {
    if (!savingCore || !address) { setIsAdmin(false); return }
    savingCore.owner().then((owner: string) => setIsAdmin(owner.toLowerCase() === address.toLowerCase()))
  }, [savingCore, address])

  const role = !address ? 'all' : isAdmin ? 'admin' : 'user'
  const effectiveTab: TabId = role === 'admin' ? 'admin' : activeTab

  const handleDepositSuccess = (depositId: bigint) => {
    setToast({ message: `Mở tài khoản thành công! Mã khoản gửi: #${depositId}`, type: 'success' })
    setActiveTab('deposits')
    setDepositsKey(k => k + 1)
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <Layout activeTab={effectiveTab} onTabChange={role === 'admin' ? undefined : setActiveTab} role={role}>
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span>{toast.message}</span>
        </div>
      )}
      {effectiveTab === 'plans' && <PlansTab onDepositSuccess={handleDepositSuccess} />}
      {effectiveTab === 'deposits' && <DepositsTab key={depositsKey} onNavigateToPlans={() => setActiveTab('plans')} />}
      {effectiveTab === 'admin' && <AdminTab />}
    </Layout>
  )
}
