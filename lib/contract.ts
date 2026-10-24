// pixmint — コントラクトの読み出し（ウォレット不要。公開 RPC から読む）
import { createPublicClient, type Abi, type PublicClient } from 'viem';
import art from './PixMint.json';
import { pixChain, rpcTransport } from './chains';
import { pxmToSvg } from '../src/pxm';

export const PIXMINT_ABI = art.abi as Abi;

const clients = new Map<number, PublicClient>();
export function client(chainId: number): PublicClient {
  let c = clients.get(chainId);
  if (!c) {
    const p = pixChain(chainId);
    if (!p) throw new Error(`chain ${chainId} is not configured`);
    // batch: 一覧で数十件を読むので JSON-RPC のバッチにまとめる
    c = createPublicClient({ chain: p.chain, transport: rpcTransport(chainId, { batch: true }) }) as PublicClient;
    clients.set(chainId, c);
  }
  return c;
}

const hexToBytes = (h: string) => Uint8Array.from((h.slice(2).match(/../g) ?? []).map((b) => parseInt(b, 16)));

export interface WorkView {
  chainId: number;
  id: bigint;
  title: string;
  creator: `0x${string}`;
  owner: `0x${string}`;
  size: number;
  colors: number;
  royaltyBps: number;
  mintedAt: number;
  price: bigint; // 0 = 出品していない
  svg: string;
}

export async function readWork(chainId: number, id: bigint): Promise<WorkView> {
  const c = client(chainId);
  const address = pixChain(chainId)!.address;
  const r = <T,>(functionName: string) =>
    c.readContract({ address, abi: PIXMINT_ABI, functionName, args: [id] }) as Promise<T>;
  const [data, title, owner, w, price] = await Promise.all([
    r<`0x${string}`>('data'),
    r<string>('title'),
    r<`0x${string}`>('ownerOf'),
    r<[`0x${string}`, number, number, number, number]>('works'),
    r<bigint>('listings'),
  ]);
  // SVG はコントラクトの svg() と1バイトも違わない（test/run.mjs で確認済み）ので手元で組む。RPC が軽い
  return {
    chainId,
    id,
    title,
    owner,
    creator: w[0],
    mintedAt: Number(w[1]),
    size: w[2],
    colors: w[3],
    royaltyBps: w[4],
    price,
    svg: pxmToSvg(hexToBytes(data)),
  };
}

export async function readTotal(chainId: number): Promise<bigint> {
  return (await client(chainId).readContract({
    address: pixChain(chainId)!.address,
    abi: PIXMINT_ABI,
    functionName: 'totalMinted',
  })) as bigint;
}

export async function readNum(chainId: number, functionName: 'mintPrice' | 'feeBps'): Promise<bigint> {
  return BigInt(
    (await client(chainId).readContract({ address: pixChain(chainId)!.address, abi: PIXMINT_ABI, functionName })) as
      | bigint
      | number,
  );
}

/** 実測（docs/DESIGN.md §3）からの mint gas の見積もり。base 13万 + 1バイト約391 */
export const estimateMintGas = (bytes: number, titleBytes: number) => 130_000 + 391 * bytes + 700 * titleBytes;

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// ── 同じ絵がもう mint されているか（コントラクトは二重 mint を止めないので、アプリで知らせる） ──
// works(id) のサイズ・色数が同じものだけ data(id) を読んで比べる。読んだものはチェーンごとに覚えておく
const known = new Map<number, Map<bigint, { size: number; colors: number; data?: string }>>();

/** 同じデータの作品の id（新しい順）。無ければ空 */
export async function findSameArt(chainId: number, pxmHex: string, size: number, colors: number): Promise<bigint[]> {
  const c = client(chainId);
  const address = pixChain(chainId)!.address;
  let m = known.get(chainId);
  if (!m) known.set(chainId, (m = new Map()));
  const total = await readTotal(chainId);
  const missing: bigint[] = [];
  for (let id = 1n; id <= total; id++) if (!m.has(id)) missing.push(id);
  // batch: true なので、まとめて1回の JSON-RPC になる
  await Promise.all(
    missing.map(async (id) => {
      const w = (await c.readContract({ address, abi: PIXMINT_ABI, functionName: 'works', args: [id] })) as [
        string,
        number,
        number,
        number,
        number,
      ];
      m!.set(id, { size: w[2], colors: w[3] });
    }),
  );
  const target = pxmHex.toLowerCase();
  const hits: bigint[] = [];
  await Promise.all(
    [...m.entries()]
      .filter(([, w]) => w.size === size && w.colors === colors)
      .map(async ([id, w]) => {
        w.data ??= ((await c.readContract({ address, abi: PIXMINT_ABI, functionName: 'data', args: [id] })) as string).toLowerCase();
        if (w.data === target) hits.push(id);
      }),
  );
  return hits.sort((a, b) => (a < b ? 1 : -1));
}
