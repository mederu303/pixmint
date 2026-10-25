// 作品ページのカード画像（中身は lib/workCard.tsx）
import { cardSize, workCardImage } from '../../../lib/workCard';

export const alt = 'pixmint — every pixel lives on-chain';
export const size = cardSize;
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ chainId: string; id: string }> }) {
  const { chainId, id } = await params;
  return workCardImage(chainId, id, 3);
}
