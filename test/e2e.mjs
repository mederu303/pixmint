// pixmint — ブラウザ通し確認（ローカル hardhat node + 擬似ウォレット）
// 前提: npx hardhat node / scripts/deploy.mjs / next start -p 3100
// 実行: node test/e2e.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const APP = process.env.APP ?? 'http://127.0.0.1:3100';
const RPC = 'http://127.0.0.1:8545';
const ARTIST = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // hardhat #1
const BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // hardhat #2
const SHOTS = process.env.SHOTS ?? 'out/e2e';
fs.mkdirSync(SHOTS, { recursive: true });

const rpc = async (method, params = []) =>
  (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
const balance = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));

// MetaMask の代わり。リクエストを hardhat node にそのまま流す（node 側のアカウントは署名済み扱い）
const wallet = (acct) => `
  (() => {
    const RPC = '${RPC}';
    const listeners = {};
    let id = 0;
    window.ethereum = {
      isMetaMask: true,
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${acct}'];
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: params ?? [] }) });
        const j = await r.json();
        if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
        return j.result;
      },
      on(ev, fn) { (listeners[ev] ??= []).push(fn); },
      removeListener(ev, fn) { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); },
    };
  })();`;

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) fail++; };

// 環境の Chromium を使う（無ければ Playwright 同梱のもの）
const exe = ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];

// ウォレットはアプリのメニューの「テスト用：作者／購入者」（wagmi の mock → hardhat node）を使う
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.getItem('pixmint-lang') || localStorage.setItem('pixmint-lang', 'ja'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}

// ── 1. アーティスト: 描く → mint ──
const a = await open();
await a.goto(APP + '/');
await a.waitForSelector('canvas');
const box = await a.locator('canvas').boundingBox();
const cell = (r, c, n = 16) => ({ x: box.x + (c + 0.5) * (box.width / n), y: box.y + (r + 0.5) * (box.height / n) });
// 枠と斜め線
const drag = async (pts) => {
  await a.mouse.move(pts[0].x, pts[0].y);
  await a.mouse.down();
  for (const p of pts.slice(1)) await a.mouse.move(p.x, p.y, { steps: 6 });
  await a.mouse.up();
};
await drag([cell(2, 2), cell(2, 13), cell(13, 13), cell(13, 2), cell(2, 2)]);
await a.locator('.swatches button').nth(1).click();
// 色を変えると選んでいるパレットの枠も変わる
await a.locator('.hex').fill('#123456');
check('editing color updates swatch', (await a.locator('.swatches button').nth(1).getAttribute('style')).includes('rgb(18, 52, 86)'));
await drag([cell(4, 4), cell(11, 11)]);
await a.locator('.swatches button').nth(5).click();
await a.getByRole('button', { name: '塗りつぶし' }).click();
check('fill tool active', (await a.locator('.tb.on').innerText()).includes('塗りつぶし'));
await a.mouse.click(cell(10, 5).x, cell(10, 5).y);
await a.getByPlaceholder('無題なら pixmint #番号').fill('テスト "ねこ" #1');
await a.getByRole('button', { name: '7.5%' }).click();
check('preview shows bytes', /bytes/.test(await a.locator('.meta').first().innerText()));
await a.getByRole('button', { name: 'ウォレット接続' }).first().click();
const menu = await a.locator('.menu').innerText();
check(`wallet menu: ${menu.replace(/\n/g, ' / ')}`, menu.includes('WalletConnect') && menu.includes('テスト用：作者'));
await a.getByRole('button', { name: 'テスト用：作者' }).click();
await a.getByRole('button', { name: 'Local で mint' }).click();
await a.getByText('mint しました').waitFor({ timeout: 30000 });
await a.screenshot({ path: `${SHOTS}/1-studio.png` });
check('minted', true);

