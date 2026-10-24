/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// プレイヤーカードの止まった絵（480×480。プレイヤーが動く前や、動かない場所で出る）。作品だけを大きく
import { ImageResponse } from 'next/og';
import { readWork, svgUrl } from '../../../../lib/contract';

export const alt = 'pixmint — fully on-chain pixel art';
export const size = { width: 480, height: 480 };
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ chainId: string; id: string }> }) {
  const { chainId, id } = await params;
  let art = '';
  try {
    art = svgUrl((await readWork(Number(chainId), BigInt(id))).svg);
  } catch {}
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
        {art ? <img src={art} width={440} height={440} /> : <div style={{ display: 'flex', color: '#39ff7a', fontSize: 40 }}>pixmint</div>}
      </div>
    ),
    size,
  );
}
