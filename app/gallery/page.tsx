'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { LABEL, PIX_CHAINS } from '../../lib/chains';
import { Name } from '../../components/Name';
import { useI18n } from '../../lib/i18n';
import { readTotal, readWork, svgUrl, type WorkView } from '../../lib/contract';

const PAGE = 24;
/** オフにしたチェーン（このブラウザだけに覚える） */
const OFF_KEY = 'pixmint-gallery-off';

/**
 * 作品一覧。全チェーン（ETH・Base など）をまとめて mint の新しい順に並べる。チェーンごとにオン／オフで絞れる。
 * 各チェーンを 1..totalMinted の新しい方から PAGE 件ずつ読み、手元で混ぜる（getLogs は公開 RPC の範囲制限があるので使わない）
 */
export default function Gallery() {
  const { t } = useI18n();
  const [off, setOff] = useState<number[]>([]);
  const [totals, setTotals] = useState<Record<number, bigint>>({});
  const [works, setWorks] = useState<Record<number, WorkView[]>>({}); // チェーンごとに読んだ分（新しい順）
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OFF_KEY) ?? '[]');
      if (Array.isArray(v)) setOff(v.filter((id) => PIX_CHAINS.some((p) => p.chain.id === id)));
    } catch {}
  }, []);
  const toggle = (id: number) => {
    // 全部オフにはしない（最後の1つは消せない）
    const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
    if (next.length >= PIX_CHAINS.length) return;
    setOff(next);
    try {
      localStorage.setItem(OFF_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    let live = true;
    for (const p of PIX_CHAINS)
      readTotal(p.chain.id)
        .then((n) => live && setTotals((m) => ({ ...m, [p.chain.id]: n })))
        .catch((e) => live && setError((e as Error).message.split('\n')[0]));
    return () => {
      live = false;
    };
  }, []);

  // 各チェーン、まだ読んでいない分を新しい方から pages×PAGE 件まで読む
  useEffect(() => {
    let live = true;
    for (const p of PIX_CHAINS) {
      const id = p.chain.id;
      const total = totals[id];
      if (total == null) continue;
      const have = works[id]?.length ?? 0;
      const want = Math.min(Number(total), pages * PAGE);
      if (have >= want) continue;
      const ids: bigint[] = [];
      for (let i = Number(total) - have; i > Number(total) - want; i--) ids.push(BigInt(i));
      Promise.all(ids.map((n) => readWork(id, n)))
        .then((ws) => live && setWorks((m) => ({ ...m, [id]: [...(m[id] ?? []), ...ws] })))
        .catch((e) => live && setError((e as Error).message.split('\n')[0]));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, pages]);

  const on = PIX_CHAINS.map((p) => p.chain.id).filter((id) => !off.includes(id));
  const list = useMemo(
    () =>
      on
        .flatMap((id) => works[id] ?? [])
        .sort((a, b) => b.mintedAt - a.mintedAt || (a.chainId === b.chainId ? Number(b.id - a.id) : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [works, off],
  );
  const count = on.reduce((s, id) => s + Number(totals[id] ?? 0), 0);
  const loaded = on.every((id) => totals[id] != null);
  const more = on.some((id) => Number(totals[id] ?? 0) > (works[id]?.length ?? 0));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chips" role="group" aria-label={t('gallery.chains')}>
          {PIX_CHAINS.map((p) => {
            const isOn = !off.includes(p.chain.id);
            return (
              <button
                key={p.chain.id}
                className={`tool ${isOn ? 'on' : ''}`}
                onClick={() => toggle(p.chain.id)}
                aria-pressed={isOn}
                title={t('gallery.toggle')}
              >
                {LABEL[p.chain.id]}
                {totals[p.chain.id] != null && <span className="dim"> {totals[p.chain.id].toString()}</span>}
              </button>
            );
          })}
        </div>
        {loaded && <span className="note">{t('gallery.count', { n: count })}</span>}
      </div>
      {error && <p className="note bad">{error}</p>}
      {loaded && count === 0 && <p className="note">{t('gallery.empty')}</p>}
      <div className="grid">
        {list.map((w) => (
          <Link key={`${w.chainId}-${w.id}`} href={`/${w.chainId}/${w.id}`} className="card">
            <img src={svgUrl(w.svg)} alt={w.title} />
            <div className="t">
              <span>{w.title}</span>
              {w.price > 0n && <span className="price">{formatEther(w.price)} ETH</span>}
            </div>
            <div className="t note" style={{ paddingTop: 0 }}>
              <Name address={w.creator} chainId={w.chainId} />
              <span className="chain-tag">{LABEL[w.chainId]}</span>
            </div>
          </Link>
        ))}
      </div>
      {more && (
        <button className="ghost" onClick={() => setPages((n) => n + 1)}>
          {t('gallery.more')}
        </button>
      )}
    </div>
  );
}
