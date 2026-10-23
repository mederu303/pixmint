// pixmint — コンパイル → ローカル EVM で deploy / mint → tokenURI を JS 版と突き合わせる
// 実行: node --experimental-strip-types test/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import solc from 'solc';
import { VM } from '@ethereumjs/vm';
import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { encodeFunctionData, decodeFunctionResult, encodeDeployData, encodeAbiParameters, toFunctionSelector, concatHex } from 'viem';
import { encodePxm, pxmToSvg, validatePxm } from '../src/pxm.ts';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ── compile ──
const input = {
  language: 'Solidity',
  sources: { 'PixMint.sol': { content: fs.readFileSync(path.join(root, 'contracts/PixMint.sol'), 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
};
const out = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (p) => ({ contents: fs.readFileSync(require.resolve(p), 'utf8') }),
  }),
);
const errs = (out.errors ?? []).filter((e) => e.severity === 'error');
if (errs.length) {
  console.error(errs.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
const C = out.contracts['PixMint.sol'].PixMint;
const abi = C.abi;
console.log(`compiled: runtime ${C.evm.deployedBytecode.object.length / 2} bytes`);
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'out/PixMint.json'), JSON.stringify({ abi, bytecode: '0x' + C.evm.bytecode.object }, null, 2));
// アプリとデプロイスクリプトが使う（コミットする）
fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib/PixMint.json'), JSON.stringify({ abi, bytecode: '0x' + C.evm.bytecode.object }));

// ── vm ──
const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
const vm = await VM.create({ common });
const alice = Address.fromString('0x' + 'a1'.repeat(20));
const bob = Address.fromString('0x' + 'b0'.repeat(20));
const carol = Address.fromString('0x' + 'c0'.repeat(20));
const mederu = Address.fromString('0x' + 'd0'.repeat(20));
for (const a of [alice, bob, carol]) await vm.stateManager.putAccount(a, new Account(0n, 10n ** 24n));
const bal = async (a) => (await vm.stateManager.getAccount(a))?.balance ?? 0n;

const intrinsic = (data) => 21000 + data.reduce((s, b) => s + (b === 0 ? 4 : 16), 0);

async function call({ to, data, value = 0n, gasLimit = 30_000_000n, from = alice }) {
  const r = await vm.evm.runCall({ caller: from, origin: from, to, data, value, gasLimit });
  return r;
}

// deploy
const deployData = hexToBytes(encodeDeployData({ abi, bytecode: '0x' + C.evm.bytecode.object, args: [alice.toString()] }));
const dep = await call({ data: deployData, gasLimit: 10_000_000n });
if (dep.execResult.exceptionError) throw dep.execResult.exceptionError;
const pix = dep.createdAddress;
console.log(`deploy gas: ${Number(dep.execResult.executionGasUsed) + intrinsic(deployData) + 32000}`);

async function mint(bytes, title = '', royaltyBps = 500, from = alice) {
  const data = hexToBytes(encodeFunctionData({ abi, functionName: 'mint', args: [bytesToHex(bytes), title, royaltyBps] }));
  const r = await call({ to: pix, data, from });
  return { r, gas: Number(r.execResult.executionGasUsed) + intrinsic(data) };
}
async function view(fn, args, gasLimit = 1_000_000_000n) {
  const data = hexToBytes(encodeFunctionData({ abi, functionName: fn, args }));
  const r = await call({ to: pix, data, gasLimit });
  if (r.execResult.exceptionError) throw new Error(`${fn} reverted`);
  return { v: decodeFunctionResult({ abi, functionName: fn, data: bytesToHex(r.execResult.returnValue) }), gas: Number(r.execResult.executionGasUsed) };
}

