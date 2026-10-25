'use client';
import { useState } from 'react';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { abiOf, client } from './contract';
import { deployment, type Ver } from './chains';

/** チェーン切り替え → 送信 → 確定待ち をひとまとめに */
export function useTx(chainId: number, ver: Ver = 3) {
  const { chainId: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(functionName: string, args: unknown[], value?: bigint) {
    setBusy(true);
    setError(null);
    try {
      if (walletChain !== chainId) await switchChainAsync({ chainId });
      const hash = await writeContractAsync({
        chainId,
        address: deployment(chainId, ver)!.address,
        abi: abiOf(ver),
        functionName,
        args,
        value,
      });
      const r = await client(chainId).waitForTransactionReceipt({ hash });
      if (r.status !== 'success') throw new Error('Transaction failed');
      return true;
    } catch (e) {
      const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
      setError(msg.split('\n')[0]);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, busy, error };
}
