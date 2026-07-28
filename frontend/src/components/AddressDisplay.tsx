import { useState, useRef } from 'react'
import { Clipboard, Check } from 'lucide-react'
import { truncateAddress } from '../utils/format'
import './AddressDisplay.css'

interface AddressDisplayProps {
  address: string
  start?: number
  end?: number
}

export default function AddressDisplay({ address, start = 6, end = 4 }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = () => {
    if (!address || copied) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }

  if (!address) return <span className="address-display address-display--empty">—</span>

  return (
    <span className="address-display">
      <span className="address-display__text">{truncateAddress(address, start, end)}</span>
      <button
        className="address-display__copy-btn"
        onClick={handleCopy}
        aria-label="Copy wallet address"
      >
        <span className="address-display__tooltip">{copied ? 'Copied!' : 'Copy Address'}</span>
        {copied ? <Check size={14} /> : <Clipboard size={14} />}
      </button>
    </span>
  )
}
