// pixmint — 画像 → ドット絵（グリッドのサイズに縮めて、色を減らす）
//
//   1. 縦横比を保ってグリッドに収める（余白は透明 = null）。縮小はブラウザの高品質な補間（面積平均に近い）
//   2. 半透明より薄いマスは透明にする
//   3. 色を減らす: median cut で N 色を作る、または今のパレットの近い色に寄せる。Floyd–Steinberg のディザも選べる
//   4. チェーン上の上限（ラン 4,096）を超えたら、収まるまで色数を自動で下げる
import { encodePxm, PXM_MAX_RUNS, validatePxm } from '../src/pxm';
import type { PixGrid } from './pix';

type RGB = [number, number, number];

export interface ConvertOptions {
  colors: number; // 目標の色数（2〜64）
  dither: boolean;
  palette?: string[]; // 指定すればこの色だけを使う
}

export interface ConvertResult {
  grid: PixGrid;
  colors: number; // 実際に使った色数
  runs: number;
  reduced: boolean; // 上限に収めるために色数を下げた
}

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const parse = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const dist = (a: RGB, b: RGB) => {
  // 人の目に近い重み（赤 2・緑 4・青 3）
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
};

/** 画像を size×size の RGBA に（縦横比を保って中央に置く） */
export function sample(img: CanvasImageSource & { width: number; height: number }, size: number): Uint8ClampedArray {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const s = Math.min(size / img.width, size / img.height);
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  ctx.drawImage(img, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
  return ctx.getImageData(0, 0, size, size).data;
}

/** median cut: 色の箱をいちばん幅のある軸で割り続けて n 色に */
function medianCut(pixels: RGB[], n: number): RGB[] {
  if (!pixels.length) return [];
  let boxes: RGB[][] = [pixels];
  while (boxes.length < n) {
    let bi = -1, axis = 0, range = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let lo = 255, hi = 0;
        for (const p of b) {
          if (p[k] < lo) lo = p[k];
          if (p[k] > hi) hi = p[k];
        }
        if (hi - lo > range) [range, bi, axis] = [hi - lo, i, k];
      }
    });
    if (bi < 0 || range === 0) break;
    const b = boxes[bi].sort((p, q) => p[axis] - q[axis]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => {
    const sum = [0, 0, 0];
    for (const p of b) for (let k = 0; k < 3; k++) sum[k] += p[k];
    return sum.map((v) => Math.round(v / b.length)) as RGB;
  });
}

function nearest(c: RGB, pal: RGB[]): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const d = dist(c, pal[i]);
    if (d < bd) [bd, best] = [d, i];
  }
  return best;
}

/** 決まった色数で1回変換する */
function quantize(rgba: Uint8ClampedArray, size: number, pal: RGB[], dither: boolean): PixGrid {
  const buf = new Float32Array(size * size * 3);
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    solid[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
    for (let k = 0; k < 3; k++) buf[i * 3 + k] = rgba[i * 4 + k];
  }
  const names = pal.map(hex);
  const grid: PixGrid = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!solid[i]) continue;
      const cur: RGB = [0, 1, 2].map((k) => Math.max(0, Math.min(255, buf[i * 3 + k]))) as RGB;
      const j = nearest(cur, pal);
      grid[r][c] = names[j];
      if (!dither) continue;
      // Floyd–Steinberg: 誤差を右・左下・下・右下へ 7/16・3/16・5/16・1/16（透明のマスには配らない）
      const err = [0, 1, 2].map((k) => cur[k] - pal[j][k]);
      const push = (rr: number, cc: number, w: number) => {
        if (rr >= size || cc < 0 || cc >= size || !solid[rr * size + cc]) return;
        for (let k = 0; k < 3; k++) buf[(rr * size + cc) * 3 + k] += (err[k] * w) / 16;
      };
      push(r, c + 1, 7);
      push(r + 1, c - 1, 3);
      push(r + 1, c, 5);
      push(r + 1, c + 1, 1);
    }
  return grid;
}

/** 画像（size×size の RGBA）をドット絵に。上限に収まるまで色数を下げる */
export function convert(rgba: Uint8ClampedArray, size: number, bg: string, opt: ConvertOptions): ConvertResult {
  const opaque: RGB[] = [];
  for (let i = 0; i < size * size; i++) if (rgba[i * 4 + 3] >= 128) opaque.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  const fixed = opt.palette?.map(parse);
  let n = Math.max(2, Math.min(64, opt.colors));
  let reduced = false;
  for (;;) {
    let pal: RGB[];
    if (fixed) {
      // パレットの色のうち、近いものとしてよく選ばれる n 色だけを使う
      const hits = new Map<number, number>();
      for (const p of opaque) {
        const j = nearest(p, fixed);
        hits.set(j, (hits.get(j) ?? 0) + 1);
      }
      pal = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([j]) => fixed[j]);
    } else {
      pal = medianCut([...opaque], n);
    }
    if (!pal.length) pal = [parse(bg)];
    const grid = quantize(rgba, size, pal, opt.dither);
    try {
      const info = validatePxm(encodePxm(grid.map((row) => row.map((c) => c ?? bg)), bg));
      return { grid, colors: info.colors, runs: info.runs, reduced };
    } catch {
      // ラン 4,096 超え。ディザは細かくなりやすいので、まず色数を下げる
      if (n <= 2) {
        // 2 色でも収まらない（細かいディザなど）→ ディザを切ってもう一度
        if (opt.dither) return { ...convert(rgba, size, bg, { ...opt, dither: false }), reduced: true };
        const grid2 = quantize(rgba, size, pal, false);
        return { grid: grid2, colors: pal.length, runs: PXM_MAX_RUNS + 1, reduced: true };
      }
      n = Math.max(2, Math.floor(n * 0.75));
      reduced = true;
    }
  }
}

/** ファイル / クリップボードの画像を読み込む */
export async function loadImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}
