// pixmint — ドット絵エディタの中身
//
// atelier の PIX（mederux/packages/atelier/src/lib/pix/core.ts・palettes.ts）から、
// pixmint で使う分だけを写したもの。式・向き・境界の扱いは原本のまま。
// pixmint は1レイヤー＋背景色（mint するのは合成後の1枚なので、まずは単純に）。

export type PixGrid = (string | null)[][];
export type PixTool = 'pen' | 'eraser' | 'fill' | 'picker';

export function newGrid(size: number): PixGrid {
  return Array.from({ length: size }, () => Array<string | null>(size).fill(null));
}

export function cloneGrid(grid: PixGrid): PixGrid {
  return grid.map((r) => [...r]);
}

/** 原本 pixFloodFill。4近傍・キュー方式 */
export function floodFill(grid: PixGrid, row: number, col: number, replacement: string | null): void {
  const size = grid.length;
  if (row < 0 || row >= size || col < 0 || col >= size) return;
  const target = grid[row][col];
  if (target === replacement) return;
  const queue: [number, number][] = [[row, col]];
  while (queue.length) {
    const [r, c] = queue.shift() as [number, number];
    if (r < 0 || r >= size || c < 0 || c >= size) continue;
    if (grid[r][c] !== target) continue;
    grid[r][c] = replacement;
    queue.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }
}

/** 原本 pixDrawLineBresenham の走査（ドラッグ中の取りこぼしを埋める） */
export function lineCells(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const out: [number, number][] = [];
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1;
  const sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;
  let r = r0;
  let c = c0;
  for (let guard = 0; guard < 100_000; guard++) {
    out.push([r, c]);
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) {
      err -= dc;
      r += sr;
    }
    if (e2 < dr) {
      err += dr;
      c += sc;
    }
  }
  return out;
}

/** 背景色で埋めた1枚（mint に渡す形） */
export function flatten(grid: PixGrid, bg: string): PixGrid {
  return grid.map((row) => row.map((c) => c ?? bg));
}

export const GRID_SIZES = [8, 16, 32, 48, 64, 128];

/** 書き出しの目安サイズ。X は大きい画像でも 4096px まで受け付け、2048px あれば拡大表示でも粗くならない */
export const EXPORT_TARGET = 2048;
/** 1マスを何 px にするか（整数倍にしてドットをぼかさない） */
export const exportScale = (size: number) => Math.ceil(EXPORT_TARGET / size);

/** SNS 用の PNG。1マス = 整数 px の拡大（ぼかしなし）。背景色で埋めてから塗る */
export function exportPng(grid: PixGrid, bg: string): Promise<Blob | null> {
  const size = grid.length;
  const s = exportScale(size);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * s;
  const ctx = cv.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const col = grid[r][c];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(c * s, r * s, s, s);
      }
    }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

