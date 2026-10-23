// pixmint — 画像 → ドット絵（グリッドのサイズに縮めて、色を減らす）
//
//   1. 縦横比を保ってグリッドに収める（余白は透明 = null）。縮小はブラウザの高品質な補間（面積平均に近い）
//   2. 半透明より薄いマスは透明にする
//   3. 色を減らす: median cut で N 色を作る、または今のパレットの近い色に寄せる。Floyd–Steinberg のディザも選べる
//   4. チェーン上の上限（ラン 2,048）を超えたら、収まるまで調整する。
//      既定は「色数を優先」: 小さな点（1〜数マスだけ違う色）を周りの色にまとめてランを減らす。色数はそのまま
//      「細部を優先」: 色数を下げる（点は残るが色が減る）。色数を優先でも収まらないときは色数を下げる
import { encodePxm, PXM_MAX_RUNS, validatePxm } from '../src/pxm';
import type { PixGrid } from './pix';

type RGB = [number, number, number];

export interface ConvertOptions {
  colors: number; // 目標の色数（2〜64）
  dither: boolean;
  palette?: string[]; // 指定すればこの色だけを使う
  /**
   * 上限を超えたときに何を残すか。
   * 'balanced' = 色数をいくつか試し、元の画像にいちばん近く見えるものを選ぶ（既定）
   * 'colors' = 色数を残して小さな点をまとめる / 'detail' = 点を残して色数を下げる
   */
  keep?: 'balanced' | 'colors' | 'detail';
}

export interface ConvertResult {
  grid: PixGrid;
  colors: number; // 実際に使った色数
  runs: number;
  reduced: boolean; // 上限に収めるために色数を下げた
  simplified: boolean; // 上限に収めるために小さな点をまとめた
  balanced?: boolean; // 'balanced' で色数を選んだ
}

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const parse = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const dist = (a: RGB, b: RGB) => {
  // 人の目に近い重み（赤 2・緑 4・青 3）
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
};

/**
 * ドット絵の拡大画像か調べて、元のマス目を読み取る（pixmint の PNG 書き出しや、他のツールで拡大したドット絵）。
 * 色が変わる位置の間隔の最大公約数をマスの大きさとみなし、各マスの真ん中の色を拾う。
 * JPEG のにじみに負けないよう、色の差が小さい変化は無視する。見つからなければ null
 */
export function detectPixelArt(img: CanvasImageSource & { width: number; height: number }): { w: number; h: number; rgba: Uint8ClampedArray } | null {
  const W = img.width, H = img.height;
  if (W < 16 || H < 16 || W * H > 4096 * 4096) return null;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const px = (x: number, y: number) => (y * W + x) * 4;
  // はっきりした色の変わり目だけ拾う（JPEG のにじみの小さな変化は無視）
  const differ = (a: number, b: number) =>
    Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]) + Math.abs(d[a + 3] - d[b + 3]) > 96;
  // 何本かの行・列で、色の変わり目の位置を集める（にじみで続けて出る変わり目は最初の1つだけ）
  const xs: number[] = [], ys: number[] = [];
  const scan = (len: number, lines: number, at: (line: number, i: number) => number, out: number[]) => {
    for (let k = 1; k <= 24; k++) {
      const line = Math.floor((lines * k) / 25);
      let prev = -9;
      for (let i = 1; i < len; i++)
        if (differ(at(line, i), at(line, i - 1))) {
          if (i - prev > 2) out.push(i);
          prev = i;
        }
    }
  };
  scan(W, H, (y, x) => px(x, y), xs);
  scan(H, W, (x, y) => px(x, y), ys);
  if (xs.length + ys.length < 8) return null;
  // マスの数 n を少ない方から試し、変わり目のほとんど（90%）がマスの境目（±許容）に乗る最初の n を選ぶ
  const fits = (pos: number[], cell: number) => {
    const tol = Math.max(1.5, cell * 0.12);
    let ok = 0;
    for (const p of pos) {
      const m = p % cell;
      if (m <= tol || cell - m <= tol) ok++;
    }
    return ok >= pos.length * 0.9;
  };
  let w = 0, h = 0;
  for (let n = 2; n <= 129; n++) {
    const cell = W / n;
    if (cell < 6) break; // マスが小さすぎると何でも当てはまってしまう（写真をドット絵と間違える）
    const hn = Math.round(H / cell);
    if (hn < 1 || hn > 129 || Math.abs(H / cell - hn) > 0.15) continue;
    if (fits(xs, cell) && fits(ys, H / hn)) {
      w = n;
      h = hn;
      break;
    }
  }
  if (!w) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const x = Math.min(W - 1, Math.floor((c + 0.5) * (W / w))), y = Math.min(H - 1, Math.floor((r + 0.5) * (H / h)));
      rgba.set(d.subarray(px(x, y), px(x, y) + 4), (r * w + c) * 4);
    }
  return { w, h, rgba };
}

