export function formatUSDC(amount: bigint): string {
  const whole = amount / 1000000n;
  const fraction = amount % 1000000n;
  const fracStr = fraction.toString().padStart(6, '0').slice(0, 2);
  const wholeStr = whole.toString();
  const withCommas = wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withCommas}.${fracStr}`;
}

export function parseUSDC(input: string): bigint {
  const cleaned = input.replace(/,/g, '');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return 0n;
  return BigInt(Math.round(parsed * 1_000_000));
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('vi-VN');
}

export function timeUntil(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  if (now >= timestamp) return 'đã đáo hạn';
  const diffDays = Math.ceil((timestamp - now) / 86400);
  return `còn ${diffDays} ngày`;
}

export function truncateAddress(address: string, start = 6, end = 4): string {
  if (!address || address.length < start + end + 3) return address || ''
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function shortAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
