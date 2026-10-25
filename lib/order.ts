'use client';
// pixmint — 作品ページの「前・次」。Works で見ていた並び（チェーンをまたいだ新しい順）をこのタブに覚えておく。
// Works を通らずに開いたときは、同じチェーン・同じ版の番号の前後（左 = 新しい方 / 右 = 古い方。Works の並びと同じ向き）
import { readTotal } from './contract';
import { workPath, type Ver } from './chains';

const KEY = 'pixmint-works-order';

/** Works の今の並びを覚える（作品を開く直前に呼ぶ）。中身は作品ページの URL */
export function saveOrder(items: { chainId: number; id: bigint; ver: Ver }[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items.map((w) => workPath(w.chainId, w.id, w.ver))));
  } catch {}
}

/** 前（左）と次（右）の作品の URL。無ければ null */
export async function neighbors(chainId: number, id: bigint, ver: Ver = 3): Promise<{ prev: string | null; next: string | null }> {
  const me = workPath(chainId, id, ver);
  try {
    const order: string[] = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    const i = order.indexOf(me);
    if (i >= 0) return { prev: i > 0 ? order[i - 1] : null, next: i < order.length - 1 ? order[i + 1] : null };
  } catch {}
  let total = 0n;
  try {
    total = await readTotal(chainId, ver);
  } catch {}
  return {
    prev: id < total ? workPath(chainId, id + 1n, ver) : null,
    next: id > 1n ? workPath(chainId, id - 1n, ver) : null,
  };
}
