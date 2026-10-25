// 作品ページのタイトルと説明（ページ本体はクライアントで読むので、カード用はここでサーバーから読む。中身は lib/workCard.tsx）
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { workMetadata } from '../../../../lib/workCard';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ chainId: string; id: string }> }): Promise<Metadata> {
  const { chainId, id } = await params;
  return workMetadata(chainId, id, 4);
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
