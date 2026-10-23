'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import { Wallet } from '../../../components/Header';
import { Name } from '../../../components/Name';
import { LABEL, pixChain } from '../../../lib/chains';
import { readNum, readWork, svgUrl, type WorkView } from '../../../lib/contract';
import { useTx } from '../../../lib/useTx';
import { useI18n } from '../../../lib/i18n';

const EXPLORER: Record<number, string> = {
  1: 'https://etherscan.io',
  8453: 'https://basescan.org',
  11155111: 'https://sepolia.etherscan.io',
  84532: 'https://sepolia.basescan.org',
};
/** OpenSea のチェーン名（テストネットは OpenSea が対応をやめたので無し） */
const OPENSEA: Record<number, string> = { 1: 'ethereum', 8453: 'base' };

export default function WorkPage() {
  const { t, lang } = useI18n();
  const params = useParams<{ chainId: string; id: string }>();
  const chainId = Number(params.chainId);
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : 0n;
  const [w, setW] = useState<WorkView | null>(null);
  const [feeBps, setFeeBps] = useState<bigint>(250n);
  const [error, setError] = useState<string | null>(null);
  const [priceIn, setPriceIn] = useState('');
  const { address, isConnected } = useAccount();
  const tx = useTx(chainId);

  const load = useCallback(() => {
    if (!pixChain(chainId)) {
      setError(t('work.noChain'));
      return;
    }
    // mint した直後は、公開 RPC がまだそのブロックを知らないことがある。少し待って何度か読み直してから「見つからない」にする
    let tries = 0;
    const attempt = () =>
      readWork(chainId, id)
        .then(setW)
        .catch(() => (++tries < 6 ? setTimeout(attempt, 1500) : setError(t('work.notFound'))));
    attempt();
    readNum(chainId, 'feeBps').then(setFeeBps).catch(() => {});
  }, [chainId, id]);
  useEffect(load, [load]);

  if (error) return <p className="note bad">{error}</p>;
  if (!w) return <p className="note">{t('work.loading')}</p>;

  const mine = !!address && address.toLowerCase() === w.owner.toLowerCase();
  const isSecondary = w.owner.toLowerCase() !== w.creator.toLowerCase();
  const fee = (w.price * feeBps) / 10_000n;
  const royalty = isSecondary ? (w.price * BigInt(w.royaltyBps)) / 10_000n : 0n;
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
        <div>
          <h1>{w.title}</h1>
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
                <span>{t('work.toOwner')}</span>
                <b>{formatEther(w.price - fee - royalty)} ETH</b>
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
            <a className="tool" href={`https://opensea.io/item/${OPENSEA[chainId]}/${pixChain(chainId)!.address}/${w.id}`} target="_blank" rel="noopener noreferrer">
              OpenSea ↗
            </a>
          )}
          {ex && (
            <a className="tool" href={`${ex}/nft/${pixChain(chainId)!.address}/${w.id}`} target="_blank" rel="noopener noreferrer">
              {ex.replace('https://', '')} ↗
            </a>
          )}
        </div>
        <p className="note">
          {t('work.note')}
        </p>
      </div>
    </div>
  );
}
