// X に貼る共有用 URL。人が開いたときは作品ページへ移る（中身は lib/shareCard.tsx）
import type { Metadata } from 'next';
import { shareMetadata } from '../../../../../lib/shareCard';
import { workPath } from '../../../../../lib/chains';
import { Redirect } from '../../../[chainId]/[id]/Redirect';

export const revalidate = 3600;
type Params = { params: Promise<{ chainId: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { chainId, id } = await params;
  return shareMetadata(chainId, id, 4);
}

export default async function SharePage({ params }: Params) {
  const { chainId, id } = await params;
  return <Redirect to={workPath(Number(chainId), /^\d+$/.test(id) ? BigInt(id) : 0n, 4)} />;
}
