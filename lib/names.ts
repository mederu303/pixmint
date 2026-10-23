// pixmint — アドレスを名前で出す
//   1. pixmint の表示名（コントラクトの displayName。作者が自分で付ける）
//   2. ENS の .eth
//   3. Basename（xxx.base.eth）  ※ 長くなりがちなので .eth の後
//   4. 0x1234…abcd
// アドレスは ETH でも Base でも同じ。表示名はチェーンごとに保存されるので、
// 作品のチェーンを先に見て、無ければ他の設定済みチェーンも見る。
import { createPublicClient, http, toCoinType, type PublicClient } from 'viem';
import { base, mainnet } from 'viem/chains';
import { PIX_CHAINS, pixChain } from './chains';
import { PIXMINT_ABI, client } from './contract';

let ens: PublicClient | null = null;
const cache = new Map<string, Promise<string | null>>();

async function pixName(address: `0x${string}`, preferChainId?: number): Promise<string | null> {
  const ids = PIX_CHAINS.map((p) => p.chain.id).sort((a, b) => (a === preferChainId ? -1 : b === preferChainId ? 1 : 0));
  for (const id of ids) {
    try {
      const n = (await client(id).readContract({
        address: pixChain(id)!.address,
        abi: PIXMINT_ABI,
        functionName: 'displayName',
        args: [address],
      })) as string;
      if (n) return n;
    } catch {}
  }
  return null;
}

async function ensName(address: `0x${string}`): Promise<string | null> {
  ens ??= createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_1 || undefined, { timeout: 6000 }),
  }) as PublicClient;
  try {
    const n = await ens.getEnsName({ address });
    if (n) return n;
  } catch {}
  try {
    return await ens.getEnsName({ address, coinType: toCoinType(base.id) });
  } catch {
    return null; // RPC に届かない（ローカル開発など）ときは短縮アドレスのまま
  }
}

export function lookupName(address: string, preferChainId?: number): Promise<string | null> {
  const key = `${address.toLowerCase()}:${preferChainId ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    const a = address as `0x${string}`;
    p = pixName(a, preferChainId).then((n) => n ?? ensName(a));
    cache.set(key, p);
  }
  return p;
}

/** 表示名を変えたあとに呼ぶ */
export function forgetName(address: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(address.toLowerCase())) cache.delete(k);
  // 画面中の <Name> に読み直させる（ヘッダーなど）
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NAME_EVENT, { detail: address.toLowerCase() }));
}

export const NAME_EVENT = 'pixmint:name';
