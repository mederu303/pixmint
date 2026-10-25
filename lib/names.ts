// pixmint — アドレスを名前で出す
//   1. pixmint の表示名（コントラクトの displayName。作者が自分で付ける）
//   2. ENS の .eth
//   3. Basename（xxx.base.eth）  ※ 長くなりがちなので .eth の後
//   4. 0x1234…abcd
// アドレスは ETH でも Base でも同じ。表示名はチェーンごとに保存されるので、
// 作品のチェーンを先に見て、無ければ他の設定済みチェーンも見る。
import { createPublicClient, http, isAddressEqual, namehash, parseAbi, toCoinType, type PublicClient } from 'viem';
import { base, mainnet } from 'viem/chains';
import { PIX4_CHAINS, PIX_CHAINS, rpcTransport } from './chains';
import { abiOf, client, short } from './contract';

/** kind: 'pix' = 作者が自分で付けた表示名（検証なし）/ 'ens' = .eth・Basename（逆引き＋正引きで照合済み） */
export type ResolvedName = { name: string; kind: 'pix' | 'ens' };

/** コントラクトと同じ規則: "." を含む・"0x" で始まる表示名は ENS / アドレスのなりすましになるので出さない */
export const isSafeDisplayName = (n: string) => !n.includes('.') && !/^0x/i.test(n);

let ens: PublicClient | null = null;
let baseClient: PublicClient | null = null;

// Basenames の L2Resolver（Base メインネット）。primary name は Base 側だけに設定されていることが多く、
// メインネットの ENS 逆引きでは出てこない（2026-10-23 base.base.eth で確認）
const BASENAMES_L2_RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD';
const L2_RESOLVER_ABI = parseAbi([
  'function name(bytes32 node) view returns (string)',
  'function addr(bytes32 node) view returns (address)',
]);

async function basename(address: `0x${string}`): Promise<string | null> {
  baseClient ??= createPublicClient({
    chain: base,
    transport: rpcTransport(8453, { timeout: 6000 }),
  }) as PublicClient;
  try {
    const reverse = namehash(`${address.toLowerCase().slice(2)}.80002105.reverse`);
    const name = await baseClient.readContract({ address: BASENAMES_L2_RESOLVER, abi: L2_RESOLVER_ABI, functionName: 'name', args: [reverse] });
    if (!name) return null;
    // 逆引きは誰でも好きな名前を書けるので、名前 → アドレスが一致するものだけ出す
    const forward = await baseClient.readContract({ address: BASENAMES_L2_RESOLVER, abi: L2_RESOLVER_ABI, functionName: 'addr', args: [namehash(name)] });
    return isAddressEqual(forward, address) ? name : null;
  } catch {
    return null;
  }
}

const cache =new Map<string, Promise<ResolvedName | null>>();

async function pixName(address: `0x${string}`, preferChainId?: number): Promise<string | null> {
  // v4 の表示名を先に（これから書くのは v4）、無ければ v3。好みのチェーンを先に見る
  const ds = [...PIX4_CHAINS, ...PIX_CHAINS].sort((a, b) => (a.chain.id === preferChainId ? -1 : b.chain.id === preferChainId ? 1 : 0) || b.ver - a.ver);
  for (const d of ds) {
    const id = d.chain.id;
    try {
      const n = (await client(id).readContract({
        address: d.address,
        abi: abiOf(d.ver),
        functionName: 'displayName',
        args: [address],
      })) as string;
      if (n && isSafeDisplayName(n)) return n;
    } catch {}
  }
  return null;
}

async function ensName(address: `0x${string}`): Promise<string | null> {
  ens ??= createPublicClient({
    chain: mainnet,
    transport: rpcTransport(1, { timeout: 6000 }),
  }) as PublicClient;
  try {
    const n = await ens.getEnsName({ address });
    if (n) return n;
  } catch {}
  try {
    const n = await ens.getEnsName({ address, coinType: toCoinType(base.id) });
    if (n) return n;
  } catch {}
  return basename(address); // RPC に届かない（ローカル開発など）ときは null → 短縮アドレスのまま
}

export function lookupName(address: string, preferChainId?: number): Promise<ResolvedName | null> {
  const key = `${address.toLowerCase()}:${preferChainId ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    const a = address as `0x${string}`;
    p = pixName(a, preferChainId).then(async (n): Promise<ResolvedName | null> => {
      if (n) return { name: n, kind: 'pix' };
      const e = await ensName(a);
      return e ? { name: e, kind: 'ens' } : null;
    });
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

/** 作者名を文字で: 表示名 / ENS / Basename、無ければ短いアドレス（カード画像・シェア文に使う） */
export async function artistName(address: string, preferChainId?: number): Promise<string> {
  const n = await lookupName(address, preferChainId).catch(() => null);
  return n?.name ?? short(address);
}
