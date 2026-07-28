import { useState, useEffect } from 'react'
import { useWallet } from '../hooks/useWallet'
import { formatUSDC, shortAddress } from '../utils/format'
import { getNetworkName } from '../utils/networks'
import { Contract } from 'ethers'
import MockUSDCAbi from '../abi/MockUSDC.json'
import contractsConfig from '../config/contracts.json'

export default function ConnectWallet() {
  const { address, chainId, provider, isConnected, isCorrectNetwork, connect, switchNetwork } = useWallet()
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasMetaMask = typeof window !== 'undefined' && !!window.ethereum

  useEffect(() => {
    if (!address || !provider) {
      setUsdcBalance(0n)
      return
    }

    const usdc = new Contract(contractsConfig.MockUSDC, MockUSDCAbi, provider)
    usdc.balanceOf(address).then(setUsdcBalance).catch(() => setUsdcBalance(0n))
  }, [address, provider])

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      await connect()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kết nối thất bại')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitch = async () => {
    try {
      await switchNetwork(31337)
    } catch {
      setError('Không thể chuyển mạng')
    }
  }

  if (!hasMetaMask) {
    return (
      <button className="btn btn-outline" disabled>
        Cài MetaMask
      </button>
    )
  }

  if (!isConnected) {
    return (
      <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
        {loading ? 'Đang kết nối...' : 'Kết nối ví'}
      </button>
    )
  }

  if (!isCorrectNetwork && chainId !== null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 500 }}>
          Sai mạng ({getNetworkName(chainId)})
        </span>
        <button className="btn btn-danger" style={{ height: 34, fontSize: 12, padding: '0 14px' }} onClick={handleSwitch}>
          Chuyển mạng
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ textAlign: 'right' }}>
        <div className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
          {formatUSDC(usdcBalance)} <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF' }}>USDC</span>
        </div>
      </div>

      <span className="badge badge-success">
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: '#16A34A',
          boxShadow: '0 0 0 2px rgba(22,163,74,0.25)', display: 'inline-block',
        }} />
        {shortAddress(address ?? '')}
      </span>

      <span className="badge badge-info" style={{ fontSize: 11 }}>
        {chainId === 31337 ? '🟢' : '🔵'} {getNetworkName(chainId ?? 0)}
      </span>

      {error && <span style={{ fontSize: 11, color: '#DC2626' }}>{error}</span>}
    </div>
  )
}
