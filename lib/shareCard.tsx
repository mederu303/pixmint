/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// pixmint — X に貼る共有用 URL の中身（v3: /l/<chainId>/<id>・v4: /l/v4/<chainId>/<id>）。mederu.art の medeLink と同じ仕組み
//   X はページのカード設定を読み、ツイートの中に /l/embed/… を埋め込んで、作品をその場でコントラクトから読んで見せる
import type { Metadata } from 'next';
import { ImageResponse } from 'next/og';
import { readWork, svgUrl } from './contract';
import { LABEL, type Ver } from './chains';
import { artistName } from './names';

const SITE = 'https://pixmint.mederu.art';
const PLAYER = 480;
export const posterSize = { width: PLAYER, height: PLAYER };
const v = (ver: Ver) => (ver === 4 ? '/v4' : '');

export async function shareMetadata(c: string, id: string, ver: Ver): Promise<Metadata> {
  const embed = `${SITE}/l/embed${v(ver)}/${c}/${id}`;
  let title = `pixmint #${id}`;
  try {
    const w = await readWork(Number(c), BigInt(id), ver);
    title = `${w.title || `#${id}`} by ${await artistName(w.creator, Number(c))}`;
  } catch {}
  const description = `Live from the ${LABEL[Number(c)] ?? ''} contract · fully on-chain pixel art · pixmint`;
  return {
    title: `${title} — pixmint`,
    description,
    openGraph: {
      type: 'video.other',
      url: `/l${v(ver)}/${c}/${id}`,
      siteName: 'pixmint',
      title,
      description,
      videos: [{ url: embed, secureUrl: embed, type: 'text/html', width: PLAYER, height: PLAYER }],
    },
    twitter: { card: 'player', site: '@mederu_art', title, description },
    // プレイヤーの3つは手で書く（Next の players は動画ファイル用の twitter:player:stream も出してしまう）
    other: { 'twitter:player': embed, 'twitter:player:width': PLAYER, 'twitter:player:height': PLAYER },
  };
}

/** プレイヤーカードの止まった絵（480×480。プレイヤーが動く前や、動かない場所で出る）。作品だけを大きく */
export async function sharePoster(c: string, id: string, ver: Ver) {
  let art = '';
  try {
    art = svgUrl((await readWork(Number(c), BigInt(id), ver)).svg);
  } catch {}
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
        {art ? <img src={art} width={440} height={440} /> : <div style={{ display: 'flex', color: '#39ff7a', fontSize: 40 }}>pixmint</div>}
      </div>
    ),
    posterSize,
  );
}
