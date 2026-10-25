// pixmint v4 — テストネットで通しで試す: スタンプを作る → 使って描く → 売る → スタンプの作者に 8% が入るか
//
//   node --experimental-strip-types scripts/e2e-v4.mjs <sepolia|base-sepolia> 0x<PixMint4 のアドレス> <鍵を置くファイル>
//
// 鍵は .env.deploy（owner = mederu として公式スタンプを出す）。使い捨てのテスト用ウォレットを 3 つ作り、
// 少しだけ ETH を送って使う。終わったら残りを owner に戻す。使い捨ての鍵は画面に出さず、
// 途中で止まっても取り戻せるよう第 3 引数のファイルにだけ書く。メインネットでは動かない。
import fs from 'node:fs';
import { createPublicClient, createWalletClient, formatEther, http, parseEther, parseEventLogs, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodePxm } from '../src/pxm.ts';

const NETWORKS = {
  sepolia: { id: 11155111, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
  'base-sepolia': { id: 84532, rpc: 'https://sepolia.base.org' },
};
process.loadEnvFile(new URL('../.env.deploy', import.meta.url));
const [name, address, keyFile] = process.argv.slice(2);
const net = NETWORKS[name];
if (!net || !/^0x[0-9a-fA-F]{40}$/.test(address ?? '') || !keyFile) {
  console.error('使い方: node --experimental-strip-types scripts/e2e-v4.mjs <sepolia|base-sepolia> 0x<PixMint4> <鍵を置くファイル>');
  process.exit(1);
}
const art = JSON.parse(fs.readFileSync(new URL('../lib/PixMint4.json', import.meta.url)));
const chain = { id: net.id, name, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [net.rpc] } } };
const transport = http(net.rpc);
const pub = createPublicClient({ chain, transport });
if ((await pub.getChainId()) !== net.id) throw new Error('RPC のチェーンが違います');
const ownerKey = process.env.PRIVATE_KEY.trim();
const owner = privateKeyToAccount(ownerKey.startsWith('0x') ? ownerKey : `0x${ownerKey}`);

// 使い捨てのウォレット（スタンプの作者 A・作品の作者 B・買う人 C）
const keys = { A: generatePrivateKey(), B: generatePrivateKey(), C: generatePrivateKey() };
fs.writeFileSync(keyFile, JSON.stringify(keys), { mode: 0o600 });
const W = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, privateKeyToAccount(v)]));
const wallet = (acc) => createWalletClient({ account: acc, chain, transport });
const bal = (a) => pub.getBalance({ address: a.address ?? a, blockTag: 'latest' });