// ── 2. 作品ページ → 出品 ──
await a.getByRole('link', { name: '作品ページへ' }).click();
await a.getByRole('heading', { name: 'テスト "ねこ" #1' }).waitFor();
check('title shown with quotes', true);
const meta = await a.locator('.panel.meta').innerText();
check('royalty 7.5% shown', meta.includes('7.5%'));
check('creator shown as short address (no ENS locally)', meta.includes('0x7099'));
await a.getByPlaceholder('0.01').fill('0.5');
await a.getByRole('button', { name: '出品' }).click();
await a.getByText('販売中').waitFor({ timeout: 30000 });
await a.screenshot({ path: `${SHOTS}/2-listed.png` });
check('listed', true);
const workUrl = a.url();

// ── 3. 別の人: 購入 ──
const b = await open();
await b.goto(workUrl);
await b.getByText('販売中').waitFor();
const breakdown = await b.locator('.panel.stack').innerText();
check('primary sale: no royalty line', !breakdown.includes('作者へ'));
await b.getByRole('button', { name: 'ウォレット接続' }).first().click();
await b.getByRole('button', { name: 'テスト用：購入者' }).click();
const before = await balance(ARTIST);
await b.getByRole('button', { name: '購入する' }).click();
await b.getByText('出品する（pixmint 内で販売').waitFor({ timeout: 30000 }).catch(async (e) => { await b.screenshot({ path: `${SHOTS}/x-buy-fail.png` }); console.log('PAGE:', (await b.locator('main').innerText()).slice(0, 800)); throw e; });
const got = (await balance(ARTIST)) - before;
check(`artist received 0.4875 ETH (got ${Number(got) / 1e18})`, got === 487_500_000_000_000_000n);
const meta2 = await b.locator('.panel.meta').innerText();
check('owner is buyer now', meta2.includes('0x3C44'));
await b.screenshot({ path: `${SHOTS}/3-bought.png` });

// ── 3.5 表示名: 作者が名前を付ける → 作品・一覧・tokenURI に出る ──
await a.goto(APP + '/me');
await a.getByPlaceholder('例: medenyan').fill('guruguruhyena');
await a.getByRole('button', { name: 'Local に保存' }).click();
await a.locator('.panel.meta b', { hasText: 'guruguruhyena' }).first().waitFor({ timeout: 30000 });
await a.screenshot({ path: `${SHOTS}/5-me.png` });
check('name saved', true);
check('header shows name', (await a.locator('header').innerText()).includes('guruguruhyena'));
await b.goto(workUrl);
await b.getByText('by guruguruhyena').waitFor({ timeout: 15000 });
check('work page shows artist name to others', true);

// ── 3.6 EN / JP ──
await b.getByRole('button', { name: 'EN' }).click();
check('EN toggle', /works/i.test(await b.locator('header').innerText()));
await b.getByRole('button', { name: 'JP' }).click();

// ── 4. 一覧 ──
await b.goto(APP + '/gallery');
await b.locator('.card').first().waitFor();
check('gallery shows the work', (await b.locator('.card').count()) >= 1);
await b.locator('.card', { hasText: 'guruguruhyena' }).first().waitFor({ timeout: 15000 });
check('gallery shows artist name', true);
await b.screenshot({ path: `${SHOTS}/4-gallery.png` });

// ── 5. tokenURI がチェーンから読めて、タイトルが壊れていない ──
const { createPublicClient, http } = await import('viem');
const art = JSON.parse(fs.readFileSync('lib/PixMint.json'));
const pc = createPublicClient({ transport: http(RPC) });
const uri = await pc.readContract({ address: '0x5fbdb2315678afecb367f032d93f642f64180aa3', abi: art.abi, functionName: 'tokenURI', args: [1n] });
const j = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
check('tokenURI name', j.name === 'テスト "ねこ" #1');
check('tokenURI external_url', j.external_url === 'https://pixmint.mederu.art/31337/1');
check('tokenURI Artist', j.attributes.some((x) => x.trait_type === 'Artist' && x.value === 'guruguruhyena'));
fs.writeFileSync(`${SHOTS}/token1.svg`, Buffer.from(j.image.split(',')[1], 'base64'));

check(`no page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`, errors.length === 0);
await browser.close();
console.log(fail ? `\nFAILED: ${fail}` : '\nE2E OK');
process.exit(fail ? 1 : 0);