// ── テスト用の絵 ──
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const PAL = ['#0a0a1a', '#c77dff', '#ff00ff', '#00ffff', '#ff8800', '#00ff88', '#ffff00', '#ffffff'];
function blobArt(size, k) {
  // それっぽいドット絵：背景＋いくつかの塗りつぶし矩形・円
  const g = Array.from({ length: size }, () => Array(size).fill(null));
  for (let s = 0; s < k; s++) {
    const col = PAL[1 + Math.floor(rnd() * (PAL.length - 1))];
    const cx = rnd() * size, cy = rnd() * size, rad = 1 + rnd() * size / 4;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if ((r - cy) ** 2 + (c - cx) ** 2 < rad * rad) g[r][c] = col;
  }
  return g;
}
function noiseArt(size, ncol) {
  const pal = Array.from({ length: ncol }, (_, i) => '#' + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0'));
  return Array.from({ length: size }, () => Array.from({ length: size }, () => pal[Math.floor(rnd() * ncol)]));
}

const cases = [
  ['8x8 blob', blobArt(8, 3)],
  ['16x16 blob', blobArt(16, 5)],
  ['32x32 blob', blobArt(32, 8)],
  ['33x33 blob (odd)', blobArt(33, 8)],
  ['64x64 blob', blobArt(64, 14)],
  ['128x128 blob', blobArt(128, 24)],
  ['32x32 noise 16色 (最悪寄り)', noiseArt(32, 16)],
  ['64x64 noise 64色', noiseArt(64, 64)],
  ['1x1', [['#123456']]],
];

let fail = 0;
let id = 0;
const rows = [];
for (const [name, grid] of cases) {
  let bytes;
  try { bytes = encodePxm(grid, '#0a0a1a'); } catch (e) { console.log(`✗ ${name}: ${e.message}`); fail++; continue; }
  const meta = validatePxm(bytes);
  const { r, gas } = await mint(bytes);
  if (r.execResult.exceptionError) {
    console.log(`✗ ${name}: mint reverted`);
    fail++;
    continue;
  }
  id++;
  const raw = await view('data', [BigInt(id)]);
  const onSvg = await view('svg', [BigInt(id)]);
  const uri = await view('tokenURI', [BigInt(id)]);
  const jsSvg = pxmToSvg(bytes);
  const sameData = raw.v.toLowerCase() === bytesToHex(bytes).toLowerCase();
  const sameSvg = onSvg.v === jsSvg;
  const json = JSON.parse(Buffer.from(uri.v.split(',')[1], 'base64').toString());
  const imgSvg = Buffer.from(json.image.split(',')[1], 'base64').toString();
  const ok = sameData && sameSvg && imgSvg === jsSvg;
  if (!ok) fail++;
  rows.push({ case: name, bytes: bytes.length, runs: meta.runs, colors: meta.colors, mintGas: gas, tokenURIgas: uri.gas, svgBytes: jsSvg.length, ok: ok ? '✓' : '✗' });
  if (id === 3) fs.writeFileSync(path.join(root, 'out/sample-32.svg'), jsSvg);
}
console.table(rows);

// ── 壊れたデータは revert すること ──
const good = encodePxm(blobArt(8, 2));
const bad = {
  'version違い': (() => { const b = good.slice(); b[0] = 2; return b; })(),
  'size 0': (() => { const b = good.slice(); b[1] = 0; return b; })(),
  'run len 0': (() => { const b = good.slice(); b[3 + 3 * b[2]] = 0; return b; })(),
  '色index超過': (() => { const b = good.slice(); b[3 + 3 * b[2] + 1] = 250; return b; })(),
  '末尾欠け': good.slice(0, good.length - 2),
  '余分なラン': new Uint8Array([...good, 1, 0]),
  '奇数長': new Uint8Array([...good, 1]),
};
// 上限超え：エンコーダは投げる／コントラクトは revert する
try { encodePxm(noiseArt(129, 255)); console.log('✗ encoder accepted >MAX_RUNS'); fail++; } catch { console.log('✓ encoder rejects >MAX_RUNS'); }
{
  // 4097 ラン：129x129 を1色ずつ交互に（1マス=1ラン）。手で組む
  const size = 65, runs = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) runs.push(1, (r + c) & 1);
  bad['MAX_RUNS 超え(4225ラン)'] = new Uint8Array([1, size, 2, 0, 0, 0, 255, 255, 255, ...runs]);
}
for (const [name, b] of Object.entries(bad)) {
  const { r } = await mint(b);
  const reverted = !!r.execResult.exceptionError;
  console.log(`${reverted ? '✓' : '✗'} reject: ${name}`);
  if (!reverted) fail++;
}

