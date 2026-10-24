// pixmint — X に貼る共有用 URL（mederu.art の medeLink と同じ仕組み）
//   X はこのページのカード設定を読み、ツイートの中に /l/embed/… を埋め込んで、作品をその場でコントラクトから読んで見せる。
//   人が開いたときは作品ページへ移る（X の読み取りはスクリプトを動かさないので、カード設定はそのまま読まれる）
import type { Metadata } from 'next';
import { readWork } from '../../../../lib/contract';
import { LABEL } from '../../../../lib/chains';
import { artistName } from '../../../../lib/names';
import { Redirect } from './Redirect';

export const revalidate = 3600;
const SITE = 'https://pixmint.mederu.art';
const PLAYER = 480;

type Params = { params: Promise<{ chainId: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { chainId: c, id } = await params;
  const embed = `${SITE}/l/embed/${c}/${id}`;
  let title = `pixmint #${id}`;
  try {
    const w = await readWork(Number(c), BigInt(id));
    title = `${w.title || `#${id}`} by ${await artistName(w.creator, Number(c))}`;
  } catch {}
  const description = `Live from the ${LABEL[Number(c)] ?? ''} contract · fully on-chain pixel art · pixmint`;
  return {
    title: `${title} — pixmint`,
    description,
    openGraph: {
      type: 'video.other',
      url: `/l/${c}/${id}`,
      siteName: 'pixmint',
      title,
      description,
      videos: [{ url: embed, secureUrl: embed, type: 'text/html', width: PLAYER, height: PLAYER }],
    },
    twitter: {
      card: 'player',
      site: '@mederu_art',
      title,
      description,
    },
    // プレイヤーの3つは手で書く（Next の players は動画ファイル用の twitter:player:stream も出してしまう）
    other: { 'twitter:player': embed, 'twitter:player:width': PLAYER, 'twitter:player:height': PLAYER },
  };
}

export default async function SharePage({ params }: Params) {
  const { chainId, id } = await params;
  return <Redirect to={`/${chainId}/${id}`} />;
}
