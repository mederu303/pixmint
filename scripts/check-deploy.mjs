// pixmint — デプロイ前の確認（.env.deploy の形・deployer の残高・ガス代の見込み）。鍵そのものは出さない
//
//   node scripts/check-deploy.mjs
import { createPublicClient, formatEther, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

process.loadEnvFile(new URL('../.env.deploy', import.meta.url));
const key = (process.env.PRIVATE_KEY ?? '').trim().replace(/^(?!0x)/, '0x');
const { OWNER = '' } = process.env;
const keyOk = /^0x[0-9a-fA-F]{64}$/.test(key);
console.log('PRIVATE_KEY の形:', keyOk ? 'ok' : 'NG');
console.log('OWNER:', OWNER || '(空 = deployer)', OWNER && !isAddress(OWNER) ? 'NG' : '');
if (!keyOk) process.exit(1);

const deployer = privateKeyToAccount(key).address;
console.log('deployer:', deployer);
const DEPLOY_GAS = 3_700_000n;
for (const [name, rpc] of [
  ['sepolia', 'https://ethereum-sepolia-rpc.publicnode.com'],
  ['base-sepolia', 'https://sepolia.base.org'],
]) {
  const pub = createPublicClient({ transport: http(rpc) });
  const [balance, gasPrice, nonce] = await Promise.all([
    pub.getBalance({ address: deployer }),
    pub.getGasPrice(),
    pub.getTransactionCount({ address: deployer }),
  ]);
  console.log(`${name}: 残高 ${formatEther(balance)} ETH / ガス価格 ${Number(gasPrice) / 1e9} gwei / nonce ${nonce} / deploy の見込み ${formatEther(gasPrice * DEPLOY_GAS)} ETH（L1 データ費は別）`);
}
