'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import { Wallet } from './Header';
import { Name } from './Name';
import { LABEL, deployment, workPath, type Ver } from '../lib/chains';
import { STAMP_BPS, readNum, readStampArtists, readWork, svgUrl, type WorkView } from '../lib/contract';
import { useTx } from '../lib/useTx';
import { neighbors } from '../lib/order';
import { useI18n } from '../lib/i18n';
import { artistName } from '../lib/names';

const EXPLORER: Record<number, string> = {
  1: 'https://etherscan.io',
  8453: 'https://basescan.org',
  11155111: 'https://sepolia.etherscan.io',
  84532: 'https://sepolia.basescan.org',
};
/** OpenSea のチェーン名（テストネットは OpenSea が対応をやめたので無し） */
const OPENSEA: Record<number, string> = { 1: 'ethereum', 8453: 'base' };

/** 作品ページ。v3 は /<chainId>/<id>（app/[chainId]/[id]）、v4 は /v4/<chainId>/<id>（app/v4/…） */
export function WorkPage({ ver }: { ver: Ver }) {
  const { t, lang } = useI18n();
  const params = useParams<{ chainId: string; id: string }>();
  const chainId = Number(params.chainId);
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : 0n;
  const [w, setW] = useState<WorkView | null>(null);
  const [feeBps, setFeeBps] = useState<bigint>(250n);
  const [error, setError] = useState<string | null>(null);
  const [priceIn, setPriceIn] = useState('');
  const { address, isConnected } = useAccount();
  const tx = useTx(chainId, ver);
  const router = useRouter();
  // X でシェア: 「題名 by 作者」と共有用 URL /l/…（ツイートの中で作品をコントラクトから読んで見せるプレイヤーカード。app/l/）
  const [artist, setArtist] = useState('');
  useEffect(() => {
    if (w) artistName(w.creator, chainId).then(setArtist);
  }, [w?.creator, chainId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shareUrl = w
    ? `https://x.com/intent/tweet?text=${encodeURIComponent(`${w.title || `#${w.id}`}${artist ? ` by ${artist}` : ''}`)}&url=${encodeURIComponent(`https://pixmint.mederu.art/l${ver === 4 ? '/v4' : ''}/${chainId}/${w.id}`)}`
    : '';

  // 前・次の作品（← → キーでも移れる。文字を入力しているときは効かない）
  const [nav, setNav] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });
  useEffect(() => {
    let live = true;
    neighbors(chainId, id, ver).then((n) => live && setNav(n));
    return () => {
      live = false;
    };
  }, [chainId, id, ver]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const to = e.key === 'ArrowLeft' ? nav.prev : e.key === 'ArrowRight' ? nav.next : null;
      if (to) {
        e.preventDefault();
        router.push(to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, router]);

  const load = useCallback(() => {
    if (!deployment(chainId, ver)) {
      setError(t('work.noChain'));
      return;
    }
    // mint した直後は、公開 RPC がまだそのブロックを知らないことがある。少し待って何度か読み直してから「見つからない」にする
    let tries = 0;
    const attempt = () =>
      readWork(chainId, id, ver)
        .then(setW)
        .catch(() => (++tries < 6 ? setTimeout(attempt, 1500) : setError(t('work.notFound'))));
    attempt();
    readNum(chainId, 'feeBps', ver).then(setFeeBps).catch(() => {});
  }, [chainId, id, ver]);
  // v4: 売れたときにスタンプの分を受け取る作者
  const [stampArtists, setStampArtists] = useState<string[]>([]);
  useEffect(() => {
    if (ver === 4 && w?.stamps?.length) readStampArtists(chainId, w.id).then(setStampArtists).catch(() => {});
  }, [ver, chainId, w?.id, w?.stamps?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  if (error) return <p className="note bad">{error}</p>;
  if (!w) return <p className="note">{t('work.loading')}</p>;

  const mine = !!address && address.toLowerCase() === w.owner.toLowerCase();
  const isSecondary = w.owner.toLowerCase() !== w.creator.toLowerCase();
  const fee = (w.price * feeBps) / 10_000n;
  const royalty = isSecondary ? (w.price * BigInt(w.royaltyBps)) / 10_000n : 0n;
  // コントラクトと同じ計算: 売り手を外した人数で 8% を等分（端数は売り手）
  const takers = stampArtists.filter((a) => a.toLowerCase() !== w.owner.toLowerCase()).length;
  const toStamps = takers ? ((w.price * STAMP_BPS) / 10_000n / BigInt(takers)) * BigInt(takers) : 0n;
  const ex = EXPLORER[chainId];
  const addr = (a: string) => <Name address={a} chainId={chainId} href={ex ? `${ex}/address/${a}` : undefined} />;

  let priceWei: bigint | null = null;
  try {
    priceWei = priceIn ? parseEther(priceIn) : null;
  } catch {}

  return (
    <div className="work">
      <img src={svgUrl(w.svg)} alt={w.title} />
      <div className="stack">
        <div className="work-nav">
          {nav.prev ? (
            <Link className="tool" href={nav.prev} title={t('work.prev')} aria-label={t('work.prev')}>
              ‹
            </Link>
          ) : (
            <span className="tool off" aria-hidden>‹</span>
          )}
          {nav.next ? (
            <Link className="tool" href={nav.next} title={t('work.next')} aria-label={t('work.next')}>
              ›
            </Link>
          ) : (
            <span className="tool off" aria-hidden>›</span>
          )}
          <span className="note">{t('work.navHint')}</span>
        </div>
        <div>
          <h1>
            {w.title}
            {w.stamp && <span className="stamp-badge">{t('work.stampBadge')}</span>}
          </h1>
          <span className="note">
            by <Name address={w.creator} chainId={chainId} /> · {LABEL[chainId]} · #{w.id.toString()}
          </span>
        </div>
        <div className="panel meta">
          <span>{t('work.artist')}</span>
          <b>{addr(w.creator)}</b>
          <span>{t('work.owner')}</span>
          <b>{addr(w.owner)}</b>
          <span>{t('work.grid')}</span>
          <b>
            {w.size}×{w.size}
          </b>
          <span>{t('work.colors')}</span>
          <b>{w.colors}</b>
          <span>{t('work.royalty')}</span>
          <b>{w.royaltyBps / 100}%</b>
          <span>{t('work.minted')}</span>
          <b>{new Date(w.mintedAt * 1000).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}</b>
          <span>{t('work.storage')}</span>
          <b>{t('work.fullyOnchain')}</b>
        </div>

        {/* 使っている色（チェーンのデータに入っている色そのまま。押すと色コードをコピー） */}
        <div className="work-palette" aria-label={t('work.palette')}>
          {w.palette.map((c) => (
            <button key={c} style={{ background: c }} title={c} aria-label={c} onClick={() => navigator.clipboard?.writeText(c).catch(() => {})} />
          ))}
        </div>
        {w.stamp && <p className="note">{t('work.stampNote')}</p>}
        {!!w.stamps?.length && <StampsUsed chainId={chainId} ids={w.stamps} />}

        <div className="panel stack">
          {w.price > 0n ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="note">{t('work.forSale')}</span>
                <span className="price" style={{ fontSize: 18 }}>
                  {formatEther(w.price)} ETH
                </span>
              </div>
              <div className="meta">
                <span>{t('work.fee')}</span>
                <b>{formatEther(fee)} ETH</b>
                {isSecondary && (
                  <>
                    <span>{t('work.toArtist')}</span>
                    <b>{formatEther(royalty)} ETH</b>
                  </>
                )}
                {toStamps > 0n && (
                  <>
                    <span>{t('work.toStamps', { n: takers })}</span>
                    <b>{formatEther(toStamps)} ETH</b>
                  </>
                )}
                <span>{t('work.toOwner')}</span>
                <b>{formatEther(w.price - fee - royalty - toStamps)} ETH</b>
              </div>
              {mine ? (
                <button className="ghost" disabled={tx.busy} onClick={async () => (await tx.send('unlist', [w.id])) && load()}>
                  {t('work.unlist')}
                </button>
              ) : isConnected ? (
                <button disabled={tx.busy} onClick={async () => (await tx.send('buy', [w.id], w.price)) && load()}>
                  {tx.busy ? t('mint.busy') : t('work.buy')}
                </button>
              ) : (
                <Wallet />
              )}
            </>
          ) : mine ? (
            <>
              <span className="note">{t('work.listTitle', { fee: Number(feeBps) / 100 })}</span>
              <div className="row">
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceIn}
                  onChange={(e) => setPriceIn(e.target.value)}
                  placeholder="0.01"
                  style={{ flex: 1 }}
                />
                <span className="note">ETH</span>
                <button
                  disabled={tx.busy || !priceWei || priceWei <= 0n}
                  onClick={async () => (await tx.send('list', [w.id, priceWei])) && (setPriceIn(''), load())}
                >
                  {tx.busy ? t('mint.busy') : t('work.list')}
                </button>
              </div>
            </>
          ) : (
            <span className="note">{t('work.notForSale')}</span>
          )}
          {tx.error && <p className="note bad">{tx.error}</p>}
        </div>
        <div className="chips work-links">
          {OPENSEA[chainId] && (
            <a className="tool" href={`https://opensea.io/item/${OPENSEA[chainId]}/${deployment(chainId, ver)!.address}/${w.id}`} target="_blank" rel="noopener noreferrer">
              OpenSea ↗
            </a>
          )}
          {ex && (
            <a className="tool" href={`${ex}/nft/${deployment(chainId, ver)!.address}/${w.id}`} target="_blank" rel="noopener noreferrer">
              {ex.replace('https://', '')} ↗
            </a>
          )}
          <a className="tool" href={shareUrl} target="_blank" rel="noopener noreferrer">
            {t('work.share')} ↗
          </a>
        </div>
        <p className="note">
          {t('work.note')}
        </p>
      </div>
    </div>
  );
}

/** v4: この作品で使ったスタンプ（絵・名前・作者。押すとそのスタンプのページ） */
function StampsUsed({ chainId, ids }: { chainId: number; ids: bigint[] }) {
  const { t } = useI18n();
  const [stamps, setStamps] = useState<WorkView[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all(ids.map((id) => readWork(chainId, id, 4)))
      .then((ws) => live && setStamps(ws))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [chainId, ids]);
  return (
    <div className="panel stack">
      <span className="note">{t('work.stampsUsed', { n: ids.length })}</span>
      <div className="stamps-used">
        {stamps.map((s) => (
          <Link key={s.id.toString()} href={workPath(chainId, s.id, 4)} className="stamp-used">
            <img src={svgUrl(s.svg)} alt={s.title} />
            <span>
              <b>{s.title}</b>
              <span className="note">{s.official ? 'mederu' : <Name address={s.creator} chainId={chainId} />}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
