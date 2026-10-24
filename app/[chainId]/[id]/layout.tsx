// 作品ページのタイトルと説明（ページ本体はクライアントで読むので、カード用はここでサーバーから読む）
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { readWork } from '../../../lib/contract';
import { artistName } from '../../../lib/names';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ chainId: string; id: string }> }): Promise<Metadata> {
  const { chainId: c, id } = await params;
  try {
    const w = await readWork(Number(c), BigInt(id));
    const title = `${w.title || `#${id}`} by ${await artistName(w.creator, Number(c))}`;
    const description = 'Pixel art stored fully on-chain — no IPFS, no server. pixmint by mederu.art';
    return {
      title: `${title} — pixmint`,
      description,
      openGraph: { type: 'website', url: `/${c}/${id}`, siteName: 'pixmint', title, description },
      twitter: { card: 'summary_large_image', title, description },
    };
  } catch {
    return {};
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
