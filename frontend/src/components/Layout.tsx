import type { ReactNode } from 'react'
import ConnectWallet from './ConnectWallet'
import './Layout.css'

export type TabId = 'plans' | 'deposits' | 'admin'

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'plans', label: 'Kế hoạch' },
  { id: 'deposits', label: 'Tiền gửi của tôi' },
  { id: 'admin', label: 'Quản trị' },
]

const TITLES: Record<TabId, string> = {
  plans: 'Kế hoạch tiết kiệm',
  deposits: 'Tiền gửi của tôi',
  admin: 'Quản trị hệ thống',
}

type TabRole = 'all' | 'user' | 'admin'

interface LayoutProps {
  children: ReactNode
  activeTab: TabId
  onTabChange?: (tab: TabId) => void
  role: TabRole
}

export default function Layout({ children, activeTab, onTabChange, role }: LayoutProps) {
  const tabs = role === 'admin'
    ? ALL_TABS.filter((t) => t.id === 'admin')
    : role === 'user'
      ? ALL_TABS.filter((t) => t.id !== 'admin')
      : ALL_TABS
  return (
    <div className="app-wrapper">
      <div className="app-container">
        <div className="app-header">
          <div className="app-brand">AC BLOCKCHAIN ONLINE SAVING</div>
          <ConnectWallet />
        </div>

        <h1 className="app-title">{TITLES[activeTab]}</h1>

        <nav className="app-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`app-nav-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="app-content">
          {children}
        </main>

        <footer className="app-footer">
          Built on Ethereum · Solidity 0.8.28
        </footer>
      </div>
    </div>
  )
}
