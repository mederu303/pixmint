/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// pixmint — 作品ページのカード画像（app/[chainId]/[id]・app/v4/… の opengraph-image から呼ぶ）（X・OGP 用 1200×630）。mederu の作品カードを元にした並び:
//   左 = ロゴ・題名・作者 / 右 = 作品（オンチェーンの SVG をそのまま描く）
import type { Metadata } from 'next';
import { ImageResponse } from 'next/og';
import { LABEL, workPath } from './chains';
import { readWork, svgUrl } from './contract';
import { artistName } from './names';

import type { Ver } from './chains';

export const cardSize = { width: 1200, height: 630 };

/** Google Fonts から TTF を取る（UA を付けないと TTF が返る）。text を渡すとその文字だけの小さいファイルになる */
async function font(family: string, weight: number, text?: string): Promise<ArrayBuffer | null> {
  try {
    const q = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
    const css = await (await fetch(q, { signal: AbortSignal.timeout(4000) })).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url, { signal: AbortSignal.timeout(4000) })).arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** 作品ページのカード画像（v3 / v4 共通） */
export async function workCardImage(c: string, i: string, ver: Ver) {
  const chainId = Number(c);
  let title = 'pixmint';
  let artist = '';
  let art = '';
  try {
    const w = await readWork(chainId, BigInt(i), ver);
    title = w.title || `#${i}`;
    artist = await artistName(w.creator, chainId);
    art = svgUrl(w.svg);
  } catch {}
  const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s);
  const text = title + artist + `by #${i}`;
  const [logo, mono, jp] = await Promise.all([font('Silkscreen', 700), font('DM+Mono', 500), font('Noto+Sans+JP', 700, text)]);
  const fonts = [
    logo && { name: 'Silkscreen', data: logo, weight: 700 as const },
    mono && { name: 'DM Mono', data: mono, weight: 500 as const },
    jp && { name: 'Noto Sans JP', data: jp, weight: 700 as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 500 | 700 }[];
  const body = '"DM Mono", "Noto Sans JP"';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(135deg, #05060f 0%, #0b0b1c 55%, #050f08 100%)', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 52px', position: 'relative' }}>
          <div style={{ fontFamily: 'Silkscreen', fontSize: 40, color: '#39ff7a', letterSpacing: '0.04em', display: 'flex' }}>PIXMINT</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: body, fontSize: 54, fontWeight: 700, color: '#ecebf5', lineHeight: 1.2, display: 'flex' }}>{clip(title, 28)}</div>
            {artist && <div style={{ fontFamily: body, fontSize: 28, color: '#9a9ab8', marginTop: 18, display: 'flex' }}>by {clip(artist, 24)}</div>}
            <div style={{ width: 80, height: 3, background: 'linear-gradient(90deg, #39ff7a, #7c3aed)', marginTop: 40, display: 'flex' }} />
          </div>
          <div style={{ fontFamily: body, fontSize: 18, color: '#5c5c78', letterSpacing: '0.14em', display: 'flex' }}>
            {`FULLY ON-CHAIN · ${(LABEL[chainId] ?? '').toUpperCase()} · #${i}`}
          </div>
        </div>
        <div style={{ width: 630, height: 630, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
          {art ? <img src={art} width={560} height={560} /> : <div style={{ display: 'flex', fontFamily: 'Silkscreen', fontSize: 40, color: '#333' }}>pixmint</div>}
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 140, height: 4, background: 'linear-gradient(90deg, #39ff7a, transparent)', display: 'flex' }} />
      </div>
    ),
    { ...cardSize, fonts: fonts.length ? fonts : undefined },
  );
}

/** 作品ページのタイトルと説明（v3 / v4 共通） */
export async function workMetadata(c: string, id: string, ver: Ver): Promise<Metadata> {
  try {
    const w = await readWork(Number(c), BigInt(id), ver);
    const title = `${w.title || `#${id}`} by ${await artistName(w.creator, Number(c))}`;
    const description = 'Pixel art stored fully on-chain — no IPFS, no server. pixmint by mederu.art';
    return {
      title: `${title} — pixmint`,
      description,
      openGraph: { type: 'website', url: workPath(Number(c), BigInt(id), ver), siteName: 'pixmint', title, description },
      twitter: { card: 'summary_large_image', title, description },
    };
  } catch {
    return {};
  }
}
