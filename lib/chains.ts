// pixmint — どのチェーンで動かすか
//
// NEXT_PUBLIC_PIXMINT_<chainId> にコントラクトのアドレスが入っているチェーンだけを使う。
//   本番:       NEXT_PUBLIC_PIXMINT_1 / NEXT_PUBLIC_PIXMINT_8453
//   テストネット: NEXT_PUBLIC_PIXMINT_11155111 (Sepolia) / NEXT_PUBLIC_PIXMINT_84532 (Base Sepolia)
//   ローカル:   NEXT_PUBLIC_PIXMINT_31337 (hardhat node)
// RPC は NEXT_PUBLIC_RPC_<chainId> で上書きできる（無ければ viem の公開 RPC）。
// ※ Next はビルド時に process.env.NEXT_PUBLIC_* を文字列で埋め込むので、動的なキーでは読めない。全部書き出す。
import type { Chain } from 'viem';
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

export function pixChain(chainId: number): PixChain | undefined {
  return PIX_CHAINS.find((p) => p.chain.id === chainId);
}
