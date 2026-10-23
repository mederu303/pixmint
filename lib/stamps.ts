// pixmint — ドット絵スタンプ（オリジナル。1文字 = 1マス）
//   '.' = 透明（下の絵を残す） / '1' = 今の色（スタンプを好きな色に染められる）
//   ほかの文字は各スタンプの colors で色を決める
import type { PixGrid } from './pix';

export interface Stamp {
  id: string;
  rows: string[];
  colors: Record<string, string>;
}

const K = '#14121f'; // 輪郭

export const STAMPS: Stamp[] = [
  {
    id: 'heart',
    colors: { k: K, w: '#ffffff' },
    rows: [
      '................',
      '..kkkk....kkkk..',
      '.k1111k..k1111k.',
      'k11ww11kk111111k',
      'k1ww1111111111k.',
      'k1w11111111111k.',
      'k11111111111111k',
      '.k111111111111k.',
      '..k1111111111k..',
      '...k11111111k...',
      '....k111111k....',
      '.....k1111k.....',
      '......k11k......',
      '.......kk.......',
      '................',
      '................',
    ],
  },
  {
    id: 'star',
    colors: { k: K, w: '#ffffff' },
    rows: [
      '.......kk.......',
      '......k11k......',
      '......k11k......',
      '.....k1w11k.....',
      'kkkkkk1w111kkkkk',
      'k11111111111111k',
      '.k111111111111k.',
      '..k1111111111k..',
      '...k11111111k...',
      '...k11111111k...',
      '..k1111kk1111k..',
      '..k111k..k111k..',
      '.k111k....k111k.',
      '.k11k......k11k.',
      'kkkk........kkkk',
      '................',
    ],
  },
  {
    id: 'cat',
    colors: { k: K, p: '#ff8fc8', e: '#14121f', w: '#ffffff' },
    rows: [
      '.kk..........kk.',
      'k11k........k11k',
      'k1p1k......k1p1k',
      'k1pp1kkkkkk1pp1k',
      'k111111111111111',
      'k111111111111111',
      'k11ekk1111ekk11k',
      'k11ewk1111ewk11k',
      'k11eek1111eek11k',
      'k11111111111111k',
      'k1111pp11pp1111k',
      'k1111111pp11111k',
      '.k11111k11k111k.',
      '..k111111111kk..',
      '...kkkkkkkkk....',
      '................',
    ],
  },
  {
    id: 'ghost',
    colors: { k: K, w: '#ffffff', b: '#2a2a4a', c: '#ff8fc8' },
    rows: [
      '.....kkkkkk.....',
      '...kkwwwwwwkk...',
      '..kwwwwwwwwwwk..',
      '.kwwwwwwwwwwwwk.',
      '.kwwbbwwwwbbwwk.',
      'kwwwbbwwwwbbwwwk',
      'kwwwwwwwwwwwwwwk',
      'kwccwwwkkwwwccwk',
      'kwwwwwwkkwwwwwwk',
      'kwwwwwwwwwwwwwwk',
      'kwwwwwwwwwwwwwwk',
      'kwwwwwwwwwwwwwwk',
      'kwwwwwwwwwwwwwwk',
      'kwwkwwwkkwwwkwwk',
      'kwk.kwk..kwk.kwk',
      '.k...k....k...k.',
    ],
  },
  {
    id: 'mushroom',
    colors: { k: K, w: '#ffffff', s: '#f6e7c8' },
    rows: [
      '.....kkkkkk.....',
      '...kk111111kk...',
      '..k11ww1111ww1k.',
      '.k11wwww11wwww1k',
      '.k111ww1111ww11k',
      'k1111111ww11111k',
      'k11ww11wwww111wk',
      'k1wwww11ww111wwk',
      '.kkkkkkkkkkkkkk.',
      '....kssssssk....',
      '....kskssksk....',
      '....kssssssk....',
      '....kssssssk....',
      '.....kssssk.....',
      '......kkkk......',
      '................',
    ],
  },
  {
    id: 'flower',
    colors: { k: K, y: '#ffd23a', g: '#38c96b' },
    rows: [
      '......kkkk......',
      '.....k1111k.....',
      '..kkk111111kkk..',
      '.k111k1111k111k.',
      '.k1111kyyk1111k.',
      '.k111kyyyyk111k.',
      '..kk1kyyyyk1kk..',
      '.k1111kyyk1111k.',
      '.k111k1111k111k.',
      '..kkk111111kkk..',
      '.....k1111k.....',
      '......kggk......',
      '..kk...kgk..kk..',
      '.kggk..kgk.kggk.',
      '..kggkkkgkkggk..',
      '....kkgggggkk...',
    ],
  },
  {
    id: 'bot',
    colors: { k: K, s: '#c9cdd6', d: '#8a8fa0', e: '#39ff7a', r: '#ff3c5a' },
    rows: [
      '.......rr.......',
      '.......kk.......',
      '..kkkkkkkkkkkk..',
      '.ksssssssssssssk',
      '.kskkkkkkkkkksdk',
      '.kskeekkkkeeksdk',
      '.kskkeekkeekksdk',
      '.kskkkkkkkkkksdk',
      '.ksssssssssssssk',
      '.kss1111111111dk',
      '.ksssssssssssssk',
      '..kkkkkkkkkkkkk.',
      '...ksdk...ksdk..',
      '...ksdk...ksdk..',
      '..kkkkk...kkkkk.',
      '................',
    ],
  },
  {
    id: 'smile',
    colors: { k: K, y: '#ffd23a', w: '#ffffff' },
    rows: [
      '.....kkkkkk.....',
      '...kkyyyyyykk...',
      '..kyywwyyyyyyk..',
      '.kyywyyyyyyyyyk.',
      '.kyyyykyyyykyyk.',
      'kyyyyykyyyykyyyk',
      'kyyyyykyyyykyyyk',
      'kyyyyyyyyyyyyyyk',
      'kyykyyyyyyyykyyk',
      'kyyykyyyyyykyyyk',
      '.kyyykkkkkkyyyk.',
      '.kyyyyyyyyyyyyk.',
      '..kyyyyyyyyyyk..',
      '...kkyyyyyykk...',
      '.....kkkkkk.....',
      '................',
    ],
  },
  {
    id: 'bolt',
    colors: { k: K, w: '#ffffff' },
    rows: [
      '.........kkkkk..',
      '........k1111k..',
      '.......k1111k...',
      '......k1ww1k....',
      '.....k1ww1k.....',
      '....k1111kkkkk..',
      '...k111111111k..',
      '..kkkkkk1111k...',
      '......k1111k....',
      '.....k1111k.....',
      '....k111kk......',
      '...k11kk........',
      '..k1kk..........',
      '..kk............',
      '................',
      '................',
    ],
  },
  {
    id: 'note',
    colors: { k: K },
    rows: [
      '.......kkkkkkkk.',
      '.......k1111111k',
      '.......k1kkkkk1k',
      '.......k1k...k1k',
      '.......k1k...k1k',
      '.......k1k...k1k',
      '.......k1k...k1k',
      '....kkkk1k.kkk1k',
      '...k11111kk1111k',
      '..k111111kk1111k',
      '..k111111k.k11k.',
      '...k1111k...kk..',
      '....kkkk........',
      '................',
      '................',
      '................',
    ],
  },
  {
    id: 'sparkle',
    colors: { w: '#ffffff' },
    rows: [
      '.......1........',
      '.......1........',
      '......111.......',
      '......1w1.......',
      '.....11w11......',
      '1111111w1111111.',
      '.....11w11......',
      '......1w1.......',
      '......111....1..',
      '.......1....111.',
      '.......1.....1..',
      '................',
      '..1.............',
      '.111............',
      '..1.............',
      '................',
    ],
  },
  {
    id: 'skull',
    colors: { k: K, w: '#f4f1ea' },
    rows: [
      '....kkkkkkkk....',
      '..kkwwwwwwwwkk..',
      '.kwwwwwwwwwwwwk.',
      'kwwwwwwwwwwwwwwk',
      'kwwkkkwwwwkkkwwk',
      'kwk111kwwk111kwk',
      'kwk111kwwk111kwk',
      'kwwkkkwkkwkkkwwk',
      '.kwwwwkwwkwwwwk.',
      '..kwwwwwwwwwwk..',
      '...kwkwkwkwkwk..',
      '...kwkwkwkwkwk..',
      '....kkkkkkkkk...',
      '................',
      '................',
      '................',
    ],
  },
];

