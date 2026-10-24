// pixmint — どのチェーンで動かすか
//
// NEXT_PUBLIC_PIXMINT_<chainId> にコントラクトのアドレスが入っているチェーンだけを使う。
//   本番:       NEXT_PUBLIC_PIXMINT_1 / NEXT_PUBLIC_PIXMINT_8453
//   テストネット: NEXT_PUBLIC_PIXMINT_11155111 (Sepolia) / NEXT_PUBLIC_PIXMINT_84532 (Base Sepolia)
//   ローカル:   NEXT_PUBLIC_PIXMINT_31337 (hardhat node)
// RPC は NEXT_PUBLIC_RPC_<chainId> で上書きできる（無ければ viem の公開 RPC）。
// ※ Next はビルド時に process.env.NEXT_PUBLIC_* を文字列で埋め込むので、動的なキーでは読めない。全部書き出す。
import { fallback, http, type Chain, type HttpTransportConfig, type Transport } from 'viem';
import { base, baseSepolia, hardhat, mainnet, sepolia } from 'viem/chains';

type Hex = `0x${string}`;

const ENV: Record<number, { address?: string; rpc?: string }> = {
  1: { address: process.env.NEXT_PUBLIC_PIXMINT_1, rpc: process.env.NEXT_PUBLIC_RPC_1 },
  8453: { address: process.env.NEXT_PUBLIC_PIXMINT_8453, rpc: process.env.NEXT_PUBLIC_RPC_8453 },
  11155111: { address: process.env.NEXT_PUBLIC_PIXMINT_11155111, rpc: process.env.NEXT_PUBLIC_RPC_11155111 },
  84532: { address: process.env.NEXT_PUBLIC_PIXMINT_84532, rpc: process.env.NEXT_PUBLIC_RPC_84532 },
  31337: { address: process.env.NEXT_PUBLIC_PIXMINT_31337, rpc: process.env.NEXT_PUBLIC_RPC_31337 },
};

const CHAINS: Chain[] = [mainnet, base, sepolia, baseSepolia, hardhat];

/** 画面に出す短い名前 */
export const LABEL: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  11155111: 'Sepolia',
  84532: 'Base Sepolia',
  31337: 'Local',
};

export interface PixChain {
  chain: Chain;
  address: Hex;
  rpc?: string;
}

export const PIX_CHAINS: PixChain[] = CHAINS.filter((c) => /^0x[0-9a-fA-F]{40}$/.test(ENV[c.id]?.address ?? '')).map(
  (c) => ({ chain: c, address: ENV[c.id].address as Hex, rpc: ENV[c.id].rpc || undefined }),
);

/** 予備の公開 RPC。1つが落ちても次に切り替わる（2026-10-24 viem 既定の ethereum.reth.rs が落ちて一覧が読めなくなった） */
const BACKUP_RPC: Record<number, string[]> = {
  1: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://1rpc.io/eth'],
  8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'],
  11155111: ['https://ethereum-sepolia-rpc.publicnode.com'],
  84532: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
};

/** RPC の読み先: NEXT_PUBLIC_RPC_<id> → 予備の公開 RPC → viem の既定。順に試す */
export function rpcTransport(chainId: number, opts?: HttpTransportConfig): Transport {
  const chain = CHAINS.find((c) => c.id === chainId);
  const urls = [ENV[chainId]?.rpc, ...(BACKUP_RPC[chainId] ?? []), ...(chain?.rpcUrls.default.http ?? [])].filter(
    (u, i, a): u is string => !!u && a.indexOf(u) === i,
  );
  return urls.length > 1 ? fallback(urls.map((u) => http(u, opts))) : http(urls[0], opts);
}

/** 公開済みのコントラクト（読み出し専用の控え）。そのサイトで設定していないチェーンの作品も、X のカードなどで読めるように。
 *  例: テストネットの作品を本番のサイトの /l/… でシェアしたとき（2026-10-24）。mint・売買には使わない（pixChain だけ） */
const KNOWN: Record<number, Hex> = {
  1: '0xc8c425587a818fbfff287b59991fcf471fa47dd8',
  8453: '0xb8d3291b707d2bd3e2ad57bd328c37ea2d2845a8',
  11155111: '0x2bcdf0a8b81022b6ef0273f10764d7065f800a03',
  84532: '0x14c3b1972ecb84069399786893dbb1c949ae49b1',
};

/** 読むだけならこちら: このサイトの設定 → 無ければ公開済みの控え */
export function readChain(chainId: number): PixChain | undefined {
  const own = PIX_CHAINS.find((p) => p.chain.id === chainId);
  if (own) return own;
  const chain = CHAINS.find((c) => c.id === chainId);
  return chain && KNOWN[chainId] ? { chain, address: KNOWN[chainId], rpc: ENV[chainId]?.rpc || undefined } : undefined;
}

export function pixChain(chainId: number): PixChain | undefined {
  return PIX_CHAINS.find((p) => p.chain.id === chainId);
}
