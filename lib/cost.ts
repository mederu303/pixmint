'use client';
// pixmint — mint のコストをチェーンごとに出す（ガス価格は 12 秒ごと・ETH の値段は 60 秒ごとに取り直す）
//   合計 = gas × ガス価格 ＋（Base などの OP 系だけ）L1 データ費
//   L1 データ費は GasPriceOracle の getL1FeeUpperBound（Fjord 以降）で上限を見積もる
//   円 / ドルは Chainlink（Ethereum メインネット）の ETH/USD・JPY/USD
//   テストネットのガス価格は本物の相場とかけ離れている（Sepolia は 0.00000002 gwei ほど）ので、比べるときは
//   テストネットで見積もった gas 量 × 対応するメインネットの今のガス価格（Sepolia → Ethereum・Base Sepolia → Base）で出す
import { useEffect, useState } from 'react';
import { createPublicClient, http, parseAbi, type Chain, type PublicClient } from 'viem';
import { base, mainnet } from 'viem/chains';
import { PIX_CHAINS } from './chains';
import { PIXMINT_ABI, client } from './contract';

export const OP_CHAINS = [8453, 84532];
export const TESTNETS = [11155111, 84532, 31337];
/** テストネット → ガス価格と L1 データ費を借りるメインネット（ローカルは相場が無いのでそのまま） */
export const MAINNET_OF: Record<number, Chain> = { 11155111: mainnet, 84532: base };

const mainnets = new Map<number, PublicClient>();
function priceClient(chainId: number): PublicClient {
  const m = MAINNET_OF[chainId];
  if (!m) return client(chainId);
  let c = mainnets.get(m.id);
  if (!c) {
    const rpc = m.id === 1 ? process.env.NEXT_PUBLIC_RPC_1 : process.env.NEXT_PUBLIC_RPC_8453;
    c = createPublicClient({ chain: m, transport: http(rpc || undefined, { timeout: 8000 }) }) as PublicClient;
    mainnets.set(m.id, c);
  }
  return c;
}

const GAS_ORACLE = '0x420000000000000000000000000000000000000F';
const ORACLE_ABI = parseAbi(['function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)']);
const FEED_ABI = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)']);
const ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'; // 8 decimals
const JPY_USD = '0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3'; // 8 decimals（1 円 = x ドル）

export interface ChainCost {
  gas: bigint | null;
  gasPrice: bigint | null; // 比べる用（テストネットはメインネットのガス価格）
  l1: bigint;
  total: bigint | null; // 比べる用の合計
  ownGasPrice: bigint | null; // そのチェーンで実際に払うガス価格（テストネットでもそのまま）
  ownTotal: bigint | null; // 実際にウォレットで払う額の目安
}

type Hex = `0x${string}`;

