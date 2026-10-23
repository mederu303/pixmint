'use client';
import { useEffect, useState } from 'react';
import { NAME_EVENT, lookupName } from '../lib/names';
import { short } from '../lib/contract';

/** 表示名 → .eth → Basename → 0x1234…abcd */
export function Name({ address, chainId, href, refresh }: { address: string; chainId?: number; href?: string; refresh?: number }) {
  const [name, setName] = useState<string | null>(null);
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
  const label = name ?? short(address);
  return href ? (
    <a href={href} title={address}>
      {label}
    </a>
  ) : (
    <span title={address}>{label}</span>
  );
}
