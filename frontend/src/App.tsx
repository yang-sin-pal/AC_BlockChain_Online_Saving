import { useState, useEffect } from 'react'
import './App.css'
import Layout from './components/Layout'
import PlansTab from './components/PlansTab'
import DepositsTab from './components/DepositsTab'
import AdminTab from './components/AdminTab'
import type { TabId } from './components/Layout'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('plans')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const handleDepositSuccess = (depositId: bigint) => {
    setToast({ message: `Mở tài khoản thành công! Mã khoản gửi: #${depositId}`, type: 'success' })
    setActiveTab('deposits')
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span>{toast.message}</span>
        </div>
      )}
      {activeTab === 'plans' && <PlansTab onDepositSuccess={handleDepositSuccess} />}
      {activeTab === 'deposits' && <DepositsTab />}
      {activeTab === 'admin' && <AdminTab />}
    </Layout>
  )
}