// ── タイトル・ロイヤリティ・販売 ──
const E = 10n ** 18n;
async function tx(fn, args, { from = alice, value = 0n } = {}) {
  const data = hexToBytes(encodeFunctionData({ abi, functionName: fn, args }));
  const r = await call({ to: pix, data, from, value });
  return { ok: !r.execResult.exceptionError, gas: Number(r.execResult.executionGasUsed) + intrinsic(data) };
}
function check(name, cond) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fail++;
}
const tTitle = 'ドット "猫" \\ #1';
{
  const { r, gas } = await mint(encodePxm(blobArt(32, 8)), tTitle, 500);
  check(`mint with title (gas ${gas})`, !r.execResult.exceptionError);
}
const M = BigInt(id + 1);
const meta = JSON.parse(Buffer.from((await view('tokenURI', [M])).v.split(',')[1], 'base64').toString());
check('title round-trips through JSON escape', meta.name === tTitle);
check('Platform attribute', meta.attributes.some((a) => a.value === 'pixmint by mederu.art'));
check('external_url', meta.external_url === `https://pixmint.mederu.art/1/${M}`);
const cu = JSON.parse(Buffer.from((await view('contractURI', [])).v.split(',')[1], 'base64').toString());
check('contractURI', cu.name === 'pixmint' && cu.description.includes('mederu.art'));
check('untitled → pixmint #1', (await view('title', [1n])).v === 'pixmint #1');
const [rcv, ramt] = (await view('royaltyInfo', [M, 10000n])).v;
check('royaltyInfo = creator 5%', rcv.toLowerCase() === alice.toString() && ramt === 500n);
check('supports ERC-2981', (await view('supportsInterface', ['0x2a55205a'])).v === true);

check('reject royalty 10.01%', !!(await mint(encodePxm(blobArt(8, 2)), '', 1001)).r.execResult.exceptionError);
check('reject title with newline', !!(await mint(encodePxm(blobArt(8, 2)), 'a\nb')).r.execResult.exceptionError);
check('reject title 97 bytes', !!(await mint(encodePxm(blobArt(8, 2)), 'x'.repeat(97))).r.execResult.exceptionError);
check('accept title 96 bytes (日本語32文字)', !(await mint(encodePxm(blobArt(8, 2)), 'あ'.repeat(32))).r.execResult.exceptionError);

// 一次販売: 作者 alice が 1 ETH で出品 → bob が買う（ロイヤリティ無し・手数料 2.5%）
check('non-owner cannot list', !(await tx('list', [M, E], { from: bob })).ok);
const L = await tx('list', [M, E]);
check(`alice lists 1 ETH (gas ${L.gas})`, L.ok);
check('buy with wrong price reverts', !(await tx('buy', [M], { from: bob, value: E - 1n })).ok);
let a0 = await bal(alice);
const B = await tx('buy', [M], { from: bob, value: E });
check(`bob buys (gas ${B.gas})`, B.ok);
check('primary: alice gets 97.5%', (await bal(alice)) - a0 === (E * 975n) / 1000n);
check('listing cleared after sale', (await view('listings', [M])).v === 0n);
// 二次販売: bob が 2 ETH で出品 → carol が買う（手数料 2.5% + ロイヤリティ 5%）
await tx('list', [M, 2n * E], { from: bob });
a0 = await bal(alice);
const b0 = await bal(bob);
check('carol buys', (await tx('buy', [M], { from: carol, value: 2n * E })).ok);
check('secondary: alice royalty 5% = 0.1', (await bal(alice)) - a0 === E / 10n);
check('secondary: bob gets 92.5% = 1.85', (await bal(bob)) - b0 === (2n * E * 925n) / 1000n);
check('platformBalance = 0.025 + 0.05', (await view('platformBalance', [])).v === (E * 75n) / 1000n);
// 譲渡で出品が消える
await tx('list', [M, E], { from: carol });
await tx('transferFrom', [carol.toString(), bob.toString(), M], { from: carol });
check('transfer clears listing', (await view('listings', [M])).v === 0n);
check('buy after transfer reverts', !(await tx('buy', [M], { from: alice, value: E })).ok);
// 表示名
check('setName', (await tx('setName', ['ぐるぐる "hyena"'])).ok);
check('displayName stored', (await view('displayName', [alice.toString()])).v === 'ぐるぐる "hyena"');
const m2 = JSON.parse(Buffer.from((await view('tokenURI', [M])).v.split(',')[1], 'base64').toString());
check('tokenURI Artist attribute (escaped)', m2.attributes.some((a) => a.trait_type === 'Artist' && a.value === 'ぐるぐる "hyena"'));
check('reject name 49 bytes', !(await tx('setName', ['x'.repeat(49)])).ok);
check('reject name with newline', !(await tx('setName', ['a\nb'])).ok);
check('clear name', (await tx('setName', [''])).ok);
const m3 = JSON.parse(Buffer.from((await view('tokenURI', [M])).v.split(',')[1], 'base64').toString());
check('no Artist attribute when empty', !m3.attributes.some((a) => a.trait_type === 'Artist'));
// 表示名のなりすまし対策（. を含む・0x で始まる名前は不可）
check('reject name vitalik.eth', !(await tx('setName', ['vitalik.eth'])).ok);
check('reject name jesse.base.eth', !(await tx('setName', ['jesse.base.eth'])).ok);
check('reject name with "."', !(await tx('setName', ['a.b'])).ok);
check('reject name 0xC9DE…0C08', !(await tx('setName', ['0xC9DE…0C08'])).ok);
check('reject name 0Xabc', !(await tx('setName', ['0Xabc'])).ok);
check('accept name "0" / "x0x" / 日本語・絵文字', (await tx('setName', ['0'])).ok && (await tx('setName', ['x0x'])).ok && (await tx('setName', ['めでにゃん🐱'])).ok);
await tx('setName', ['']);

