'use client';
// pixmint — ミントするチェーン（Pix・ミント欄・ウォレットのメニューで共有する）
//   スタンプの番号はチェーンごとに別なので、描く前に決めておく。このブラウザに覚える。
//   Pix はスタンプを使っていると「記録されなくなる」確認を出したいので、切り替えの前に呼ばれる見張り（guard）を置ける
import { useEffect, useState } from 'react';
import { PIX_CHAINS } from './chains';

const KEY = 'pixmint-mint-chain';
const EVENT = 'pixmint:mint-chain';
const fallback = () => PIX_CHAINS[0]?.chain.id ?? 0;

let guard: ((id: number) => boolean) | null = null;
/** 切り替えの前に呼ばれる。false を返すと切り替えない（Pix がスタンプの確認に使う） */
export function setMintChainGuard(fn: ((id: number) => boolean) | null) {
  guard = fn;
}

export function getMintChain(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (PIX_CHAINS.some((p) => p.chain.id === v)) return v;
  } catch {}
  return fallback();
}

/** チェーンを変える。見張りに止められたら false */
export function requestMintChain(id: number): boolean {
  if (id === getMintChain()) return true;
  if (guard && !guard(id)) return false;
  try {
    localStorage.setItem(KEY, String(id));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
  return true;
}

export function useMintChain(): number {
  const [id, setId] = useState(fallback);
  useEffect(() => {
    setId(getMintChain());
    const on = (e: Event) => setId((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return id;
}
