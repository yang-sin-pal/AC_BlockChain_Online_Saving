export interface NetworkConfig {
  name: string;
  currency: string;
  explorer?: string;
}

export const NETWORKS: Record<number, NetworkConfig> = {
  31337: { name: 'Localhost', currency: 'ETH' },
  11155111: {
    name: 'Sepolia',
    currency: 'SepoliaETH',
    explorer: 'https://sepolia.etherscan.io',
  },
};

export function getNetworkName(chainId: number): string {
  return NETWORKS[chainId]?.name ?? `Unknown (${chainId})`;
}

export function isSupportedNetwork(chainId: number): boolean {
  return chainId in NETWORKS;
}
