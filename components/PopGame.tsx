'use client';
// pixmint — クレジットの隠し遊び: 降ってくるスタンプのキャラをクリック（タップ）で消す
//   下の赤い線まで落ちると ♥ が 1 つ減る。3 つ無くなると終わり（押すともう一度）
//   続けて消すとコンボで点が増える。だんだん速く・多くなり、BGM のテンポも上がる
//   画面は 1マス = PX 画面ピクセルで描く（ドットのまま）
import { useEffect, useRef, useState } from 'react';
import { STAMPS, stampGrid } from '../lib/stamps';
import { PALETTES } from '../lib/pix';
import { bgm, sfxGame } from '../lib/sound';

const PX = 4;

function sprite(rows: (string | null)[][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((row, r) => row.forEach((v, k) => v && ((x.fillStyle = v), x.fillRect(k, r, 1, 1))));
  return c;
}

type Foe = { x: number; y: number; vy: number; vx: number; s: number; hp: number; flash: number; big: boolean };
type Dot = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Pop = { x: number; y: number; text: string; life: number };

export function PopGame() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, lives: 3, combo: 0, over: false });
  const restart = useRef<() => void>(() => {});

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const W = (cv.width = Math.ceil(cv.clientWidth / PX));
    const H = (cv.height = Math.ceil(cv.clientHeight / PX));
    const LINE = H - 6;
    const colors = PALETTES.neon;
    const color = (i: number) => colors[(i * 5 + 2) % colors.length];
    const imgs = STAMPS.map((s, i) => sprite(stampGrid(s, color(i))));

    let score = 0;
    let lives = 3;
    let combo = 0;
    let over = false;
    let t = 0;
    let shake = 0;
    let foes: Foe[] = [];
    let dots: Dot[] = [];
    let pops: Pop[] = [];
    const stars = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 0.1 + Math.random() * 0.4 }));
    const show = () => setHud({ score, lives, combo, over });

    const burst = (x: number, y: number, n: number, c: string) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.3 + Math.random() * 1.6;
        dots.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 22 + Math.random() * 22, color: c });
      }
    };
    restart.current = () => {
      score = 0;
      lives = 3;
      combo = 0;
      over = false;
      t = 0;
      foes = [];
      dots = [];
      pops = [];
      show();
      bgm.start();
    };

    const level = () => Math.min(1, t / 5400); // 約 90 秒で一番速く
    const step = () => {
      t++;
      const lv = level();
      bgm.speed(lv);
      const rate = Math.round(70 - lv * 48);
      if (!over && t % rate === 0) {
        const big = Math.random() < 0.15 + lv * 0.15;
        const size = big ? 32 : 16;
        foes.push({
          x: Math.random() * (W - size),
          y: -size,
          vy: 0.18 + Math.random() * 0.2 + lv * 0.45,
          vx: (Math.random() - 0.5) * 0.3,
          s: Math.floor(Math.random() * imgs.length),
          hp: big ? 3 : 1,
          flash: 0,
          big,
        });
      }
      for (const f of foes) {
        const size = f.big ? 32 : 16;
        f.y += f.vy;
        f.x += f.vx;
        if (f.x < 0 || f.x > W - size) f.vx *= -1;
        if (f.flash) f.flash--;
        if (!over && f.y + size * 0.8 > LINE) {
          f.hp = 0;
          lives--;
          combo = 0;
          shake = 10;
          burst(f.x + size / 2, LINE, 30, '#ff3c5a');
          sfxGame.ouch();
          if (lives <= 0) {
            over = true;
            bgm.stop();
          }
          show();
        }
      }
      foes = foes.filter((f) => f.hp > 0);
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        d.vy += 0.04;
        d.vx *= 0.97;
        d.life--;
      }
      dots = dots.filter((d) => d.life > 0);
      for (const p of pops) (p.y -= 0.3), p.life--;
      pops = pops.filter((p) => p.life > 0);
      for (const s of stars) s.y = (s.y + s.v) % H;
      if (shake) shake--;
    };

    const draw = () => {
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (shake) ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
      for (const s of stars) {
        ctx.fillStyle = s.v > 0.35 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)';
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      ctx.fillStyle = t % 30 < 15 ? '#ff3c5a' : '#b0203a';
      for (let x = 0; x < W; x += 3) ctx.fillRect(x, LINE, 2, 1);
      for (const f of foes) {
        const size = f.big ? 32 : 16;
        ctx.globalAlpha = f.flash % 2 ? 0.35 : 1;
        ctx.drawImage(imgs[f.s], Math.round(f.x), Math.round(f.y), size, size);
      }
      ctx.globalAlpha = 1;
      for (const d of dots) {
        ctx.fillStyle = d.color;
        ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
      }
      ctx.restore();
    };

    let raf = 0;
    const loop = () => {
      step();
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();
    bgm.start();

    // 点の表示（+100 など）は文字がつぶれないよう HTML で出す
    const layer = cv.parentElement!;
    const floatText = (x: number, y: number, text: string) => {
      const el = document.createElement('span');
      el.className = 'pop-score';
      el.textContent = text;
      el.style.left = `${x * PX}px`;
      el.style.top = `${y * PX}px`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 800);
    };

    const onDown = (e: PointerEvent) => {
      if (over) return;
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      // 手前（後から出た）ものから当たりを見る。指でも当てやすいよう少し広めに
      for (let i = foes.length - 1; i >= 0; i--) {
        const f = foes[i];
        const size = f.big ? 32 : 16;
        if (x > f.x - 2 && x < f.x + size + 2 && y > f.y - 2 && y < f.y + size + 2) {
          f.hp--;
          f.flash = 6;
          if (f.hp <= 0) {
            combo++;
            const pts = (f.big ? 300 : 100) * Math.min(combo, 8);
            score += pts;
            burst(f.x + size / 2, f.y + size / 2, f.big ? 60 : 28, color(f.s));
            floatText(f.x + size / 2, f.y, `+${pts}`);
            sfxGame.pop();
            foes.splice(i, 1);
          } else sfxGame.hit();
          show();
          return;
        }
      }
      combo = 0; // 空振りでコンボが切れる
      show();
    };
    cv.addEventListener('pointerdown', onDown);
    return () => {
      cancelAnimationFrame(raf);
      bgm.stop();
      cv.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <div className="shooter">
      <canvas ref={ref} className="shooter-cv" />
      <div className="shooter-hud">
        <span>
          SCORE {hud.score.toString().padStart(6, '0')}
          {hud.combo > 1 && <em> ×{Math.min(hud.combo, 8)}</em>}
        </span>
        <span>{'♥'.repeat(Math.max(0, hud.lives))}</span>
      </div>
      {hud.over && (
        <button className="shooter-over" onClick={() => restart.current()}>
          GAME OVER
          <small>SCORE {hud.score} · CLICK TO RETRY</small>
        </button>
      )}
    </div>
  );
}
