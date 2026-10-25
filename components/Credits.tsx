'use client';
// pixmint — クレジット（ロゴを押すと開く）。背景はスタンプが跳ねながら流れるアニメーション
//   動きを減らす設定（prefers-reduced-motion）の人には、止まった絵で見せる
import { useEffect, useRef, useState } from 'react';
import { PIX4_CHAINS, PIX_CHAINS, LABEL } from '../lib/chains';
import { STAMPS, stampGrid } from '../lib/stamps';
import { PALETTES } from '../lib/pix';
import { useI18n } from '../lib/i18n';
import { PopGame } from './PopGame';
import { sfxGame } from '../lib/sound';

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
  // 隠し遊び: ロゴを押すと文字が散らばって消え、画面が明るくなってシューティングが始まる
  const [phase, setPhase] = useState<'credits' | 'scatter' | 'play'>('credits');
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const start = () => {
    if (phase !== 'credits' || !box.current || !body.current) return;
    box.current.style.height = `${Math.max(box.current.offsetHeight, 420)}px`;
    const parts = body.current.querySelectorAll<HTMLElement>('.credits-body > :not(dl):not(.credits-links), .credits-list > *, .credits-links > *');
    parts.forEach((el) => {
      const a = Math.random() * Math.PI * 2;
      const d = 260 + Math.random() * 260;
      el.style.transition = `transform 0.9s cubic-bezier(.2,.7,.3,1) ${Math.random() * 0.15}s, opacity 0.9s ease ${Math.random() * 0.15}s`;
      el.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${(Math.random() - 0.5) * 720}deg) scale(${0.4 + Math.random()})`;
      el.style.opacity = '0';
    });
    sfxGame.sparkle();
    setPhase('scatter');
    setTimeout(() => setPhase('play'), 950);
  };
  const version = process.env.NEXT_PUBLIC_VERSION ?? '';
  const build = process.env.NEXT_PUBLIC_BUILD ?? '';
  return (
    <div className="modal credits" role="dialog" aria-modal="true" aria-label={t('credits.title')} onClick={onClose}>
      <div ref={box} className={`credits-box${phase === 'play' ? ' bright' : ''}`} onClick={(e) => e.stopPropagation()}>
        {phase !== 'play' && <StampRain />}
        {phase === 'play' && (
          <>
            <PopGame />
            <button className="shooter-close" onClick={onClose} aria-label={t('credits.close')}>
              ×
            </button>
          </>
        )}
        <div ref={body} className="credits-body" hidden={phase === 'play'}>
          <button className="credits-logo" onClick={start} title="?">
            pixmint
          </button>
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
              {/* v4（スタンプ入り。今のミント先）と v3（Genesis。2026-10-25 にミントを閉じた最初期のコレクション） */}
              {[...PIX4_CHAINS, ...PIX_CHAINS].map((p) => (
                <a key={`${p.chain.id}-${p.ver}`} href={`${EXPLORER[p.chain.id] ?? ''}${p.address}`} target="_blank" rel="noopener noreferrer">
                  {p.ver === 4 ? 'PixMint v4' : 'PixMint v3 Genesis'} · {LABEL[p.chain.id]} ↗
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
