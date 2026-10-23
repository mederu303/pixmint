'use client';
// pixmint — クレジット（ロゴを押すと開く）。背景はスタンプが跳ねながら流れるアニメーション
//   動きを減らす設定（prefers-reduced-motion）の人には、止まった絵で見せる
import { useEffect, useRef } from 'react';
import { PIX_CHAINS, LABEL } from '../lib/chains';
import { STAMPS, stampGrid } from '../lib/stamps';
import { PALETTES } from '../lib/pix';
import { useI18n } from '../lib/i18n';

const EXPLORER: Record<number, string> = {
  1: 'https://etherscan.io/address/',
  8453: 'https://basescan.org/address/',
  11155111: 'https://sepolia.etherscan.io/address/',
  84532: 'https://sepolia.basescan.org/address/',
};

const LINKS = [
  { label: 'mederu.art', href: 'https://mederu.art' },
  { label: 'X @mederu_art', href: 'https://x.com/mederu_art' },
  { label: 'Instagram @mederu_art', href: 'https://www.instagram.com/mederu_art/' },
  { label: 'GitHub mederu303/pixmint', href: 'https://github.com/mederu303/pixmint' },
];

/** 背景のスタンプ。1マス = PX 画面ピクセルで描く（ドットのまま） */
function StampRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const PX = 4;
    const colors = PALETTES.neon;
    const fit = () => {
      cv.width = Math.ceil(cv.clientWidth / PX);
      cv.height = Math.ceil(cv.clientHeight / PX);
    };
    fit();
    // スタンプを 1 つずつ下ごしらえ（小さなキャンバスに描いておく）
    const sprites = STAMPS.map((s, i) => {
      const g = stampGrid(s, colors[(i * 7) % colors.length]);
      const c = document.createElement('canvas');
      c.width = g[0].length;
      c.height = g.length;
      const x = c.getContext('2d')!;
      g.forEach((row, r) => row.forEach((v, k) => v && ((x.fillStyle = v), x.fillRect(k, r, 1, 1))));
      return c;
    });
    type P = { x: number; y: number; vy: number; phase: number; s: number };
    const ps: P[] = Array.from({ length: 22 }, (_, i) => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      vy: 0.08 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      s: i % sprites.length,
    }));
    let raf = 0;
    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = 0.55;
      for (const p of ps) {
        const bob = Math.round(Math.abs(Math.sin(t * 0.06 + p.phase)) * -3); // ぴょんぴょん跳ねる
        ctx.drawImage(sprites[p.s], Math.round(p.x), Math.round(p.y) + bob);
        if (!still) {
          p.y -= p.vy;
          if (p.y < -18) {
            p.y = cv.height + 2;
            p.x = Math.random() * cv.width;
          }
        }
      }
      ctx.globalAlpha = 1;
      t++;
      if (!still) raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);
  return <canvas ref={ref} className="credits-bg" aria-hidden />;
}

export function Credits({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const version = process.env.NEXT_PUBLIC_VERSION ?? '';
  const build = process.env.NEXT_PUBLIC_BUILD ?? '';
  return (
    <div className="modal credits" role="dialog" aria-modal="true" aria-label={t('credits.title')} onClick={onClose}>
      <div className="credits-box" onClick={(e) => e.stopPropagation()}>
        <StampRain />
        <div className="credits-body">
          <div className="credits-logo">pixmint</div>
          <div className="note">
            v{version}
            {build && ` · build ${build}`}
          </div>
          <p className="credits-tag">{t('credits.tag')}</p>
          <dl className="credits-list">
            <dt>{t('credits.by')}</dt>
            <dd>mederu.art</dd>
            <dt>{t('credits.contract')}</dt>
            <dd>
              {PIX_CHAINS.map((p) => (
                <a key={p.chain.id} href={`${EXPLORER[p.chain.id] ?? ''}${p.address}`} target="_blank" rel="noopener noreferrer">
                  PixMint v3 · {LABEL[p.chain.id]} ↗
                </a>
              ))}
            </dd>
            <dt>{t('credits.storage')}</dt>
            <dd>{t('credits.storageValue')}</dd>
          </dl>
          <div className="credits-links">
            {LINKS.map((l) => (
              <a key={l.href} className="tool" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label} ↗
              </a>
            ))}
          </div>
          <button className="ghost" onClick={onClose}>
            {t('credits.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
