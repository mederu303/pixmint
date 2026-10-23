// pixmint — テストネットにスクリプトで mint して gas（L1 データ費込み）を測る。鍵は .env.deploy
//
//   node scripts/test-mint.mjs sepolia 0x<PixMint のアドレス> [8 32 64]
//
// 絵は決まった模様（ふつうのドット絵くらいのラン数）。メインネットでは動かない。
import fs from 'node:fs';
import { createPublicClient, createWalletClient, formatEther, http, parseEventLogs, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { encodePxm, validatePxm } from '../src/pxm.ts';

const NETWORKS = {
  sepolia: { id: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  'base-sepolia': { id: 84532, rpc: 'https://sepolia.base.org' },
  local: { id: 31337, rpc: 'http://127.0.0.1:8545' }, // PRIVATE_KEY=<hardhat の鍵> を付けて使う
};

process.loadEnvFile(new URL('../.env.deploy', import.meta.url));
const [name, address, ...sizeArgs] = process.argv.slice(2);
const net = NETWORKS[name];
if (!net || !/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
  console.error(`使い方: node scripts/test-mint.mjs <${Object.keys(NETWORKS).join('|')}> 0x<PixMint> [サイズ...]`);
  process.exit(1);
}
const sizes = sizeArgs.length ? sizeArgs.map(Number) : [8, 32, 64];
const key = process.env.PRIVATE_KEY.trim();
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
const art = JSON.parse(fs.readFileSync(new URL('../lib/PixMint.json', import.meta.url)));
const transport = http(process.env.RPC_URL || net.rpc);
const chain = { id: net.id, name, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [net.rpc] } } };
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });
if ((await pub.getChainId()) !== net.id) throw new Error('RPC のチェーンが違います');

/** 背景＋いくつかの色の塊（ランが数百になる程度） */
function sampleGrid(size) {
  const colors = ['#c77dff', '#ff4fd8', '#7cffcb', '#5cff7a', '#9b5de5', '#2b2d42'];
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const cx = c - size / 2, cy = r - size / 2;
      if (cx * cx + cy * cy > (size * size) / 7) return null;
      return colors[(Math.floor(r / Math.max(1, size / 8)) * 3 + Math.floor(c / Math.max(1, size / 6))) % colors.length];
    }),
  );
}

for (const size of sizes) {
  const pxm = encodePxm(sampleGrid(size), '#0a0a1a');
  const { runs, colors } = validatePxm(pxm);
  const title = `pixmint test ${size}x${size}`;
  const hash = await wallet.writeContract({ address, abi: art.abi, functionName: 'mint', args: [toHex(pxm), title, 500] });
  const r = await pub.waitForTransactionReceipt({ hash });
  const raw = await pub.request({ method: 'eth_getTransactionReceipt', params: [hash] });
  const l1 = BigInt(raw.l1Fee ?? 0);
  const l2 = r.gasUsed * r.effectiveGasPrice;
  const id = parseEventLogs({ abi: art.abi, logs: r.logs, eventName: 'Minted' })[0]?.args.id;
  console.log(
    `${size}x${size}: id ${id} / ${pxm.length} B / ${runs} runs / ${colors} colors / ${r.status} / gas ${r.gasUsed}` +
      ` / 実行 ${formatEther(l2)} ETH + L1 ${formatEther(l1)} ETH (gasPrice ${Number(r.effectiveGasPrice) / 1e9} gwei) / tx ${hash}`,
  );
}
