import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

declare global {
  interface Window {
    ethereum?: import('ethers').Eip1193Provider & {
      isMetaMask?: boolean;
      on?(event: string, cb: (...args: unknown[]) => void): void;
      removeListener?(event: string, cb: (...args: unknown[]) => void): void;
    };
  }
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    provider: null,
    signer: null,
    isConnected: false,
    isCorrectNetwork: false,
  });

  const getProviderState = useCallback(
    async (provider: BrowserProvider): Promise<WalletState> => {
      const accounts = await provider.listAccounts();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const address = accounts[0]?.address ?? null;
      const signer = address ? await provider.getSigner() : null;
      return {
        address,
        chainId,
        provider,
        signer,
        isConnected: !!address,
        isCorrectNetwork: chainId === 31337 || chainId === 11155111,
      };
    },
    [],
  );

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error('Ví không được tìm thấy. Vui lòng cài MetaMask.');
    }
    const provider = new BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const newState = await getProviderState(provider);
    setState(newState);
  }, [getProviderState]);

  const disconnect = useCallback(() => {
    setState({
      address: null,
      chainId: null,
      provider: null,
      signer: null,
      isConnected: false,
      isCorrectNetwork: false,
    });
  }, []);

  const switchNetwork = useCallback(async (targetChainId: number) => {
    const eth = window.ethereum;
    if (!eth || !('request' in eth)) return;
    const hexChainId = `0x${targetChainId.toString(16)}`;
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: number }).code === 4902
      ) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hexChainId,
              chainName: targetChainId === 31337 ? 'Localhost' : 'Sepolia',
              rpcUrls:
                targetChainId === 31337
                  ? ['http://127.0.0.1:8545']
                  : [
                      import.meta.env.VITE_SEPOLIA_RPC_URL ??
                        'https://rpc.sepolia.org',
                    ],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            },
          ],
        });
      }
    }
  }, []);

  // Auto-reconnect on page load
  useEffect(() => {
    if (!window.ethereum?.isMetaMask) return;
    const provider = new BrowserProvider(window.ethereum);
    provider
      .listAccounts()
      .then(async (accounts) => {
        if (accounts.length > 0) {
          const newState = await getProviderState(provider);
          setState(newState);
        }
      })
      .catch(() => {});
  }, [getProviderState]);

  // Listen for MetaMask events
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      if (!accounts || accounts.length === 0) {
        disconnect();
      } else if (state.provider) {
        getProviderState(state.provider).then(setState).catch(() => {});
      }
    };

    const handleChainChanged = () => {
      if (state.provider) {
        getProviderState(state.provider).then(setState).catch(() => {});
      }
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    return () => {
      if (eth.removeListener) {
        eth.removeListener('accountsChanged', handleAccountsChanged);
        eth.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [state.provider, getProviderState, disconnect]);

  return { ...state, connect, disconnect, switchNetwork };
}
