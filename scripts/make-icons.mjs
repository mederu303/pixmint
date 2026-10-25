// pixmint — サイトのアイコン（favicon）を、チェーンにある作品のドット絵から作る
//
//   node --experimental-strip-types scripts/make-icons.mjs [chainId] [v4 の作品番号]
//   既定: Base の v4 #1（🐰 のスタンプ。2026-10-25 に favicon に決めた）
//
// ドットが崩れないよう、整数倍に拡大して書く。背景も絵の色のまま（透明にしない。明るいタブで白い顔が消えるので）
//   app/favicon.ico   … 16・32・48（PNG を入れた ICO）
//   app/icon.png      … 512（16 × 32）
//   app/apple-icon.png … 180（16 × 11 = 176 ＋ まわりに 2 マスぶん背景色）
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createPublicClient, http } from 'viem';
import { pxmToGrid } from '../src/pxm.ts';

const [chainArg = '8453', idArg = '1'] = process.argv.slice(2);
const RPC = { 8453: 'https://mainnet.base.org', 1: 'https://ethereum-rpc.publicnode.com', 84532: 'https://sepolia.base.org' };
const ADDR = { 8453: '0x14c3b1972ecb84069399786893dbb1c949ae49b1', 1: '0x53a5187f1f3c6b87582c97138a83da19fcaa7793', 84532: '0x351642eca5534f86d49c6164d6c2514d039bdc40' };
const abi = JSON.parse(fs.readFileSync(new URL('../lib/PixMint4.json', import.meta.url))).abi;
const c = createPublicClient({ transport: http(RPC[chainArg]) });
const data = await c.readContract({ address: ADDR[chainArg], abi, functionName: 'data', args: [BigInt(idArg)] });
const bytes = Uint8Array.from(Buffer.from(data.slice(2), 'hex'));
// pxmToGrid は色 0 を透明（null）にするので、背景色で埋め戻す
const bg = '#' + Buffer.from(bytes.slice(3, 6)).toString('hex');
const grid = pxmToGrid(bytes).map((row) => row.map((v) => v ?? bg));
const n = grid.length;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** n×n の絵を scale 倍し、まわりに pad px の背景を足した PNG */
function png(scale, pad = 0) {
  const size = n * scale + pad * 2;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const [br, bgc, bb] = rgb(bg);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // フィルタなし
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - pad) / scale), gy = Math.floor((y - pad) / scale);
      const inside = x >= pad && y >= pad && gx < n && gy < n;
      const [r, g, b] = inside ? rgb(grid[gy][gx]) : [br, bgc, bb];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tb) >>> 0);
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** PNG を入れた ICO（16・32・48） */
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = pngs.map(([s, p]) => {
    const e = Buffer.alloc(16);
    e[0] = s; e[1] = s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(p.length, 8); e.writeUInt32LE(offset, 12);
    offset += p.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...pngs.map(([, p]) => p)]);
}

if (n !== 16) console.log(`※ ${n}×${n} の絵です（16×16 を想定した倍率で書きます）`);
fs.writeFileSync(new URL('../app/favicon.ico', import.meta.url), ico([[16, png(1)], [32, png(2)], [48, png(3)]]));
fs.writeFileSync(new URL('../app/icon.png', import.meta.url), png(32));
fs.writeFileSync(new URL('../app/apple-icon.png', import.meta.url), png(11, 2));
console.log(`favicon.ico (16/32/48) · icon.png (${n * 32}) · apple-icon.png (${n * 11 + 4}) from chain ${chainArg} v4 #${idArg}, bg ${bg}`);