// 壊れた UTF-8 はタイトル・表示名とも拒む（JS の文字列からは作れないので calldata を手で組む）
async function rawTx(sig, types, values) {
  const data = hexToBytes(concatHex([toFunctionSelector(sig), encodeAbiParameters(types, values)]));
  const r = await call({ to: pix, data });
  return !r.execResult.exceptionError;
}
const pxmHex = bytesToHex(encodePxm(blobArt(8, 2)));
const rawMint = (t) => rawTx('mint(bytes,string,uint16)', [{ type: 'bytes' }, { type: 'bytes' }, { type: 'uint16' }], [pxmHex, t, 0]);
const rawName = (t) => rawTx('setName(string)', [{ type: 'bytes' }], [t]);
const badUtf8 = {
  '継続バイトだけ 80': '0x41804142',
  'overlong C0 AF': '0xc0af',
  'overlong E0 80 AF': '0xe080af',
  'overlong F0 80 80 AF': '0xf08080af',
  'サロゲート ED A0 80': '0xeda080',
  'U+110000 F4 90 80 80': '0xf4908080',
  'F5': '0xf5808080',
  '途中で切れる E3 81': '0x41e381',
  '継続バイト不足 E3 41 81': '0xe34181',
};
for (const [name, hex] of Object.entries(badUtf8)) {
  check(`reject title UTF-8 ${name}`, !(await rawMint(hex)));
  check(`reject name UTF-8 ${name}`, !(await rawName(hex)));
}
const goodUtf8 = { 'é C3 A9': '0xc3a9', 'あ E3 81 82': '0xe38182', 'U+FFFD EF BF BD': '0xefbfbd', '🐱 F0 9F 90 B1': '0xf09f90b1', 'U+10FFFF F4 8F BF BF': '0xf48fbfbf' };
for (const [name, hex] of Object.entries(goodUtf8)) check(`accept title UTF-8 ${name}`, await rawMint(hex));
check('reject title with DEL 7F', !(await rawMint('0x417f')));

// owner
check('fee cap 5%', !(await tx('setFeeBps', [501])).ok && (await tx('setFeeBps', [500])).ok);
check('non-owner cannot withdraw', !(await tx('withdraw', [bob.toString()], { from: bob })).ok);
const m0 = await bal(mederu);
check('withdraw platformBalance', (await tx('withdraw', [mederu.toString()])).ok && (await bal(mederu)) - m0 === (E * 75n) / 1000n);

// owner の譲渡は2段階（Ownable2Step）
const ownerIs = async (a) => (await view('owner', [])).v.toLowerCase() === a.toString();
check('non-owner cannot transferOwnership', !(await tx('transferOwnership', [carol.toString()], { from: bob })).ok);
check('transferOwnership → まだ owner は alice', (await tx('transferOwnership', [bob.toString()])).ok && (await ownerIs(alice)));
check('pendingOwner = bob', (await view('pendingOwner', [])).v.toLowerCase() === bob.toString());
check('carol cannot acceptOwnership', !(await tx('acceptOwnership', [], { from: carol })).ok);
check('bob acceptOwnership → owner = bob', (await tx('acceptOwnership', [], { from: bob })).ok && (await ownerIs(bob)));
check('alice is no longer owner', !(await tx('setMintOpen', [false])).ok && (await tx('setMintOpen', [true], { from: bob })).ok);

console.log(fail ? `\nFAILED: ${fail}` : '\nALL OK');
process.exit(fail ? 1 : 0);