/** スタンプ → マス目（今の色を当てはめる） */
export function stampGrid(s: Stamp, color: string): PixGrid {
  return s.rows.map((row) => [...row].map((ch) => (ch === '.' ? null : ch === '1' ? color : s.colors[ch] ?? color)));
}

/** 右に 90° 回す */
export function rotate(g: PixGrid): PixGrid {
  const h = g.length, w = g[0]?.length ?? 0;
  return Array.from({ length: w }, (_, r) => Array.from({ length: h }, (_, c) => g[h - 1 - c][r]));
}

/** 左右反転 */
export const flip = (g: PixGrid): PixGrid => g.map((row) => [...row].reverse());

/** n 倍に（1マスを n×n に） */
export function scale(g: PixGrid, n: number): PixGrid {
  if (n === 1) return g;
  return g.flatMap((row) => Array.from({ length: n }, () => row.flatMap((v) => Array(n).fill(v))));
}

/** 余白（全部透明の行・列）を切り落とす */
export function trim(g: PixGrid): PixGrid {
  const rows = g.map((r, i) => (r.some(Boolean) ? i : -1)).filter((i) => i >= 0);
  if (!rows.length) return g;
  const cols = g[0].map((_, j) => (g.some((r) => r[j]) ? j : -1)).filter((j) => j >= 0);
  return g.slice(rows[0], rows[rows.length - 1] + 1).map((r) => r.slice(cols[0], cols[cols.length - 1] + 1));
}
