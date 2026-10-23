'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { LABEL, PIX_CHAINS } from '../../lib/chains';
import { Name } from '../../components/Name';
import { useI18n } from '../../lib/i18n';
import { readNum, readTotal, readWork, svgUrl, type WorkView } from '../../lib/contract';
import { saveOrder } from '../../lib/order';

const PAGE = 24;
/** mederu の SNS（バナー右上） */
const SOCIAL = [
  {
    name: 'X',
    href: 'https://x.com/mederu_art',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/mederu_art/',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
        <circle cx="12" cy="12" r="4.3" />
        <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];
/** OpenSea のコレクション。/assets/<chain>/<contract> はコレクションのページへ転送される（slug を変えてもリンクが切れない） */
const OPENSEA: Record<number, string> = { 1: 'ethereum', 8453: 'base' };
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
  const [feeBps, setFeeBps] = useState<bigint | null>(null);
  useEffect(() => {
    if (PIX_CHAINS[0]) readNum(PIX_CHAINS[0].chain.id, 'feeBps').then(setFeeBps).catch(() => {});
  }, []);

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

  const collections = PIX_CHAINS.filter((p) => OPENSEA[p.chain.id]);
  // 見出しの数字（表示しているチェーンの、読んだ分から。まだ全部読んでいなければ「+」を付ける）
  const stats = useMemo(() => {
    const listed = list.filter((w) => w.price > 0n);
    return {
      artists: new Set(list.map((w) => w.creator.toLowerCase())).size,
      owners: new Set(list.map((w) => w.owner.toLowerCase())).size,
      listed: listed.length,
      floor: listed.length ? listed.reduce((m, w) => (w.price < m ? w.price : m), listed[0].price) : null,
    };
  }, [list]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="coll" aria-label="pixmint">
        <div className="coll-bg" aria-hidden>
          <img src="/banner.jpg" alt="" width={1376} height={459} />
        </div>
        <div className="coll-social">
          {SOCIAL.map((x) => (
            <a key={x.name} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={`mederu on ${x.name}`} title={`@mederu_art on ${x.name}`}>
              {x.icon}
            </a>
          ))}
        </div>
        <div className="coll-body">
          <div className="coll-id">
            <img className="coll-avatar" src="/avatar.jpg" alt="" width={256} height={256} />
            <div className="stack" style={{ gap: 8, minWidth: 0 }}>
              <h1 className="coll-name">pixmint</h1>
              <div className="coll-chips">
                {PIX_CHAINS.map((p) => (
                  <span key={p.chain.id}>{LABEL[p.chain.id]}</span>
                ))}
                <span>{t('gallery.since')}</span>
                {feeBps != null && <span>{t('gallery.fee', { pct: Number(feeBps) / 100 })}</span>}
              </div>
            </div>
            {collections.length > 0 && (
              <div className="coll-links">
                {collections.map((p) => (
                  <a
                    key={p.chain.id}
                    className="tool"
                    href={`https://opensea.io/assets/${OPENSEA[p.chain.id]}/${p.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('gallery.opensea', { chain: LABEL[p.chain.id] })} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
          <dl className="coll-stats">
            <div>
              <dt>{t('gallery.statWorks')}</dt>
              <dd>{loaded ? count : '—'}</dd>
            </div>
            <div>
              <dt>{t('gallery.statArtists')}</dt>
              <dd>{stats.artists}{more && '+'}</dd>
            </div>
            <div>
              <dt>{t('gallery.statOwners')}</dt>
              <dd>{stats.owners}{more && '+'}</dd>
            </div>
            <div>
              <dt>{t('gallery.statListed')}</dt>
              <dd>{stats.listed}{more && '+'}</dd>
            </div>
            <div>
              <dt>{t('gallery.statFloor')}</dt>
              <dd>{stats.floor != null ? `${formatEther(stats.floor)} ETH` : '—'}</dd>
            </div>
          </dl>
        </div>
      </section>
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
          <Link key={`${w.chainId}-${w.id}`} href={`/${w.chainId}/${w.id}`} className="card" onClick={() => saveOrder(list)}>
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
