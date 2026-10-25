'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { LABEL, PIX4_CHAINS, PIX_CHAINS, workPath, type PixChain } from '../../lib/chains';
import { Name } from '../../components/Name';
import { useI18n } from '../../lib/i18n';
import { readNum, readTotal, readWork, svgUrl, type WorkView } from '../../lib/contract';
import { saveOrder } from '../../lib/order';

const PAGE = 24;
// v3 と v4（スタンプ入り）の両方を読んで、チェーンごとにまとめて新しい順に並べる。totals・works は "<chainId>:<ver>" ごと
const DEPLOYS: PixChain[] = [...PIX_CHAINS, ...PIX4_CHAINS];
const dk = (p: PixChain) => `${p.chain.id}:${p.ver}`;
/** チップに出すチェーン（v3 か v4 のどちらかがあるチェーン） */
const CHAIN_IDS = [...new Set(DEPLOYS.map((p) => p.chain.id))];
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
  const [totals, setTotals] = useState<Record<string, bigint>>({});
  const [works, setWorks] = useState<Record<string, WorkView[]>>({}); // チェーンごとに読んだ分（新しい順）
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [workError, setWorkError] = useState<string | null>(null); // 件数は読めたのに作品が読めなかったとき（こちらはいつも出す）
  const [feeBps, setFeeBps] = useState<bigint | null>(null);
  useEffect(() => {
    if (PIX_CHAINS[0]) readNum(PIX_CHAINS[0].chain.id, 'feeBps').then(setFeeBps).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OFF_KEY) ?? '[]');
      if (Array.isArray(v)) setOff(v.filter((id) => CHAIN_IDS.includes(id)));
    } catch {}
  }, []);
  const toggle = (id: number) => {
    // 全部オフにはしない（最後の1つは消せない）
    const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
    if (next.length >= CHAIN_IDS.length) return;
    setOff(next);
    try {
      localStorage.setItem(OFF_KEY, JSON.stringify(next));
    } catch {}
  };

  // 読めなかったチェーン（ローカルのノードを止めている・RPC が落ちているなど）。そのチェーンのチップに印を出すだけにし、
  // ページ全体の赤いエラーは、全部のチェーンが読めないときだけ出す
  const [down, setDown] = useState<number[]>([]);
  useEffect(() => {
    let live = true;
    for (const p of DEPLOYS)
      readTotal(p.chain.id, p.ver)
        .then((n) => live && setTotals((m) => ({ ...m, [dk(p)]: n })))
        .catch((e) => {
          if (!live) return;
          setDown((d) => (d.includes(p.chain.id) ? d : [...d, p.chain.id]));
          setError((e as Error).message.split('\n')[0]);
        });
    return () => {
      live = false;
    };
  }, []);

  // 各チェーン、まだ読んでいない分を新しい方から pages×PAGE 件まで読む
  useEffect(() => {
    let live = true;
    for (const p of DEPLOYS) {
      const id = p.chain.id;
      const key = dk(p);
      const total = totals[key];
      if (total == null) continue;
      const have = works[key]?.length ?? 0;
      const want = Math.min(Number(total), pages * PAGE);
      if (have >= want) continue;
      const ids: bigint[] = [];
      for (let i = Number(total) - have; i > Number(total) - want; i--) ids.push(BigInt(i));
      Promise.all(ids.map((n) => readWork(id, n, p.ver)))
        .then((ws) => live && setWorks((m) => ({ ...m, [key]: [...(m[key] ?? []), ...ws] })))
        .catch((e) => live && setWorkError((e as Error).message.split('\n')[0]));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, pages]);

  const on = CHAIN_IDS.filter((id) => !off.includes(id));
  const onDeploys = DEPLOYS.filter((p) => on.includes(p.chain.id));
  /** そのチェーンの作品数（v3 + v4。どちらかがまだ読めていなければ null） */
  const chainTotal = (id: number) => {
    const ds = DEPLOYS.filter((p) => p.chain.id === id);
    return ds.every((p) => totals[dk(p)] != null) ? ds.reduce((s, p) => s + totals[dk(p)], 0n) : null;
  };
  const list = useMemo(
    () =>
      onDeploys
        .flatMap((p) => works[dk(p)] ?? [])
        .sort((a, b) => b.mintedAt - a.mintedAt || (a.chainId === b.chainId ? Number(b.id - a.id) : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [works, off],
  );
  const count = onDeploys.reduce((s, p) => s + Number(totals[dk(p)] ?? 0), 0);
  const loaded = onDeploys.every((p) => totals[dk(p)] != null || down.includes(p.chain.id));
  const more = onDeploys.some((p) => Number(totals[dk(p)] ?? 0) > (works[dk(p)]?.length ?? 0));

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
            <div className="coll-right">
              {/* OpenSea も SNS と同じ角丸のアイコンで並べる（船のアイコン + チェーン名） */}
              <div className="coll-social">
                {collections.map((p) => (
                  <a
                    key={p.chain.id}
                    className="os"
                    href={`https://opensea.io/assets/${OPENSEA[p.chain.id]}/${p.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('gallery.opensea', { chain: LABEL[p.chain.id] })}
                    title={t('gallery.opensea', { chain: LABEL[p.chain.id] })}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="currentColor">
                      <path d="M11 3 4.5 14H11zM12.5 6v8H18zM3 16h18l-1.6 3.2a1.5 1.5 0 0 1-1.3.8H5.9a1.5 1.5 0 0 1-1.3-.8z" />
                    </svg>
                    <span>{p.chain.id === 1 ? 'ETH' : 'BASE'}</span>
                  </a>
                ))}
              {SOCIAL.map((x) => (
                <a key={x.name} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={`mederu on ${x.name}`} title={`@mederu_art on ${x.name}`}>
                  {x.icon}
                </a>
              ))}
            </div>
            </div>
          </div>
        </div>
      </section>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chips" role="group" aria-label={t('gallery.chains')}>
          {CHAIN_IDS.map((id) => {
            const p = { chain: { id } };
            const isOn = !off.includes(p.chain.id);
            return (
              <button
                key={p.chain.id}
                className={`tool ${isOn ? 'on' : ''}`}
                onClick={() => toggle(p.chain.id)}
                aria-pressed={isOn}
                title={down.includes(p.chain.id) ? t('gallery.down') : t('gallery.toggle')}
              >
                {LABEL[p.chain.id]}
                {chainTotal(p.chain.id) != null && <span className="dim"> {chainTotal(p.chain.id)!.toString()}</span>}
                {down.includes(p.chain.id) && <span className="bad"> ×</span>}
              </button>
            );
          })}
        </div>
        {loaded && <span className="note">{t('gallery.count', { n: count })}</span>}
      </div>
      {error && down.length >= CHAIN_IDS.length && <p className="note bad">{error}</p>}
      {workError && <p className="note bad">{workError}</p>}
      {loaded && count === 0 && <p className="note">{t('gallery.empty')}</p>}
      <div className="grid">
        {list.map((w) => (
          <Link key={`${w.chainId}-${w.ver}-${w.id}`} href={workPath(w.chainId, w.id, w.ver)} className="card" onClick={() => saveOrder(list)}>
            <img src={svgUrl(w.svg)} alt={w.title} />
            <div className="t">
              <span>
                {w.title}
                {w.stamp && <span className="stamp-badge small">{t('work.stampBadge')}</span>}
              </span>
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