/** 全チェーンの mint コスト。args が変わったら 0.5 秒待ってから gas を見積もり直す */
export function useMintCosts(args: readonly [Hex, string, number] | null, value: bigint, account?: Hex) {
  const [gasPrice, setGasPrice] = useState<Record<number, bigint>>({});
  const [ownPrice, setOwnPrice] = useState<Record<number, bigint>>({});
  const [gas, setGas] = useState<Record<number, bigint>>({});
  const [l1, setL1] = useState<Record<number, bigint>>({});

  useEffect(() => {
    let live = true;
    const poll = () =>
      PIX_CHAINS.forEach((p) =>
        priceClient(p.chain.id)
          .getGasPrice()
          .then((g) => live && setGasPrice((m) => ({ ...m, [p.chain.id]: g })))
          .catch(() => {}),
      );
    const pollOwn = () =>
      PIX_CHAINS.filter((p) => MAINNET_OF[p.chain.id]).forEach((p) =>
        client(p.chain.id)
          .getGasPrice()
          .then((g) => live && setOwnPrice((m) => ({ ...m, [p.chain.id]: g })))
          .catch(() => {}),
      );
    poll();
    pollOwn();
    const timerOwn = setInterval(pollOwn, 12_000);
    const timer = setInterval(poll, 12_000);
    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(timerOwn);
    };
  }, []);

  const key = args ? `${args[0]}|${args[1]}|${args[2]}|${value}|${account ?? ''}` : '';
  useEffect(() => {
    setGas({});
    setL1({});
    if (!args) return;
    let live = true;
    const timer = setTimeout(() => {
      // calldata ≒ 4 + 32×5 + データ + タイトル（32 バイト単位に切り上げ）。署名などを足して tx の大きさにする
      const pad = (n: number) => Math.ceil(n / 32) * 32;
      const txSize = 4 + 160 + pad((args[0].length - 2) / 2) + pad(new TextEncoder().encode(args[1]).length) + 100;
      for (const p of PIX_CHAINS) {
        const c = client(p.chain.id);
        c.estimateContractGas({
          address: p.address,
          abi: PIXMINT_ABI,
          functionName: 'mint',
          args: [...args],
          value,
          account: account ?? '0x000000000000000000000000000000000000dEaD',
        })
          .then((g) => live && setGas((m) => ({ ...m, [p.chain.id]: g })))
          .catch(() => {});
        if (OP_CHAINS.includes(p.chain.id))
          priceClient(p.chain.id).readContract({ address: GAS_ORACLE, abi: ORACLE_ABI, functionName: 'getL1FeeUpperBound', args: [BigInt(txSize)] })
            .then((f) => live && setL1((m) => ({ ...m, [p.chain.id]: f })))
            .catch(() => {});
      }
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // key に args・value・account が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const costs: Record<number, ChainCost> = {};
  for (const p of PIX_CHAINS) {
    const id = p.chain.id;
    const g = gas[id] ?? null;
    const gp = gasPrice[id] ?? null;
    const l = l1[id] ?? 0n;
    // テストネットで実際に払うのはテストネットのガス価格（L1 データ費もテストネットではほぼ 0）
    const op = MAINNET_OF[id] ? (ownPrice[id] ?? null) : gp;
    costs[id] = {
      gas: g,
      gasPrice: gp,
      l1: l,
      total: g != null && gp != null ? g * gp + l + value : null,
      ownGasPrice: op,
      ownTotal: g != null && op != null ? g * op + (MAINNET_OF[id] ? 0n : l) + value : null,
    };
  }
  return costs;
}

let feeds: PublicClient | null = null;

/** 1 ETH が何ドルか・1 ドルが何円か（Chainlink）。読めないときは null */
export function useEthPrice() {
  const [price, setPrice] = useState<{ usd: number; jpy: number } | null>(null);
  useEffect(() => {
    feeds ??= createPublicClient({
      chain: mainnet,
      transport: http(process.env.NEXT_PUBLIC_RPC_1 || undefined, { timeout: 8000 }),
    }) as PublicClient;
    let live = true;
    const read = async () => {
      try {
        const [eth, jpy] = await Promise.all([
          feeds!.readContract({ address: ETH_USD, abi: FEED_ABI, functionName: 'latestRoundData' }),
          feeds!.readContract({ address: JPY_USD, abi: FEED_ABI, functionName: 'latestRoundData' }),
        ]);
        const usd = Number(eth[1]) / 1e8;
        if (live && usd > 0) setPrice({ usd, jpy: usd / (Number(jpy[1]) / 1e8) });
      } catch {}
    };
    read();
    const timer = setInterval(read, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return price;
}

/** wei → 「¥0.12」「$0.0008」。有効数字 2 桁・指数表記にしない。ごく小さい額（テストネットなど）は「< ¥0.0001」 */
export function fiat(wei: bigint, price: { usd: number; jpy: number } | null, lang: string): string | null {
  if (!price) return null;
  const eth = Number(wei) / 1e18;
  const v = lang === 'ja' ? eth * price.jpy : eth * price.usd;
  const sym = lang === 'ja' ? '¥' : '$';
  if (v < 0.0001) return `< ${sym}0.0001`;
  const s = v >= 100 ? Math.round(v).toLocaleString() : v.toLocaleString('en-US', { maximumSignificantDigits: 2 });
  return `${sym}${s}`;
}