/** 読み取ったドット絵を size×size に。小さければ拡大せず真ん中に置く・大きければ最近傍で縮める（色を混ぜない） */
export function placePixels(art: { w: number; h: number; rgba: Uint8ClampedArray }, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const s = Math.min(1, size / art.w, size / art.h);
  const w = Math.max(1, Math.round(art.w * s)), h = Math.max(1, Math.round(art.h * s));
  const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const sr = Math.min(art.h - 1, Math.floor(r / s)), sc = Math.min(art.w - 1, Math.floor(c / s));
      out.set(art.rgba.subarray((sr * art.w + sc) * 4, (sr * art.w + sc) * 4 + 4), ((oy + r) * size + ox + c) * 4);
    }
  return out;
}

/** 背景と同じ色（ほぼ同じも含む）のマスを透明にする。書き出した PNG の背景を拾わないように */
export function dropBackground(rgba: Uint8ClampedArray, bg: string): Uint8ClampedArray {
  const [br, bgG, bb] = parse(bg);
  const out = rgba.slice();
  for (let i = 0; i < out.length; i += 4)
    if (Math.abs(out[i] - br) + Math.abs(out[i + 1] - bgG) + Math.abs(out[i + 2] - bb) <= 24) out[i + 3] = 0;
  return out;
}

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
/** 元の画像との見た目の差（色の差の合計。透明かどうかが違うマスは大きく数える）。小さいほど元に近い */
function difference(rgba: Uint8ClampedArray, size: number, grid: PixGrid): number {
  let e = 0;
  const MISS = 3 * 255 * 255 * 3;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const i = (r * size + c) * 4;
      const solid = rgba[i + 3] >= 128;
      const v = grid[r][c];
      if (!solid) {
        if (v) e += MISS;
        continue;
      }
      if (!v) {
        e += MISS;
        continue;
      }
      e += dist([rgba[i], rgba[i + 1], rgba[i + 2]], parse(v));
    }
  return e;
}

export function convert(rgba: Uint8ClampedArray, size: number, bg: string, opt: ConvertOptions): ConvertResult {
  if ((opt.keep ?? 'balanced') === 'balanced') return convertBalanced(rgba, size, bg, opt);
  return convertOnce(rgba, size, bg, opt);
}

/**
 * 色数の候補（指定した色数から少しずつ減らす）をそれぞれ上限に収め、元の画像にいちばん近いものを選ぶ。
 * 色が多いと点をまとめる量が増えて横に流れ、少ないと色が足りなくなる。その間のちょうどよい所を探す
 */
function convertBalanced(rgba: Uint8ClampedArray, size: number, bg: string, opt: ConvertOptions): ConvertResult {
  const first = convertOnce(rgba, size, bg, { ...opt, keep: 'colors' });
  if (!first.simplified && !first.reduced) return first; // そのままで収まる
  const top = Math.max(2, Math.min(64, opt.colors));
  const ns = [...new Set([top, 24, 20, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3].filter((n) => n <= top && n >= 2))];
  let best = first;
  let bestErr = first.runs <= PXM_MAX_RUNS ? difference(rgba, size, first.grid) : Infinity;
  for (const n of ns) {
    if (n === top) continue;
    const r = convertOnce(rgba, size, bg, { ...opt, colors: n, keep: 'colors' });
    if (r.runs > PXM_MAX_RUNS) continue;
    const e = difference(rgba, size, r.grid);
    if (e < bestErr) [best, bestErr] = [r, e];
  }
  return { ...best, balanced: true };
}

