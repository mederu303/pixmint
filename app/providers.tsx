'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected, mock, walletConnect } from 'wagmi/connectors';
import type { Chain } from 'viem';
import { mainnet } from 'viem/chains';
import { PIX_CHAINS, rpcTransport } from '../lib/chains';
import { I18nProvider } from '../lib/i18n';

// ウォレット: ブラウザ拡張（MetaMask・Rabby・Coinbase Wallet 拡張など）＋ WalletConnect（スマホのウォレットを QR で）。
// WalletConnect は NEXT_PUBLIC_WC_PROJECT_ID があるときだけ出す（Reown の Project ID）。
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
/**
 * ローカル確認用のテストウォレット（hardhat node の既定アカウント #1・#2）。
 * NEXT_PUBLIC_PIXMINT_31337 があるときだけ出る＝本番・テストネットでは出ない。
 * 送信は hardhat node がそのまま署名する（MetaMask の設定が要らない）。
 */
export const TEST_WALLETS = PIX_CHAINS.some((p) => p.chain.id === 31337)
  ? [
      { label: 'wallet.testArtist' as const, address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const },
      { label: 'wallet.testBuyer' as const, address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const },
    ]
  : [];

/** 最後に選んだテスト用ウォレット。それだけをリロード後に繋ぎ直す（全部を繋ぐと誰でも「作者」になる） */
export const TEST_WALLET_KEY = 'pixmint-test-wallet';
const lastTest = (() => {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(TEST_WALLET_KEY);
  } catch {
    return null;
  }
})();

const chains = (PIX_CHAINS.length ? PIX_CHAINS.map((p) => p.chain) : [mainnet]) as [Chain, ...Chain[]];
const config = createConfig({
  chains,
  connectors: [
    injected(),
    ...(WC_PROJECT_ID
      ? [walletConnect({ projectId: WC_PROJECT_ID, showQrModal: true, metadata: { name: 'pixmint', description: 'pixmint by mederu.art', url: 'https://pixmint.mederu.art', icons: [] } })]
      : []),
    ...TEST_WALLETS.map((w) => mock({ accounts: [w.address], features: { defaultConnected: lastTest === w.address, reconnect: true } })),
  ],
  transports: Object.fromEntries(chains.map((c) => [c.id, rpcTransport(c.id)])),
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <I18nProvider>{children}</I18nProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
