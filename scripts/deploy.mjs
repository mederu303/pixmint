// pixmint — PixMint をデプロイする
//
//   RPC_URL=<RPC> PRIVATE_KEY=<0x...> OWNER=<mederu の受け取りアドレス> node scripts/deploy.mjs
//
// 例（ローカル）:  npx hardhat node  →  別ターミナルで
//   RPC_URL=http://127.0.0.1:8545 PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 node scripts/deploy.mjs
//
// 出力されたアドレスを .env.local の NEXT_PUBLIC_PIXMINT_<chainId> に入れる。
// コントラクトの元は lib/PixMint.json（npm test で contracts/PixMint.sol から作られる）。
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const { RPC_URL, PRIVATE_KEY, OWNER } = process.env;
if (!RPC_URL || !PRIVATE_KEY) {
  console.error('RPC_URL と PRIVATE_KEY が必要です');
  process.exit(1);
}
const art = JSON.parse(fs.readFileSync(new URL('../lib/PixMint.json', import.meta.url)));
const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http(RPC_URL);
const pub = createPublicClient({ transport });
const chainId = await pub.getChainId();
const wallet = createWalletClient({ account, transport, chain: { id: chainId, name: String(chainId), nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } });
const owner = OWNER || account.address;

console.log(`chain ${chainId} / deployer ${account.address} / owner ${owner}`);
const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [owner] });
const r = await pub.waitForTransactionReceipt({ hash });
console.log(`PixMint: ${r.contractAddress}  (gas ${r.gasUsed}, block ${r.blockNumber})`);
console.log(`\n.env.local に:\nNEXT_PUBLIC_PIXMINT_${chainId}=${r.contractAddress}`);