function convertOnce(rgba: Uint8ClampedArray, size: number, bg: string, opt: ConvertOptions): ConvertResult {
  const opaque: RGB[] = [];
  for (let i = 0; i < size * size; i++) if (rgba[i * 4 + 3] >= 128) opaque.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  const fixed = opt.palette?.map(parse);
  let n = Math.max(2, Math.min(64, opt.colors));
  // 元の色数が目標以下なら（ドット絵など）、色を作り直さずそのまま使う
  if (!fixed) {
    const uniq = new Map<string, RGB>();
    for (const p of opaque) uniq.set(hex(p), p);
    if (uniq.size <= n) {
      const grid = quantize(rgba, size, [...uniq.values()], false);
      try {
        const info = validatePxm(encodePxm(grid.map((row) => row.map((c) => c ?? bg)), bg));
        return { grid, colors: info.colors, runs: info.runs, reduced: false, simplified: false };
      } catch {}
    }
  }
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
      return { grid, colors: info.colors, runs: info.runs, reduced, simplified: false };
    } catch {
      // 色数を優先: 小さな点をまとめて収める（最初の色数のときだけ。収まらなければ色数を下げる）
      if (opt.keep !== 'detail' && !reduced) {
        const fit = simplifyToFit(grid, bg, PXM_MAX_RUNS);
        if (fit) {
          const info = validatePxm(encodePxm(fit.map((row) => row.map((c) => c ?? bg)), bg));
          return { grid: fit, colors: info.colors, runs: info.runs, reduced: false, simplified: true };
        }
      }
      // ラン 2,048 超え。ディザは細かくなりやすいので、まず色数を下げる
      if (n <= 2) {
        // 2 色でも収まらない（細かいディザなど）→ ディザを切ってもう一度
        if (opt.dither) return { ...convertOnce(rgba, size, bg, { ...opt, dither: false }), reduced: true };
        const grid2 = quantize(rgba, size, pal, false);
        return { grid: grid2, colors: pal.length, runs: PXM_MAX_RUNS + 1, reduced: true, simplified: false };
      }
      n = Math.max(2, Math.floor(n * 0.75));
      reduced = true;
    }
  }
}

/** 読み込んだ画像（ImageBitmap か、SVG を描いたキャンバス） */
export type LoadedImage = CanvasImageSource & { width: number; height: number };

/** ラン数（空のマスは背景色として数える。encodePxm と同じ数え方） */
export function countRuns(grid: PixGrid, bg: string): number {
  let n = 0;
  for (const row of grid) {
    let prev: string | undefined;
    for (const c of row) {
      const k = c ?? bg;
      if (k !== prev) n++;
      prev = k;
    }
  }
  return n;
}

/**
 * 色数を変えずにランを減らす。上限に収まった時点でやめる（必要以上に崩さない）。
 *   1. 点の掃除（最大 2 回）: 周り 8 マスに同じ色が 1 つも無いマスを、周りでいちばん多い色にする
 *   2. 短いランの吸収: 長さ k 以下のランを、左右のうち色が近い方に塗り替える（k = 1, 2, 3, … と少しずつ上げる）
 * 収まらなければ null（呼び出し側で色数を下げる）
 */
