'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, type Connector } from 'wagmi';
import { Name } from './Name';
import { Credits } from './Credits';
import { TEST_WALLETS, TEST_WALLET_KEY } from '../app/providers';
import { LangToggle, useI18n } from '../lib/i18n';
import { PIX_CHAINS } from '../lib/chains';
import { TESTNETS } from '../lib/cost';

export function Header() {
  const path = usePathname();
  const { t } = useI18n();
  const [credits, setCredits] = useState(false);
  // クレジットは <header> の外に置く（header の backdrop-filter の中だと position: fixed が閉じ込められる）
  return (
    <>
    <header>
      {/* ロゴを押すとクレジット（描く画面へは PIX から） */}
      <button className="logo" onClick={() => setCredits(true)} title={t('credits.open')} aria-haspopup="dialog">
        pixmint
      </button>

      <nav>
        <Link href="/" className={path === '/' ? 'on' : ''} title={t('nav.drawTip')}>
          {t('nav.draw')}
        </Link>
        <Link href="/gallery" className={path.startsWith('/gallery') ? 'on' : ''} title={t('nav.worksTip')}>
          {t('nav.works')}
        </Link>
        <Link href="/help" className={path.startsWith('/help') ? 'on' : ''}>
          {t('nav.help')}
        </Link>
      </nav>
      <Wallet />
      <LangToggle />
    </header>
    {credits && <Credits onClose={() => setCredits(false)} />}
    </>
  );
}

/** テストネットだけで動いているときの帯（本物のお金ではないことを先に伝える） */
export function TestnetBanner() {
  const { t } = useI18n();
  if (!PIX_CHAINS.length || PIX_CHAINS.some((p) => !TESTNETS.includes(p.chain.id))) return null;
  return (
    <div className="testnet-banner" role="note">
      {t('banner.testnet')}
    </div>
  );
}

export function Footer() {
  const { t } = useI18n();
  // 描くページは1画面に収めるのでフッターを出さない
  if (usePathname() === '/') return null;
  // 「mederu.art」はいつも小文字で、mederu.art へのリンクにする
  const [before, after] = t('footer').split('mederu.art');
  return (
    <footer>
      {before}
      <a className="brand" href="https://mederu.art" target="_blank" rel="noopener noreferrer">
        mederu.art
      </a>
      {after}
    </footer>
  );
}

export function Wallet() {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  /** EIP-6963 で見つかった拡張（MetaMask・Rabby など）はその名前のまま */
  const label = (c: Connector, mockIndex: number): string => {
    if (c.type === 'walletConnect') return t('wallet.wc');
    if (c.type === 'mock') return TEST_WALLETS[mockIndex] ? t(TEST_WALLETS[mockIndex].label) : 'Test';
    if (c.id === 'injected') return t('wallet.browser');
    return c.name;
  };

  // 「ブラウザ拡張」は個別の拡張が見つかったら重複なので隠す
  const discovered = connectors.some((c) => c.type === 'injected' && c.id !== 'injected');
  let m = 0;
  const items = connectors
    .filter((c) => !(discovered && c.id === 'injected'))
    .map((c) => {
      const i = c.type === 'mock' ? m++ : -1;
      return { c, text: label(c, i), test: TEST_WALLETS[i]?.address };
    });
  const remember = (addr?: string) => {
    try {
      if (addr) localStorage.setItem(TEST_WALLET_KEY, addr);
      else localStorage.removeItem(TEST_WALLET_KEY);
    } catch {}
  };

  return (
    <div className="menu-wrap" ref={ref}>
      {isConnected && address ? (
        <button className="ghost" onClick={() => setOpen((o) => !o)}>
          <Name address={address} />
        </button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} disabled={isPending}>
          {isPending ? t('wallet.connecting') : t('wallet.connect')}
        </button>
      )}
      {open && (
        <div className="menu">
          {isConnected ? (
            <>
              <Link href="/me" onClick={() => setOpen(false)}>
                {t('wallet.setName')}
              </Link>
              <button
                className="ghost"
                onClick={() => {
                  disconnect();
                  remember();
                  setOpen(false);
                }}
              >
                {t('wallet.disconnect')}
              </button>
            </>
          ) : (
            items.map(({ c, text, test }) => (
              <button
                key={c.uid}
                className="ghost"
                onClick={() => {
                  connect({ connector: c });
                  remember(test);
                  setOpen(false);
                }}
              >
                {text}
              </button>
            ))
          )}
        </div>
      )}
      {error && !isConnected && <span className="note bad menu-err">{error.message.split('\n')[0]}</span>}
    </div>
  );
}
