'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { LABEL, PIX_CHAINS } from '../../lib/chains';
import { Name } from '../../components/Name';
import { useI18n } from '../../lib/i18n';
import { readTotal, readWork, svgUrl, type WorkView } from '../../lib/contract';

const PAGE = 24;

export default function Gallery() {
  const { t } = useI18n();
  const [chainId, setChainId] = useState<number>(PIX_CHAINS[0]?.chain.id ?? 0);
  const [total, setTotal] = useState<bigint | null>(null);
  const [works, setWorks] = useState<WorkView[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chainId) return;
    let live = true;
    setWorks([]);
    setTotal(null);
    setError(null);
    setShown(PAGE);
    readTotal(chainId)
      .then((t) => live && setTotal(t))
      .catch((e) => live && setError((e as Error).message.split('\n')[0]));
    return () => {
      live = false;
    };
  }, [chainId]);

  // 新しい順に読む。イベント検索（getLogs）は公開 RPC だと範囲制限があるので、1..totalMinted を直接読む
  useEffect(() => {
    if (total == null) return;
    let live = true;
    const from = Number(total) - works.length;
    const to = Math.max(0, Number(total) - shown);
    const ids: bigint[] = [];
    for (let i = from; i > to; i--) ids.push(BigInt(i));
    if (!ids.length) return;
    Promise.all(ids.map((id) => readWork(chainId, id)))
      .then((ws) => live && setWorks((prev) => [...prev, ...ws]))
      .catch((e) => live && setError((e as Error).message.split('\n')[0]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, shown, chainId]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chips">
          {PIX_CHAINS.map((p) => (
            <button
              key={p.chain.id}
              className={`tool ${chainId === p.chain.id ? 'on' : ''}`}
              onClick={() => setChainId(p.chain.id)}
            >
              {LABEL[p.chain.id]}
            </button>
          ))}
        </div>
        {total != null && <span className="note">{t('gallery.count', { n: total.toString() })}</span>}
      </div>
      {error && <p className="note bad">{error}</p>}
      {total === 0n && <p className="note">{t('gallery.empty')}</p>}
      <div className="grid">
        {works.map((w) => (
          <Link key={`${w.chainId}-${w.id}`} href={`/${w.chainId}/${w.id}`} className="card">
            <img src={svgUrl(w.svg)} alt={w.title} />
            <div className="t">
              <span>{w.title}</span>
              {w.price > 0n && <span className="price">{formatEther(w.price)} ETH</span>}
            </div>
            <div className="t note" style={{ paddingTop: 0 }}>
              <Name address={w.creator} chainId={w.chainId} />
            </div>
          </Link>
        ))}
      </div>
      {total != null && Number(total) > shown && (
        <button className="ghost" onClick={() => setShown((s) => s + PAGE)}>
          {t('gallery.more')}
        </button>
      )}
    </div>
  );
}
