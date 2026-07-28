import { useMemo } from 'react';
import { Contract, JsonRpcSigner } from 'ethers';
import SavingCoreAbi from '../abi/SavingCore.json';
import VaultManagerAbi from '../abi/VaultManager.json';
import MockUSDCAbi from '../abi/MockUSDC.json';
import contractsConfig from '../config/contracts.json';

export function useContracts(signer: JsonRpcSigner | null) {
  return useMemo(() => {
    if (!signer) {
      return { savingCore: null, vaultManager: null, usdc: null };
    }

    const savingCore = new Contract(
      contractsConfig.SavingCore,
      SavingCoreAbi,
      signer,
    );
    const vaultManager = new Contract(
      contractsConfig.VaultManager,
      VaultManagerAbi,
      signer,
    );
    const usdc = new Contract(
      contractsConfig.MockUSDC,
      MockUSDCAbi,
      signer,
    );

    return { savingCore, vaultManager, usdc };
  }, [signer]);
}
