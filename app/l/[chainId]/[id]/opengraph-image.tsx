import { posterSize, sharePoster } from '../../../../lib/shareCard';

export const alt = 'pixmint — fully on-chain pixel art';
export const size = posterSize;
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ chainId: string; id: string }> }) {
  const { chainId, id } = await params;
  return sharePoster(chainId, id, 3);
}
