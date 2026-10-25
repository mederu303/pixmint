// pixmint v4 — スタンプのテスト（コンパイル → ローカル EVM）
// 実行: node --experimental-strip-types test/run4.mjs
//   スタンプのミント・使ったスタンプの記録・売れたときの 8% の等分・trait・受け取りを拒む作者・最悪の場合のガス
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import solc from 'solc';
import { VM } from '@ethereumjs/vm';
import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { encodeFunctionData, decodeFunctionResult, encodeDeployData } from 'viem';
import { encodePxm, pxmToSvg } from '../src/pxm.ts';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ── compile ──
const input = {
  language: 'Solidity',
  sources: { 'PixMint4.sol': { content: fs.readFileSync(path.join(root, 'contracts/PixMint4.sol'), 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: (p) => ({ contents: fs.readFileSync(require.resolve(p), 'utf8') }) }));
const errs = (out.errors ?? []).filter((e) => e.severity === 'error');
if (errs.length) {
  console.error(errs.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
const C = out.contracts['PixMint4.sol'].PixMint4;
const abi = C.abi;
const runtime = C.evm.deployedBytecode.object.length / 2;
console.log(`compiled: runtime ${runtime} bytes`);
fs.writeFileSync(path.join(root, 'lib/PixMint4.json'), JSON.stringify({ abi, bytecode: '0x' + C.evm.bytecode.object }));

// ── vm ──
const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
const vm = await VM.create({ common });
const acct = (b) => Address.fromString('0x' + b.repeat(20));
const mederu = acct('a1'); // owner（公式スタンプを出す）
const bob = acct('b0'); // スタンプ作家
const dave = acct('da'); // スタンプ作家
const carol = acct('c0'); // 作品の作家
const erin = acct('e0'); // 買う人
const frank = acct('f0'); // 買う人
for (const a of [mederu, bob, dave, carol, erin, frank]) await vm.stateManager.putAccount(a, new Account(0n, 10n ** 24n));
const bal = async (a) => (await vm.stateManager.getAccount(a))?.balance ?? 0n;
const intrinsic = (data) => 21000 + data.reduce((s, b) => s + (b === 0 ? 4 : 16), 0);
const call = ({ to, data, value = 0n, gasLimit = 30_000_000n, from = mederu }) => vm.evm.runCall({ caller: from, origin: from, to, data, value, gasLimit });

const deployData = hexToBytes(encodeDeployData({ abi, bytecode: '0x' + C.evm.bytecode.object, args: [mederu.toString()] }));
const dep = await call({ data: deployData, gasLimit: 15_000_000n });
if (dep.execResult.exceptionError) throw dep.execResult.exceptionError;
const pix = dep.createdAddress;
console.log(`deploy gas: ${Number(dep.execResult.executionGasUsed) + intrinsic(deployData) + 32000} (runtime ${runtime} / 24,576 bytes)`);

async function tx(fn, args, { from = mederu, value = 0n } = {}) {
  const data = hexToBytes(encodeFunctionData({ abi, functionName: fn, args }));
  const r = await call({ to: pix, data, from, value });
  return { ok: !r.execResult.exceptionError, gas: Number(r.execResult.executionGasUsed) + intrinsic(data) };
}
async function view(fn, args = [], gasLimit = 1_000_000_000n) {
  const data = hexToBytes(encodeFunctionData({ abi, functionName: fn, args }));
  const r = await call({ to: pix, data, gasLimit });
  if (r.execResult.exceptionError) throw new Error(`${fn} reverted`);
  return { v: decodeFunctionResult({ abi, functionName: fn, data: bytesToHex(r.execResult.returnValue) }), gas: Number(r.execResult.executionGasUsed) };
}
const total = async () => (await view('totalMinted')).v;
const meta = async (id) => JSON.parse(Buffer.from((await view('tokenURI', [id])).v.split(',')[1], 'base64').toString());

let fail = 0;
const check = (name, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fail++;
};

// ── 絵 ──
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const PAL = ['#c77dff', '#ff00ff', '#00ffff', '#ff8800', '#00ff88', '#ffff00', '#ffffff'];
function art(size, k = 3) {
  const g = Array.from({ length: size }, () => Array(size).fill(null));
  for (let s = 0; s < k; s++) {
    const col = PAL[Math.floor(rnd() * PAL.length)];
    const cx = rnd() * size, cy = rnd() * size, rad = 1 + (rnd() * size) / 4;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if ((r - cy) ** 2 + (c - cx) ** 2 < rad * rad) g[r][c] = col;
  }
  return bytesToHex(encodePxm(g, '#0a0a1a'));
}
const E = 10n ** 18n;

// ── スタンプのミント ──
const S1 = await tx('mintStamp', [art(16), 'heart', 0], { from: mederu }); // 公式
const OFFICIAL = await total();
const S2 = await tx('mintStamp', [art(16), 'neko "paw"', 500], { from: bob });
const BOB = await total();
const S3 = await tx('mintStamp', [art(8), 'tiny star', 500], { from: dave });
const DAVE = await total();
check(`official stamp by owner (gas ${S1.gas.toLocaleString()})`, S1.ok && (await view('works', [OFFICIAL])).v[6] === true);
check(`bob's 16x16 stamp (gas ${S2.gas.toLocaleString()}) — not official`, S2.ok && (await view('works', [BOB])).v[5] === true && (await view('works', [BOB])).v[6] === false);
check(`dave's 8x8 stamp (gas ${S3.gas.toLocaleString()})`, S3.ok);
check('reject 12x12 stamp', !(await tx('mintStamp', [art(12), 'x', 0], { from: bob })).ok);
check('reject 32x32 stamp', !(await tx('mintStamp', [art(32), 'x', 0], { from: bob })).ok);
check('reject stamp name with newline', !(await tx('mintStamp', [art(16), 'a\nb', 0], { from: bob })).ok);
check('reject stamp name 33 bytes', !(await tx('mintStamp', [art(16), 'x'.repeat(33), 0], { from: bob })).ok);
check('accept stamp name 30 bytes (日本語10文字)', (await tx('mintStamp', [art(16), 'あ'.repeat(10), 0], { from: dave })).ok);
const sm = await meta(BOB);
check('stamp tokenURI has Type: Stamp', sm.attributes.some((a) => a.trait_type === 'Type' && a.value === 'Stamp'));
check('stamp name round-trips (escaped)', sm.name === 'neko "paw"');

// ── スタンプを使った作品 ──
const plain = await tx('mint', [art(32, 6), 'plain', 500, []], { from: carol });
const PLAIN = await total();
check(`work without stamps (gas ${plain.gas.toLocaleString()})`, plain.ok);
check('cannot use a non-stamp work as a stamp', !(await tx('mint', [art(32), '', 500, [PLAIN]], { from: carol })).ok);
check('reject unsorted stamps', !(await tx('mint', [art(32), '', 500, [BOB, OFFICIAL]], { from: carol })).ok);
check('reject duplicate stamps', !(await tx('mint', [art(32), '', 500, [BOB, BOB]], { from: carol })).ok);
check('reject stamp id that does not exist', !(await tx('mint', [art(32), '', 500, [999n]], { from: carol })).ok);
check('reject stamp id 0', !(await tx('mint', [art(32), '', 500, [0n]], { from: carol })).ok);
const used = await tx('mint', [art(32, 6), 'with stamps', 500, [OFFICIAL, BOB, DAVE]], { from: carol });
const W = await total();
check(`work with 3 stamps (gas ${used.gas.toLocaleString()}, +${(used.gas - plain.gas).toLocaleString()} vs none)`, used.ok);
check('stampsOf = [official, bob, dave]', (await view('stampsOf', [W])).v.join() === [OFFICIAL, BOB, DAVE].join());
const arts = (await view('stampArtists', [W])).v.map((a) => a.toLowerCase());
check('stampArtists = bob, dave (official excluded)', JSON.stringify(arts) === JSON.stringify([bob.toString(), dave.toString()]));

// trait
await tx('setName', ['ボブ "b"'], { from: bob });
const wm = await meta(W);
const traits = (t) => wm.attributes.filter((a) => a.trait_type === t).map((a) => a.value);
check('Stamp traits: heart, neko "paw", tiny star', JSON.stringify(traits('Stamp')) === JSON.stringify(['heart', 'neko "paw"', 'tiny star']));
check('Stamp Artist traits: mederu, display name, address', JSON.stringify(traits('Stamp Artist')) === JSON.stringify(['mederu', 'ボブ "b"', dave.toString()]));
check('image still renders the same SVG', Buffer.from(wm.image.split(',')[1], 'base64').toString() === (await view('svg', [W])).v);

// ── 売れたときの分け方 ──
// 一次: carol（作家）が 1 ETH → erin が買う。mederu 2.5% / bob 4% / dave 4% / carol 89.5%
await tx('list', [W, E], { from: carol });
let b0 = await bal(bob), d0 = await bal(dave), c0 = await bal(carol), p0 = (await view('platformBalance')).v;
const buy1 = await tx('buy', [W], { from: erin, value: E });
check(`primary sale (gas ${buy1.gas.toLocaleString()})`, buy1.ok);
check('bob gets 4%', (await bal(bob)) - b0 === (E * 4n) / 100n);
check('dave gets 4%', (await bal(dave)) - d0 === (E * 4n) / 100n);
check('carol gets 89.5% (same split as the mederu atelier)', (await bal(carol)) - c0 === (E * 895n) / 1000n);
check('mederu fee 2.5%', (await view('platformBalance')).v - p0 === (E * 25n) / 1000n);
// 二次: erin → bob が買う → bob が売る（売り手の bob は外れ、dave が 8% 全部）
await tx('list', [W, E], { from: erin });
await tx('buy', [W], { from: bob, value: E });
await tx('list', [W, 2n * E], { from: bob });
b0 = await bal(bob); d0 = await bal(dave); c0 = await bal(carol);
check('bob resells', (await tx('buy', [W], { from: frank, value: 2n * E })).ok);
check('seller bob is excluded → dave gets the whole 8%', (await bal(dave)) - d0 === (2n * E * 8n) / 100n);
check('carol royalty 5%', (await bal(carol)) - c0 === (2n * E * 5n) / 100n);
check('bob gets 100 - 2.5 - 5 - 8 = 84.5%', (await bal(bob)) - b0 === (2n * E * 845n) / 1000n);
// 公式スタンプだけ → 誰にも払わない
await tx('mint', [art(16), 'official only', 0, [OFFICIAL]], { from: carol });
const O = await total();
await tx('list', [O, E], { from: carol });
c0 = await bal(carol);
await tx('buy', [O], { from: erin, value: E });
check('official stamps only → carol keeps 97.5%', (await bal(carol)) - c0 === (E * 975n) / 1000n);
// 自分のスタンプ → 自分には払わない（作品の作者として外れる）
await tx('mint', [art(16), 'own stamp', 0, [BOB]], { from: bob });
check('own stamp is not a stamp artist of the work', (await view('stampArtists', [await total()])).v.length === 0);

// ── 受け取りでガスを使い切るスタンプ作家がいても売れる ──
const BURN = hexToBytes('0x5b600056');
const evil = acct('ee');
await vm.stateManager.putAccount(evil, new Account(0n, 10n ** 24n));
await tx('mintStamp', [art(16), 'evil', 0], { from: evil });
const EVIL = await total();
await vm.stateManager.putContractCode(evil, BURN);
await tx('mint', [art(16), 'uses evil', 0, [BOB, EVIL]], { from: carol });
const X = await total();
await tx('list', [X, E], { from: carol });
const bx = await tx('buy', [X], { from: erin, value: E });
check(`buy succeeds even if a stamp artist burns gas (gas ${bx.gas.toLocaleString()})`, bx.ok);
check('evil share held in pending', (await view('pending', [evil.toString()])).v === (E * 4n) / 100n);
check('contract balance == platformBalance + pending', (await bal(pix)) === (await view('platformBalance')).v + (await view('pending', [evil.toString()])).v);

// ── 上限 ──
const MAX = Number((await view('MAX_STAMPS')).v);
// MAX 人の作家が、それぞれ 96 bytes の名前（全部 " で、エスケープで 2 倍になる）のスタンプを出す。作家名も 48 bytes
const many = [];
for (let i = 0; i < MAX + 1; i++) {
  const a = Address.fromString('0x' + (0x1000 + i).toString(16).padStart(40, '0'));
  await vm.stateManager.putAccount(a, new Account(0n, 10n ** 24n));
  await tx('setName', ['"'.repeat(48)], { from: a });
  await tx('mintStamp', [art(16), '"'.repeat(32), 1000], { from: a });
  many.push({ a, id: await total() });
}
check(`reject ${MAX + 1} stamps`, !(await tx('mint', [art(16), '', 0, many.map((m) => m.id)], { from: carol })).ok);
// 最悪の絵（129×129・255色・2,048 ラン）＋ スタンプ MAX 個
function worstCase(runs, size = 129, ncol = 255) {
  const pal = [];
  for (let i = 0; i < ncol; i++) pal.push((i * 37) & 255, (i * 91) & 255, (i * 53) & 255);
  const o = [];
  let left = runs, k = 0;
  for (let r = 0; r < size; r++) {
    const n = Math.max(1, Math.min(size, Math.round(left / (size - r))));
    left -= n;
    const base = Math.floor(size / n);
    let rest = size - base * n;
    for (let i = 0; i < n; i++) o.push(base + (rest-- > 0 ? 1 : 0), k++ % ncol);
  }
  return bytesToHex(new Uint8Array([1, size, ncol, ...pal, ...o]));
}
const TX_GAS_CAP = 16_777_216;
{
  // 比べるため: スタンプ無しの最悪の絵、スタンプ 10 個
  await tx('mint', [worstCase(2048), '"'.repeat(96), 1000, []], { from: carol });
  console.log(`  (worst case, 0 stamps: tokenURI ${(await view('tokenURI', [await total()])).gas.toLocaleString()} gas)`);
  await tx('mint', [worstCase(2048), '"'.repeat(96), 1000, many.slice(0, 10).map((m) => m.id)], { from: carol });
  console.log(`  (worst case, 10 stamps: tokenURI ${(await view('tokenURI', [await total()])).gas.toLocaleString()} gas)`);
}
const wm2 = await tx('mint', [worstCase(2048), '"'.repeat(96), 1000, many.slice(0, MAX).map((m) => m.id)], { from: carol });
const WW = await total();
check(`mint worst case + ${MAX} stamps (gas ${wm2.gas.toLocaleString()})`, wm2.ok);
const g = (await view('tokenURI', [WW])).gas;
check(`worst-case tokenURI ${g.toLocaleString()} gas ≤ 85% of tx cap (${((g / TX_GAS_CAP) * 100).toFixed(0)}%)`, g <= TX_GAS_CAP * 0.85);
const wmeta = await meta(WW);
check(`worst-case JSON parses with ${MAX} Stamp + ${MAX} Stamp Artist traits`, wmeta.attributes.filter((a) => a.trait_type === 'Stamp').length === MAX && wmeta.attributes.filter((a) => a.trait_type === 'Stamp Artist').length === MAX);
check('worst-case SVG matches the JS renderer', Buffer.from(wmeta.image.split(',')[1], 'base64').toString() === pxmToSvg(hexToBytes(worstCase(2048))));
await tx('list', [WW, E], { from: carol });
const bw = await tx('buy', [WW], { from: erin, value: E });
check(`buy with ${MAX} stamp artists (gas ${bw.gas.toLocaleString()})`, bw.ok);
check(`each of ${MAX} artists gets 8% / ${MAX}`, (await bal(many[0].a)) - 10n ** 24n === (E * 8n) / 100n / BigInt(MAX));

console.log(fail ? `\nFAILED: ${fail}` : '\nALL OK');
process.exit(fail ? 1 : 0);
