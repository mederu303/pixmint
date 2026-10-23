'use client';
import { useEffect, useState } from 'react';
import { NAME_EVENT, lookupName, type ResolvedName } from '../lib/names';
import { short } from '../lib/contract';
import { useI18n } from '../lib/i18n';

/** 表示名 → .eth → Basename → 0x1234…abcd。表示名（作者が自分で付けた・検証なし）は見た目を変えて ENS と区別する */
export function Name({ address, chainId, href, refresh }: { address: string; chainId?: number; href?: string; refresh?: number }) {
  const { t } = useI18n();
  const [name, setName] = useState<ResolvedName | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent).detail === address.toLowerCase() && setTick((t) => t + 1);
    window.addEventListener(NAME_EVENT, on);
    return () => window.removeEventListener(NAME_EVENT, on);
  }, [address]);
  useEffect(() => {
    let live = true;
    setName(null);
    lookupName(address, chainId).then((n) => live && setName(n));
    return () => {
      live = false;
    };
  }, [address, chainId, refresh, tick]);
  const label = name ? (
    <span className={name.kind === 'pix' ? 'pixname' : undefined}>{name.name}</span>
  ) : (
    short(address)
  );
  const title = name?.kind === 'pix' ? `${t('name.pixTip')}\n${address}` : address;
  return href ? (
    <a href={href} title={title}>
      {label}
    </a>
  ) : (
    <span title={title}>{label}</span>
  );
}
