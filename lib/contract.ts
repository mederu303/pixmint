// pixmint — コントラクトの読み出し（ウォレット不要。公開 RPC から読む）
import { createPublicClient, type Abi, type PublicClient } from 'viem';
import art from './PixMint.json';
import art4 from './PixMint4.json';
import { readChain, rpcTransport, type Ver } from './chains';
import { pxmToSvg } from '../src/pxm';

export const PIXMINT_ABI = art.abi as Abi;
export const PIXMINT4_ABI = art4.abi as Abi;
export const abiOf = (ver: Ver): Abi => (ver === 4 ? PIXMINT4_ABI : PIXMINT_ABI);
const addr = (chainId: number, ver: Ver) => readChain(chainId, ver)!.address;

const clients = new Map<number, PublicClient>();
export function client(chainId: number): PublicClient {
  let c = clients.get(chainId);
  if (!c) {
    const p = readChain(chainId) ?? readChain(chainId, 4);
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
  ver: Ver;
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
  /** 使っている色（チェーンのデータの並び。先頭が背景） */
  palette: string[];
  /** v4: スタンプとして出した作品 */
  stamp?: boolean;
  /** v4: 公式スタンプ（mederu が出した） */
  official?: boolean;
  /** v4: 使ったスタンプの id */
  stamps?: bigint[];
}

export async function readWork(chainId: number, id: bigint, ver: Ver = 3): Promise<WorkView> {
  const c = client(chainId);
  const address = addr(chainId, ver);
  const abi = abiOf(ver);
  const r = <T,>(functionName: string) => c.readContract({ address, abi, functionName, args: [id] }) as Promise<T>;
  const [data, title, owner, w, price, stamps] = await Promise.all([
    r<`0x${string}`>('data'),
    r<string>('title'),
    r<`0x${string}`>('ownerOf'),
    r<[`0x${string}`, number, number, number, number, boolean?, boolean?]>('works'),
    r<bigint>('listings'),
    ver === 4 ? r<readonly bigint[]>('stampsOf') : Promise.resolve(undefined),
  ]);
  // SVG はコントラクトの svg() と1バイトも違わない（test/run.mjs で確認済み）ので手元で組む。RPC が軽い
  return {
    chainId,
    ver,
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
    palette: paletteOf(hexToBytes(data)),
    ...(ver === 4 ? { stamp: !!w[5], official: !!w[6], stamps: [...(stamps ?? [])] } : {}),
  };
}

/** PXM の色の一覧（#rrggbb） */
function paletteOf(d: Uint8Array): string[] {
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return Array.from({ length: d[2] }, (_, i) => '#' + hex(d[3 + i * 3]) + hex(d[4 + i * 3]) + hex(d[5 + i * 3]));
}

export async function readTotal(chainId: number, ver: Ver = 3): Promise<bigint> {
  return (await client(chainId).readContract({
    address: addr(chainId, ver),
    abi: abiOf(ver),
    functionName: 'totalMinted',
  })) as bigint;
}

export async function readNum(chainId: number, functionName: 'mintPrice' | 'feeBps' | 'stampPrice', ver: Ver = 3): Promise<bigint> {
  return BigInt(
    (await client(chainId).readContract({ address: addr(chainId, ver), abi: abiOf(ver), functionName })) as
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
const known = new Map<string, Map<bigint, { size: number; colors: number; data?: string }>>();

/** 同じデータの作品の id（新しい順）。無ければ空 */
export async function findSameArt(chainId: number, pxmHex: string, size: number, colors: number, ver: Ver = 3): Promise<bigint[]> {
  const c = client(chainId);
  const address = addr(chainId, ver);
  const PIXMINT_ABI = abiOf(ver);
  const key = `${chainId}:${ver}`;
  let m = known.get(key);
  if (!m) known.set(key, (m = new Map()));
  const total = await readTotal(chainId, ver);
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

// ── みんなのスタンプ（v4）──
// コントラクトにスタンプだけの一覧は無いので、works(id) を全部読んでスタンプを拾う（batch で 1 回の JSON-RPC）。
// 作品が何千にもなったら、イベント（StampMinted）を読むインデクサーに替える
export interface StampView {
  chainId: number;
  id: bigint;
  title: string;
  creator: `0x${string}`;
  official: boolean;
  /** PXM（16 進）。Pix で絵に戻して押す */
  data: `0x${string}`;
  mintedAt: number;
}
const stampCache = new Map<number, { total: bigint; seen: Map<bigint, boolean>; list: StampView[] }>();

/** v4 のスタンプ（新しい順）。読んだ分は覚えておき、増えた分だけ読む。
 *  同時に呼ばれても 1 回だけ読む（開発中は React が effect を 2 回動かすので、二重に足していた） */
const stampLoading = new Map<number, Promise<StampView[]>>();
export function readStamps(chainId: number): Promise<StampView[]> {
  let p = stampLoading.get(chainId);
  if (!p) {
    p = loadStamps(chainId).finally(() => stampLoading.delete(chainId));
    stampLoading.set(chainId, p);
  }
  return p;
}
async function loadStamps(chainId: number): Promise<StampView[]> {
  const c = client(chainId);
  const address = addr(chainId, 4);
  const abi = PIXMINT4_ABI;
  let st = stampCache.get(chainId);
  if (!st) stampCache.set(chainId, (st = { total: 0n, seen: new Map(), list: [] }));
  const total = await readTotal(chainId, 4);
  const ids: bigint[] = [];
  for (let id = st.total + 1n; id <= total; id++) ids.push(id);
  const works = await Promise.all(
    ids.map((id) => c.readContract({ address, abi, functionName: 'works', args: [id] }) as Promise<[`0x${string}`, number, number, number, number, boolean, boolean]>),
  );
  const found = ids.filter((_, i) => works[i][5]);
  const more = await Promise.all(
    found.map(async (id) => {
      const w = works[ids.indexOf(id)];
      const [title, data] = await Promise.all([
        c.readContract({ address, abi, functionName: 'title', args: [id] }) as Promise<string>,
        c.readContract({ address, abi, functionName: 'data', args: [id] }) as Promise<`0x${string}`>,
      ]);
      return { chainId, id, title, creator: w[0], official: w[6], data, mintedAt: Number(w[1]) } satisfies StampView;
    }),
  );
  st.total = total;
  st.list = [...more.reverse(), ...st.list];
  return st.list;
}

/** v4: 作品が売れたときにスタンプの分を受け取る作者（公式・作品の作者は除く。売り手はこの中から呼ぶ側で外す） */
export async function readStampArtists(chainId: number, id: bigint): Promise<`0x${string}`[]> {
  return [...((await client(chainId).readContract({ address: addr(chainId, 4), abi: PIXMINT4_ABI, functionName: 'stampArtists', args: [id] })) as readonly `0x${string}`[])];
}
/** スタンプの作者たちの取り分（コントラクトの STAMP_BPS と同じ 8%） */
export const STAMP_BPS = 800n;