let fail = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) fail++;
};
async function send(acc, fn, args, value = 0n) {
  const hash = await wallet(acc).writeContract({ address, abi: art.abi, functionName: fn, args, value });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${fn} reverted: ${hash}`);
  return r;
}
const read = (fn, args = []) => pub.readContract({ address, abi: art.abi, functionName: fn, args });
const idOf = (r) => parseEventLogs({ abi: art.abi, logs: r.logs, eventName: 'Minted' })[0].args.id;

// 絵
function blob(size, colors) {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const dx = c - size / 2 + 0.5, dy = r - size / 2 + 0.5;
      return dx * dx + dy * dy < (size * size) / 5 ? colors[(r + c) % colors.length] : null;
    }),
  );
}
const pxm = (size, colors) => toHex(encodePxm(blob(size, colors), '#0a0a1a'));

try {
  // 1. 少しだけ ETH を配る
  const fund = parseEther('0.0006');
  for (const k of ['A', 'B', 'C']) {
    const hash = await wallet(owner).sendTransaction({ to: W[k].address, value: fund });
    await pub.waitForTransactionReceipt({ hash });
  }
  console.log(`funded A/B/C with ${formatEther(fund)} ETH each`);

  // 2. スタンプ: 公式（owner）と、作家 A の 16×16
  const off = idOf(await send(owner, 'mintStamp', [pxm(16, ['#ff4fd8', '#ffffff']), 'heart', 0]));
  // スタンプの手数料（荒らし対策）: owner が少しだけ付けて、A が払って出す → 0 に戻す
  const fee = parseEther('0.00001');
  await send(owner, 'setStampPrice', [fee]);
  const pf = await read('platformBalance');
  const sa = idOf(await send(W.A, 'mintStamp', [pxm(16, ['#7cffcb', '#2b2d42']), 'e2e neko', 500], fee));
  check(`A paid the stamp fee ${formatEther(fee)} ETH`, (await read('platformBalance')) - pf === fee);
  await send(owner, 'setStampPrice', [0n]);
  const wOff = await read('works', [off]);
  const wA = await read('works', [sa]);
  check(`official stamp #${off} (stamp=${wOff[5]}, official=${wOff[6]})`, wOff[5] && wOff[6]);
  check(`A's stamp #${sa} (stamp=${wA[5]}, official=${wA[6]})`, wA[5] && !wA[6]);

  // 3. 作家 B がスタンプ 2 つを使って作品をミント
  const work = idOf(await send(W.B, 'mint', [pxm(32, ['#c77dff', '#5cff7a', '#9b5de5']), 'e2e work', 500, [off, sa].sort((x, y) => (x < y ? -1 : 1))]));
  check(`B's work #${work} records stamps [${(await read('stampsOf', [work])).join(', ')}]`, (await read('stampsOf', [work])).length === 2);
  const artists = await read('stampArtists', [work]);
  check('stampArtists = [A] (official excluded)', artists.length === 1 && artists[0].toLowerCase() === W.A.address.toLowerCase());
  const meta = JSON.parse(Buffer.from((await read('tokenURI', [work])).split(',')[1], 'base64').toString());
  const tr = (t) => meta.attributes.filter((a) => a.trait_type === t).map((a) => a.value);
  console.log(`  traits: Stamp = ${JSON.stringify(tr('Stamp'))}, Stamp Artist = ${JSON.stringify(tr('Stamp Artist'))}`);
  check('tokenURI traits list both stamps and both artists', tr('Stamp').length === 2 && tr('Stamp Artist').includes('mederu'));

  // 4. 一次販売: B が出品 → C が買う。A に 8%、B に 89.5%、mederu に 2.5%
  const P = parseEther('0.0001');
  await send(W.B, 'list', [work, P]);
  let a0 = await bal(W.A), b0 = await bal(W.B), p0 = await read('platformBalance');
  await send(W.C, 'buy', [work], P);
  check(`A (stamp artist) +8% = ${formatEther((P * 8n) / 100n)} ETH`, (await bal(W.A)) - a0 === (P * 8n) / 100n);
  check(`B (work artist, seller) +89.5% = ${formatEther((P * 895n) / 1000n)} ETH`, (await bal(W.B)) - b0 === (P * 895n) / 1000n);
  check(`mederu fee +2.5%`, (await read('platformBalance')) - p0 === (P * 25n) / 1000n);
  check('C owns the work', (await read('ownerOf', [work])).toLowerCase() === W.C.address.toLowerCase());

  // 5. 二次販売: C が出品 → owner が買う。A に 8%、B にロイヤリティ 5%、C に 84.5%
  const P2 = parseEther('0.0002');
  await send(W.C, 'list', [work, P2]);
  a0 = await bal(W.A); b0 = await bal(W.B);
  const c0 = await bal(W.C);
  await send(owner, 'buy', [work], P2);
  check(`resale: A +8%`, (await bal(W.A)) - a0 === (P2 * 8n) / 100n);
  check(`resale: B royalty +5%`, (await bal(W.B)) - b0 === (P2 * 5n) / 100n);
  check(`resale: C (seller) +84.5%`, (await bal(W.C)) - c0 === (P2 * 845n) / 1000n);
  console.log(`  explorer: work #${work} / stamps #${off}, #${sa} on ${name} at ${address}`);
} finally {
  // 6. 残りを owner に戻す（ガス代の分は残す）
  const gp = await pub.getGasPrice();
  for (const k of ['A', 'B', 'C']) {
    const b = await bal(W[k]);
    const keep = gp * 21000n * 3n + parseEther('0.00001'); // L1 費（Base）のぶんも少し残す
    if (b <= keep) continue;
    try {
      const hash = await wallet(W[k]).sendTransaction({ to: owner.address, value: b - keep });
      await pub.waitForTransactionReceipt({ hash });
    } catch (e) {
      console.log(`  (could not return ${k}'s leftover: ${e.shortMessage ?? e.message})`);
    }
  }
  console.log('returned leftovers to owner');
}
console.log(fail ? `\nFAILED: ${fail}` : '\nALL OK');
process.exit(fail ? 1 : 0);
