'use client';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Wallet } from '../../components/Header';
import { Name } from '../../components/Name';
import { LABEL, PIX_CHAINS, pixChain } from '../../lib/chains';
import { PIXMINT_ABI, client } from '../../lib/contract';
import { forgetName, isSafeDisplayName } from '../../lib/names';
import { useTx } from '../../lib/useTx';
import { useI18n } from '../../lib/i18n';

const MAX = 48;
const enc = new TextEncoder();

export default function Me() {
  const { t } = useI18n();
  const { address } = useAccount();
  // 表示名はチェーンごとに保存される。既定は手数料の安い Base（あれば）
  const [chainId, setChainId] = useState<number>(
    (PIX_CHAINS.find((p) => p.chain.id === 8453 || p.chain.id === 84532) ?? PIX_CHAINS[0])?.chain.id ?? 0,
  );
  const [current, setCurrent] = useState<Record<number, string>>({});
  const [name, setName] = useState('');
  const [refresh, setRefresh] = useState(0);
  const tx = useTx(chainId);

  useEffect(() => {
    if (!address) return;
    Promise.all(
      PIX_CHAINS.map(async (p) => {
        try {
          const n = (await client(p.chain.id).readContract({
            address: p.address,
            abi: PIXMINT_ABI,
            functionName: 'displayName',
            args: [address],
          })) as string;
          return [p.chain.id, n] as const;
        } catch {
          return [p.chain.id, ''] as const;
        }
      }),
    ).then((rows) => {
      const m = Object.fromEntries(rows);
      setCurrent(m);
      setName((n) => n || m[chainId] || '');
    });
  }, [address, refresh, chainId]);

  if (!address) {
    return (
      <div className="stack" style={{ maxWidth: 420 }}>
        <p className="note">{t('me.connect')}</p>
        <Wallet />
      </div>
    );
  }

  const bytes = enc.encode(name).length;
  const unsafe = !isSafeDisplayName(name.trim());
  const bad = bytes > MAX || /[\u0000-\u001f\u007f]/.test(name) || unsafe;

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <h1>{t('me.title')}</h1>
      <p className="note">{t('me.desc')}</p>
      <div className="panel meta">
        <span>{t('me.current')}</span>
        <b>
          <Name address={address} refresh={refresh} />
        </b>
        {PIX_CHAINS.map((p) => (
          <span key={p.chain.id} style={{ display: 'contents' }}>
            <span>{t('me.onChain', { chain: LABEL[p.chain.id] })}</span>
            <b>{current[p.chain.id] || '—'}</b>
          </span>
        ))}
      </div>
      <div className="panel stack">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('me.ph')} />
        <span className={`note ${bad ? 'bad' : ''}`}>
          {t('mint.bytes', { n: bytes, max: MAX })} · 日本語 / JP = 3 bytes/char
        </span>
        {unsafe && <span className="note bad">{t('me.badChars')}</span>}
        <div className="stack" style={{ gap: 4 }}>
          <span className="note">{t('me.saveChain')}</span>
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
        </div>
        <button
          disabled={bad || tx.busy || !pixChain(chainId)}
          onClick={async () => {
            if (await tx.send('setName', [name.trim()])) {
              forgetName(address);
              setRefresh((r) => r + 1);
            }
          }}
        >
          {tx.busy ? t('mint.busy') : t('me.save', { chain: LABEL[chainId] ?? '' })}
        </button>
        {tx.error && <p className="note bad">{tx.error}</p>}
      </div>
    </div>
  );
}