export function simplifyToFit(src: PixGrid, bg: string, max: number): PixGrid | null {
  const size = src.length;
  const key = (c: string | null) => c ?? bg;
  let g = src.map((r) => [...r]);
  if (countRuns(g, bg) <= max) return g;
  for (let pass = 0; pass < 2; pass++) {
    const next = g.map((r) => [...r]);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const me = key(g[r][c]);
        const counts = new Map<string, { n: number; v: string | null }>();
        let same = false;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
            const v = g[rr][cc], k = key(v);
            if (k === me) same = true;
            const e = counts.get(k);
            if (e) e.n++;
            else counts.set(k, { n: 1, v });
          }
        if (same || !counts.size) continue;
        next[r][c] = [...counts.values()].sort((a, b) => b.n - a.n)[0].v;
      }
    g = next;
    if (countRuns(g, bg) <= max) return g;
  }
  const rgbOf = (c: string | null): RGB => parse(key(c));
  let total = countRuns(g, bg);
  // 行 r の x を含むランの左右の端
  const span = (row: (string | null)[], x: number) => {
    let i = x, j = x;
    while (i > 0 && key(row[i - 1]) === key(row[x])) i--;
    while (j < size - 1 && key(row[j + 1]) === key(row[x])) j++;
    return [i, j] as const;
  };
  // 塗り先: 左右のうち、色が近い方。上下のマスと同じ色なら優先する（横に流れた筋にならないように）
  const target = (r: number, i: number, j: number) => {
    const row = g[r];
    const me = rgbOf(row[i]);
    const opts: (string | null)[] = [];
    if (i > 0) opts.push(row[i - 1]);
    if (j < size - 1) opts.push(row[j + 1]);
    let best: string | null = null, bd = Infinity;
    for (const o of opts) {
      let d = dist(me, rgbOf(o));
      let vert = 0;
      for (let x = i; x <= j; x++) {
        if (r > 0 && key(g[r - 1][x]) === key(o)) vert++;
        if (r < size - 1 && key(g[r + 1][x]) === key(o)) vert++;
      }
      d *= 1 / (1 + vert); // 上下とつながる色ほど選びやすく
      if (d < bd) [bd, best] = [d, o];
    }
    return { to: best, d: bd };
  };
  for (let k = 1; k <= Math.max(2, Math.floor(size / 4)); k++) {
    // 長さ k 以下のランを集め、目立たない（塗り先と色が近い）ものから塗る。収まった時点でやめる
    const cands: { r: number; x: number; d: number }[] = [];
    for (let r = 0; r < size; r++) {
      let i = 0;
      while (i < size) {
        const [, j] = span(g[r], i);
        if (j - i + 1 <= k && (i > 0 || j < size - 1)) cands.push({ r, x: i, d: target(r, i, j).d });
        i = j + 1;
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const { r, x } of cands) {
      const row = g[r];
      const [i, j] = span(row, x);
      if (j - i + 1 > k || (i === 0 && j === size - 1)) continue;
      const { to } = target(r, i, j);
      // 塗るとランは 1 つ減り、左右が同じ色なら 2 つ減る
      const both = i > 0 && j < size - 1 && key(row[i - 1]) === key(row[j + 1]);
      for (let y = i; y <= j; y++) row[y] = to;
      total -= both ? 2 : 1;
      if (total <= max) return g;
    }
  }
  return null;
}

/** ファイル / クリップボードの画像を読み込む。SVG は createImageBitmap で読めないので、<img> で描いてキャンバスにする */
export async function loadImage(file: Blob): Promise<LoadedImage> {
  const isSvg = file.type === 'image/svg+xml' || (file instanceof File && /\.svg$/i.test(file.name));
  if (!isSvg) return createImageBitmap(file);
  return renderSvg(await file.text());
}

/**
 * SVG をキャンバスに描く。大きさは viewBox（無ければ width / height）から取り、整数倍に拡大して 1024px 前後にする。
 * ドット絵の SVG（pixmint の svg()・atelier の exportSVG など）はマスの境目がそろうので、そのあと 1マスずつ読み取れる
 */
export async function renderSvg(text: string): Promise<HTMLCanvasElement> {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('not an SVG');
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  let w = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(svg.getAttribute('width') ?? '');
  let h = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(svg.getAttribute('height') ?? '');
  if (!(w > 0) || !(h > 0)) [w, h] = [512, 512];
  const scale = Math.max(1, Math.floor(1024 / Math.max(w, h)));
  const W = Math.round(w * scale), H = Math.round(h * scale);
  // 描く大きさを指定し直す（width/height が % や無いときでも、決めた大きさで描かれるように）。ぼかさない
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  if (!svg.getAttribute('shape-rendering')) svg.setAttribute('shape-rendering', 'crispEdges');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, W, H);
    return cv;
  } finally {
    URL.revokeObjectURL(url);
  }
}
