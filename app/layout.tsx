import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Footer, Header, TestnetBanner } from '../components/Header';
import './globals.css';

const DESCRIPTION = 'Draw pixel art in your browser and mint it fully on-chain to Ethereum and Base. No server, no IPFS. pixmint by mederu.art';

// リンクを貼ったときのカード（OGP・X）。画像は app/opengraph-image.png / twitter-image.png（1200×630）を Next が自動で付ける
export const metadata: Metadata = {
  metadataBase: new URL('https://pixmint.mederu.art'),
  title: 'pixmint',
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'pixmint',
    title: 'pixmint — every pixel lives on-chain',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'pixmint — every pixel lives on-chain',
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* ロゴ: Silkscreen（ドット体）。本文: DM Mono（mederu と同じ）。
            ロゴを変えるなら globals.css の --font-logo と、ここの family を差し替える
            候補: Orbitron / Press Start 2P / Audiowide */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Silkscreen:wght@400;700&display=swap"
        />
      </head>
      <body>
        <Providers>
          <TestnetBanner />
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
