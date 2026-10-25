// pixmint — PixMint をデプロイする
//
//   npm run deploy -- sepolia            # Sepolia
//   npm run deploy -- base-sepolia       # Base Sepolia
//   npm run deploy -- sepolia v4         # v4（スタンプ入り。lib/PixMint4.json = npm run test:v4 で作る）
//
// 秘密鍵と owner は .env.deploy に書く（git には入らない。画面にも出さない）:
//   PRIVATE_KEY=0x...
//   OWNER=0x...          # mederu の受け取りアドレス（無ければデプロイしたアドレス）
//   RPC_URL=https://...  # 任意。無ければ下の公開 RPC
//
// メインネット（mainnet / base）は ALLOW_MAINNET=1 を付けたときだけ動く。
//
// 例（ローカル）:  npx hardhat node  →  別ターミナルで
//   RPC_URL=http://127.0.0.1:8545 PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 node scripts/deploy.mjs
//
// 出力されたアドレスを .env.local の NEXT_PUBLIC_PIXMINT_<chainId> に入れる。
// コントラクトの元は lib/PixMint.json（npm test で contracts/PixMint.sol から作られる）。
import fs from 'node:fs';
import { createPublicClient, createWalletClient, formatEther, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const NETWORKS = {
  sepolia: { id: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  'base-sepolia': { id: 84532, rpc: 'https://sepolia.base.org' },
  mainnet: { id: 1, rpc: 'https://ethereum-rpc.publicnode.com' },
  base: { id: 8453, rpc: 'https://mainnet.base.org' },
};
const MAINNETS = [1, 8453];

const envFile = new URL('../.env.deploy', import.meta.url);
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const name = process.argv[2];
const v4 = process.argv[3] === 'v4';
const net = name ? NETWORKS[name] : undefined;
if (name && !net) {
  console.error(`知らないネットワーク: ${name}（${Object.keys(NETWORKS).join(' / ')}）`);
  process.exit(1);
}
const RPC_URL = process.env.RPC_URL || net?.rpc;
const { PRIVATE_KEY, OWNER } = process.env;
if (!RPC_URL || !PRIVATE_KEY) {
  console.error('RPC_URL（またはネットワーク名）と PRIVATE_KEY が必要です');
  process.exit(1);
}
if (OWNER && !isAddress(OWNER)) {
  console.error('OWNER がアドレスの形になっていません');
  process.exit(1);
}

const art = JSON.parse(fs.readFileSync(new URL(v4 ? '../lib/PixMint4.json' : '../lib/PixMint.json', import.meta.url)));
// MetaMask が書き出す鍵は 0x なし
const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
const transport = http(RPC_URL);
const pub = createPublicClient({ transport });
const chainId = await pub.getChainId();
if (net && chainId !== net.id) {
  console.error(`RPC のチェーン ${chainId} が ${name}（${net.id}）と違います`);
  process.exit(1);
}
if (MAINNETS.includes(chainId) && process.env.ALLOW_MAINNET !== '1') {
  console.error(`チェーン ${chainId} はメインネットです。本当に置くときだけ ALLOW_MAINNET=1 を付けてください`);
  process.exit(1);
}
const wallet = createWalletClient({ account, transport, chain: { id: chainId, name: String(chainId), nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } });
const owner = OWNER || account.address;

const balance = await pub.getBalance({ address: account.address });
console.log(`chain ${chainId} / deployer ${account.address} (${formatEther(balance)} ETH) / owner ${owner}`);
const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [owner] });
console.log(`tx ${hash}`);
const r = await pub.waitForTransactionReceipt({ hash });
if (r.status !== 'success') {
  console.error('デプロイが revert しました');
  process.exit(1);
}
// Base などの OP 系は L1 データ費が別にかかる（viem の既定の整形では落ちるので生の receipt から読む）
const raw = await pub.request({ method: 'eth_getTransactionReceipt', params: [hash] });
const fee = r.gasUsed * r.effectiveGasPrice + BigInt(raw.l1Fee ?? 0);
console.log(`${v4 ? 'PixMint4' : 'PixMint'}: ${r.contractAddress}  (gas ${r.gasUsed}, fee ${formatEther(fee)} ETH, block ${r.blockNumber})`);
console.log(`\n.env.local に:\nNEXT_PUBLIC_PIXMINT_${chainId}=${r.contractAddress}`);
