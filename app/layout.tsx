import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Footer, Header, TestnetBanner } from '../components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'pixmint',
  description: 'Fully on-chain pixel art on Ethereum and Base — pixmint by mederu.art',
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