// 原本 PIX_PALETTES（velvet.html）から
export const PALETTES: Record<string, string[]> = {
  neon: [
    '#ff00ff', '#00ffff', '#ff0055', '#00ff88', '#7700ff', '#ff8800', '#00ff00', '#ff0000', '#0044ff', '#ffff00',
    '#ff66ff', '#66ffff', '#ff6688', '#88ffcc', '#aa77ff', '#ffcc66', '#66ff66', '#ff6666', '#6688ff', '#eeff66',
    // 3段目は pixmint で追加（濃いネオン・白・夜の黒）
    '#ff1493', '#00ffc8', '#c800ff', '#ff3c00', '#b4ff00', '#00b3ff', '#ffb000', '#ffffff', '#2a0a4a', '#05050f',
  ],
  earth: [
    '#3e2723', '#5d4037', '#795548', '#8a3a15', '#b03a25', '#c1553a', '#d2664f', '#e2941f', '#e3bf5e', '#f5e6ca',
    '#4e5a22', '#7c9142', '#3c7a2e', '#1b4d3e', '#363a5c', '#4f6472', '#64799c', '#8fb8cc', '#a1887f', '#b7ab84',
    // 3段目は pixmint で追加（土・シエナ・ヘザー・セージ・青緑・石）
    '#2b1d14', '#a0522d', '#a87c4f', '#c8a165', '#7b5e7b', '#8a9a5b', '#5e7d6f', '#2e5e6e', '#7a6f63', '#c9b8a8',
  ],
  gameboy: [
    '#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#e0f8d0', '#88c070', '#346856', '#081820', '#1c3030', '#4a6b5d',
    '#7aa47a', '#aed5aa', '#ccffcc', '#224422', '#558855', '#99cc99', '#ddffdd', '#113311', '#447744', '#88bb88',
    // 3段目は pixmint で追加（Game Boy Pocket の灰・初代の黄緑）
    '#c4cfa1', '#8b956d', '#4d533c', '#1f1f1f', '#e0dbcd', '#a89f94', '#706b66', '#3a3a32', '#d0e8a0', '#6e8c2e',
  ],
  // 参考画像（kawaii 系 30 色）から。右下が白く飛んでいた所は淡い色に置き換え（2026-10-23）
  kawaii: [
    '#f482b3', '#f495b5', '#f47771', '#f4897f', '#f1da97', '#f4ecbb', '#97da95', '#b9ffdb', '#6fcdff', '#c2f9fc',
    '#c88bff', '#d795ff', '#feb6f5', '#fde7f4', '#ffc6b3', '#ffd6b0', '#fee9a6', '#fffcd7', '#c3e7b9', '#bdf0d8',
    '#73dbf8', '#acfdfe', '#ea7fff', '#e6a1f2', '#f6afc1', '#f4c5d5', '#f5d3d2', '#e3d5ff', '#c9f2ff', '#ffffff',
  ],
  // 参考画像（kidcore 30 色）から
  kidcore: [
    '#dd005d', '#e00190', '#ff2ca1', '#ff7bb4', '#ffb4df', '#ee5acc', '#cb2dc8', '#f2229a', '#ff4d1f', '#ffab24',
    '#ff169f', '#ff7500', '#fecb02', '#33ce28', '#01a4ef', '#471a81', '#8014a5', '#bd2f91', '#ffa001', '#ffd200',
    '#f8869d', '#f8adcb', '#efec9d', '#85ac75', '#63cdbf', '#a4a4e2', '#9c74cd', '#3bb956', '#cbd000', '#fcf101',
  ],
  // 参考画像（holographic 30 色）から
  holo: [
    '#6179a7', '#827dc2', '#8788c1', '#87a6d2', '#74a0ff', '#62bcfa', '#01eee8', '#70f8c6', '#ffcfbe', '#eb819c',
    '#abddc4', '#88d9d0', '#b1b8e4', '#c39de8', '#df94d7', '#f888d5', '#f2adbf', '#ecbda9', '#e4d28a', '#d7d4a7',
    '#3242aa', '#4573b6', '#4f74de', '#a56de8', '#e855ec', '#f745d7', '#e857b4', '#df667a', '#dc7171', '#c19386',
  ],
  vaporwave: [
    '#ff00c8', '#00e5ff', '#ff00ff', '#00ffff', '#b200ff', '#39ff14', '#ffff00', '#ff0055', '#5500ff', '#0055ff',
    '#ff55aa', '#aa55ff', '#55aaff', '#aaff55', '#ffaa55', '#220022', '#440044', '#660066', '#880088', '#aa00aa',
    // 3段目は pixmint で追加（定番の vaporwave 5色＋夕焼け・夜）
    '#ff71ce', '#0096c7', '#05ffa1', '#d6a8ff', '#fffb96', '#ff9a8b', '#ffd1dc', '#94d0ff', '#2d1b69', '#0b0033',
  ],
};

export const DEFAULT_COLOR = '#c77dff';
export const DEFAULT_BG = '#0a0a1a';
