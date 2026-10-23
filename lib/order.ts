'use client';
// pixmint — 作品ページの「前・次」。Works で見ていた並び（チェーンをまたいだ新しい順）をこのタブに覚えておく。
// Works を通らずに開いたときは、同じチェーンの番号の前後（左 = 新しい方 / 右 = 古い方。Works の並びと同じ向き）
import { readTotal } from './contract';

const KEY = 'pixmint-works-order';

/** Works の今の並びを覚える（作品を開く直前に呼ぶ） */
export function saveOrder(items: { chainId: number; id: bigint }[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items.map((w) => `${w.chainId}/${w.id}`)));
  } catch {}
}

/** 前（左）と次（右）の作品の URL。無ければ null */
export async function neighbors(chainId: number, id: bigint): Promise<{ prev: string | null; next: string | null }> {
  const me = `${chainId}/${id}`;
  try {
    const order: string[] = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    const i = order.indexOf(me);
    if (i >= 0) return { prev: i > 0 ? `/${order[i - 1]}` : null, next: i < order.length - 1 ? `/${order[i + 1]}` : null };
  } catch {}
  let total = 0n;
  try {
    total = await readTotal(chainId);
  } catch {}
  return {
    prev: id < total ? `/${chainId}/${id + 1n}` : null,
    next: id > 1n ? `/${chainId}/${id - 1n}` : null,
  };
}
