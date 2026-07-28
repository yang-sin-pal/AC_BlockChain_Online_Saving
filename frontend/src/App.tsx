import { useState } from 'react'
import './App.css'
import Layout from './components/Layout'
import PlansTab from './components/PlansTab'
import DepositsTab from './components/DepositsTab'
import AdminTab from './components/AdminTab'
import type { TabId } from './components/Layout'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('plans')

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'plans' && <PlansTab />}
      {activeTab === 'deposits' && <DepositsTab />}
      {activeTab === 'admin' && <AdminTab />}
    </Layout>
  )
}
