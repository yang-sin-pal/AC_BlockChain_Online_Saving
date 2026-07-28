import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../hooks/useWallet'
import { formatUSDC, shortAddress } from '../utils/format'
import { getNetworkName } from '../utils/networks'
import { Contract } from 'ethers'
import MockUSDCAbi from '../abi/MockUSDC.json'
import contractsConfig from '../config/contracts.json'

export default function ConnectWallet() {
  const { address, chainId, provider, signer, isConnected, isCorrectNetwork, connect, switchNetwork } = useWallet()
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const [faucetLoading, setFaucetLoading] = useState(false)
  const [faucetAmount, setFaucetAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null)

  const hasMetaMask = typeof window !== 'undefined' && !!window.ethereum

  const fetchBalance = useCallback(() => {
    if (!address || !provider) {
      setUsdcBalance(0n)
      return
    }
    const usdc = new Contract(contractsConfig.MockUSDC, MockUSDCAbi, provider)
    usdc.balanceOf(address).then(setUsdcBalance).catch(() => setUsdcBalance(0n))
  }, [address, provider])

  useEffect(() => {
    fetchBalance()
    if (provider) {
      provider.on('block', fetchBalance)
      return () => { void provider.off('block', fetchBalance) }
    }
  }, [fetchBalance, provider])

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

  const handleFaucet = async () => {
    if (!signer || !address) return
    const parsed = parseFloat(faucetAmount)
    if (isNaN(parsed) || parsed <= 0) { setError('Nhập số USDC hợp lệ'); return }
    const amount = BigInt(Math.floor(parsed * 1_000_000))
    setFaucetLoading(true)
    setFaucetMsg(null)
    setError(null)
    try {
      const usdc = new Contract(contractsConfig.MockUSDC, MockUSDCAbi, signer)
      const tx = await usdc.mint(address, amount)
      await tx.wait()
      setFaucetMsg(`✅ Nhận ${parsed.toLocaleString()} USDC thành công!`)
      setFaucetAmount('')
      fetchBalance()
      setTimeout(() => setFaucetMsg(null), 3000)
    } catch (err: unknown) {
      setFaucetMsg('❌ Thất bại')
      setError(err instanceof Error ? err.message : 'Mint thất bại')
    } finally {
      setFaucetLoading(false)
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" min="0" step="any"
          value={faucetAmount}
          onChange={(e) => setFaucetAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFaucet()}
          placeholder="Số USDC"
          style={{
            width: 70, height: 28, fontSize: 11, padding: '0 6px', border: '1px solid #ECE8E1',
            borderRadius: 6, background: '#fff', color: '#1F1F1F', outline: 'none',
          }}
        />
        <button className="btn btn-outline" style={{ height: 28, fontSize: 11, padding: '0 8px', whiteSpace: 'nowrap' }}
          onClick={handleFaucet} disabled={faucetLoading}>
          {faucetLoading ? 'Đang mint...' : 'Mint'}
        </button>
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

      {faucetMsg && <span style={{ fontSize: 11, color: '#16A34A' }}>{faucetMsg}</span>}
      {error && <span style={{ fontSize: 11, color: '#DC2626' }}>{error}</span>}
    </div>
  )
}
