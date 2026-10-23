// pixmint — PXM v1: PIX のドット絵をチェーンに置くための圧縮形式
//
// チェーンには SVG ではなくこのバイト列を置き、SVG はコントラクトの tokenURI が組み立てる。
// atelierX の exportSVG は 1マスごとに `M x yh1v1Hxz`（約12バイト）を出すので、
// ETH のストレージ単価（約200 gas/byte）だとそのまま置くのは割高。
//
// レイアウト（全部 1バイト単位）:
//   [0]        version = 1
//   [1]        size    = グリッドの一辺（1..129）
//   [2]        n       = 色数（1..255）。palette[0] が背景（いちばん多い色）
//   [3..3+3n)  palette = RGB × n
//   [3+3n..)   runs    = (len, idx) の2バイト組。行優先・行をまたがない・len>=1
//
// pxmToSvg() は PixMint.sol の PxmSvg.render() と **1バイトも違わない** SVG を返す
// （test/run.mjs で突き合わせている）。フロントのプレビューにもこれを使う。

export type Grid = (string | null)[][];

export const PXM_VERSION = 1;
export const PXM_MAX_SIZE = 129;
export const PXM_MAX_COLORS = 255;
/** tokenURI の読み出しを約2,000万 gas に収めるための上限（PixMint.MAX_RUNS と同じ） */
export const PXM_MAX_RUNS = 4096;

function parseHex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) throw new Error(`pxm: bad color ${c}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * 合成済みのグリッド（全マス #rrggbb、null は bgColor で埋める）を PXM に。
 * レイヤー合成は atelierX の exportSVG と同じ前処理を呼び出し側でやってから渡す。
 */
export function encodePxm(grid: Grid, bgColor = '#000000'): Uint8Array {
  const size = grid.length;
  if (size < 1 || size > PXM_MAX_SIZE) throw new Error(`pxm: size ${size} out of range`);
  const cells: string[] = [];
  const count = new Map<string, number>();
  for (let r = 0; r < size; r++) {
    if (!grid[r] || grid[r].length !== size) throw new Error('pxm: grid is not square');
    for (let c = 0; c < size; c++) {
      const col = (grid[r][c] ?? bgColor).toLowerCase();
      cells.push(col);
      count.set(col, (count.get(col) ?? 0) + 1);
    }
  }
  // 背景 = いちばん多い色。残りは最初に出てきた順
  let bg = cells[0];
  for (const [col, k] of count) if (k > (count.get(bg) ?? 0)) bg = col;
  const palette = [bg, ...[...count.keys()].filter((c) => c !== bg)];
  if (palette.length > PXM_MAX_COLORS) {
    throw new Error(`pxm: ${palette.length} colors (max ${PXM_MAX_COLORS})`);
  }
  const index = new Map(palette.map((c, i) => [c, i]));

  const runs: number[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      const col = cells[r * size + c];
      let len = 1;
      while (c + len < size && cells[r * size + c + len] === col) len++;
      runs.push(len, index.get(col)!);
      c += len;
    }
  }

  if (runs.length / 2 > PXM_MAX_RUNS) {
    throw new Error(`pxm: ${runs.length / 2} runs (max ${PXM_MAX_RUNS}) — 細かすぎてオンチェーンで描けません`);
  }
  const out = new Uint8Array(3 + palette.length * 3 + runs.length);
  out[0] = PXM_VERSION;
  out[1] = size;
  out[2] = palette.length;
  palette.forEach((c, i) => out.set(parseHex(c), 3 + i * 3));
  out.set(runs, 3 + palette.length * 3);
  return out;
}

/** コントラクトの _validate と同じ規則。通らないものは mint で revert する */
export function validatePxm(d: Uint8Array): { size: number; colors: number; runs: number } {
  if (d.length < 3 || d[0] !== PXM_VERSION) throw new Error('pxm: bad header');
  const size = d[1];
  const n = d[2];
  if (size < 1 || size > PXM_MAX_SIZE || n < 1) throw new Error('pxm: bad header');
  const p0 = 3 + 3 * n;
  if (d.length < p0 || (d.length - p0) % 2 || (d.length - p0) / 2 > PXM_MAX_RUNS) throw new Error('pxm: bad length');
  let x = 0;
  let y = 0;
  for (let i = p0; i < d.length; i += 2) {
    const len = d[i];
    if (len === 0 || x + len > size || d[i + 1] >= n || y >= size) throw new Error('pxm: bad run');
    x += len;
    if (x === size) {
      x = 0;
      y++;
    }
  }
  if (y !== size || x !== 0) throw new Error('pxm: incomplete');
  return { size, colors: n, runs: (d.length - p0) / 2 };
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');

/** PxmSvg.render() と同じ出力。色ごとに <path> へまとめ、色 0 は背景の <rect> */
export function pxmToSvg(d: Uint8Array): string {
  const size = d[1];
  const n = d[2];
  const p0 = 3 + 3 * n;
  const col = (i: number) => hex2(d[3 + i * 3]) + hex2(d[4 + i * 3]) + hex2(d[5 + i * 3]);
  const paths: string[] = Array(n).fill('');
  let x = 0;
  let y = 0;
  for (let i = p0; i < d.length; i += 2) {
    const len = d[i];
    const idx = d[i + 1];
    paths[idx] += `M${x} ${y}h${len}v1h-${len}z`;
    x += len;
    if (x === size) {
      x = 0;
      y++;
    }
  }
  let s =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#${col(0)}"/>`;
  for (let c = 1; c < n; c++) if (paths[c]) s += `<path fill="#${col(c)}" d="${paths[c]}"/>`;
  return s + '</svg>';
}
