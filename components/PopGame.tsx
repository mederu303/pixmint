'use client';
// pixmint — クレジットの隠し遊び: 降ってくるスタンプのキャラをクリック（タップ）で消す
//   下の赤い線まで落ちると ♥ が 1 つ減る。3 つ無くなると終わり（押すともう一度。GAME OVER の曲はテンポ半分）
//   続けて消すとコンボで点が増える。だんだん速く・多くなり、BGM のテンポも上がる
//   ・すばやい個体: ジグザグに速く落ちる（残像つき）
//   ・キノコ: 消すと無敵モード（7 秒）。落としても ♥ が減らず、押したまわりをまとめて消せる。曲が 5 度上がる
//   ・ラスボス: でかい髑髏。40 秒後から 60 秒ごと。子分を吐きながら降りてくる。線まで来ると ♥ 2 つ
//   画面は 1マス = PX 画面ピクセルで描く（ドットのまま）
import { useEffect, useRef, useState } from 'react';
import { STAMPS, stampGrid } from '../lib/stamps';
import { PALETTES } from '../lib/pix';
import { bgm, sfxGame } from '../lib/sound';

const PX = 4;
const FPS = 60;
const INVINCIBLE = 7 * FPS;
const BOSS_FIRST = 40 * FPS;
const BOSS_EVERY = 60 * FPS;

function sprite(rows: (string | null)[][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((row, r) => row.forEach((v, k) => v && ((x.fillStyle = v), x.fillRect(k, r, 1, 1))));
  return c;
}

type Kind = 'normal' | 'big' | 'fast' | 'shroom' | 'boss';
type Foe = { kind: Kind; x: number; y: number; vy: number; vx: number; s: number; hp: number; max: number; flash: number; size: number; age: number };
type Dot = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const IDX = (id: string) => STAMPS.findIndex((s) => s.id === id);

export function PopGame() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, lives: 3, combo: 0, over: false, star: 0, boss: 0 });
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
    const SHROOM = IDX('mushroom');
    const SKULL = IDX('skull');
    const skullImg = sprite(stampGrid(STAMPS[SKULL], '#ff3c5a'));
    const commons = STAMPS.map((_, i) => i).filter((i) => i !== SHROOM && i !== SKULL);
    const pick = () => commons[Math.floor(Math.random() * commons.length)];

    let score = 0;
    let lives = 3;
    let combo = 0;
    let over = false;
    let t = 0;
    let shake = 0;
    let star = 0; // 無敵の残り（フレーム）
    let bosses = 0; // 倒したボスの数
    let nextBoss = BOSS_FIRST;
    let whiteout = 0;
    let foes: Foe[] = [];
    let dots: Dot[] = [];
    const stars = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 0.1 + Math.random() * 0.4 }));
    const boss = () => foes.find((f) => f.kind === 'boss');
    const show = () => {
      const b = boss();
      setHud({ score, lives, combo, over, star: Math.ceil(star / FPS), boss: b ? b.hp / b.max : 0 });
    };

    const burst = (x: number, y: number, n: number, c: string) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.3 + Math.random() * 1.6;
        dots.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 22 + Math.random() * 22, color: c });
      }
    };
    const spawn = (kind: Kind, lv: number, at?: { x: number; y: number }) => {
      const size = kind === 'big' ? 32 : kind === 'boss' ? 64 : 16;
      const hp = kind === 'big' ? 3 : kind === 'boss' ? 40 + bosses * 20 : 1;
      foes.push({
        kind,
        x: at?.x ?? Math.random() * (W - size),
        y: at?.y ?? -size,
        vy: kind === 'boss' ? 0.07 : kind === 'fast' ? 0.55 + lv * 0.6 : 0.25 + Math.random() * 0.22 + lv * 0.5,
        vx: kind === 'fast' ? (Math.random() < 0.5 ? -1 : 1) * (1 + lv) : kind === 'boss' ? 0.4 : (Math.random() - 0.5) * 0.3,
        s: kind === 'shroom' ? SHROOM : kind === 'boss' ? SKULL : pick(),
        hp,
        max: hp,
        flash: 0,
        size,
        age: 0,
      });
    };
    restart.current = () => {
      score = 0;
      lives = 3;
      combo = 0;
      over = false;
      t = 0;
      star = 0;
      bosses = 0;
      nextBoss = BOSS_FIRST;
      foes = [];
      dots = [];
      bgm.mode('play');
      bgm.pitch(1);
      show();
    };

    const level = () => Math.min(1, t / (75 * FPS)); // 約 75 秒で一番速く
    const kill = (f: Foe) => {
      f.hp = 0;
      combo++;
      const base = f.kind === 'boss' ? 5000 * (bosses + 1) : f.kind === 'big' ? 300 : f.kind === 'fast' ? 250 : f.kind === 'shroom' ? 500 : 100;
      const pts = f.kind === 'boss' ? base : base * Math.min(combo, 8);
      score += pts;
      const c = f.kind === 'boss' ? '#ff3c5a' : color(f.s);
      burst(f.x + f.size / 2, f.y + f.size / 2, f.kind === 'boss' ? 220 : f.size > 16 ? 60 : 28, c);
      floatText(f.x + f.size / 2, f.y, `+${pts}`, f.kind === 'boss');
      if (f.kind === 'shroom') {
        star = INVINCIBLE;
        bgm.pitch(1.5);
        sfxGame.power();
      } else if (f.kind === 'boss') {
        bosses++;
        whiteout = 30;
        shake = 30;
        sfxGame.win();
        // 画面の敵もまとめて消える
        for (const o of foes) if (o !== f && o.hp > 0) (o.hp = 0), burst(o.x + o.size / 2, o.y + o.size / 2, 16, color(o.s));
      } else sfxGame.pop();
    };

    const step = () => {
      t++;
      const lv = level();
      bgm.speed(lv);
      if (star) {
        star--;
        if (!star) bgm.pitch(1);
      }
      if (!over) {
        const b = boss();
        if (!b && t >= nextBoss) {
          spawn('boss', lv, { x: W / 2 - 32, y: -64 });
          nextBoss = t + BOSS_EVERY;
          shake = 20;
          sfxGame.boss();
        }
        const rate = Math.round((b ? 1.8 : 1) * (50 - lv * 34));
        if (t % rate === 0) {
          const r = Math.random();
          spawn(r < 0.05 ? 'shroom' : r < 0.05 + 0.08 + lv * 0.15 ? 'fast' : r < 0.3 + lv * 0.12 ? 'big' : 'normal', lv);
        }
        // ボスは子分（すばやい個体）を吐く
        if (b && b.y > 0 && t % Math.max(50, 110 - bosses * 15) === 0) spawn('fast', lv, { x: b.x + 24, y: b.y + 48 });
      }
      for (const f of foes) {
        f.age++;
        f.y += f.vy;
        f.x += f.kind === 'fast' ? f.vx * Math.sign(Math.sin(f.age * 0.08)) : f.vx;
        if (f.kind === 'boss') f.x = W / 2 - 32 + Math.sin(f.age * 0.015) * (W / 2 - 34);
        f.x = Math.max(0, Math.min(W - f.size, f.x));
        if (f.kind !== 'fast' && f.kind !== 'boss' && (f.x <= 0 || f.x >= W - f.size)) f.vx *= -1;
        if (f.flash) f.flash--;
        if (!over && f.hp > 0 && f.y + f.size * 0.8 > LINE) {
          f.hp = 0;
          burst(f.x + f.size / 2, LINE, 30, '#ff3c5a');
          if (star) {
            sfxGame.pop(); // 無敵中は落としても平気
            continue;
          }
          lives -= f.kind === 'boss' ? 2 : 1;
          combo = 0;
          shake = 12;
          sfxGame.ouch();
          if (lives <= 0) {
            lives = 0;
            over = true;
            star = 0;
            bgm.pitch(1);
            bgm.mode('idle');
            sfxGame.over();
          }
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
      for (const s of stars) s.y = (s.y + s.v * (star ? 4 : 1)) % H;
      if (shake) shake--;
      if (whiteout) whiteout--;
      if (t % 6 === 0) show();
    };

    const draw = () => {
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (star) {
        ctx.fillStyle = `hsla(${(t * 6) % 360}, 90%, 55%, 0.18)`;
        ctx.fillRect(0, 0, W, H);
      }
      if (shake) ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
      for (const s of stars) {
        ctx.fillStyle = s.v > 0.35 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)';
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, star ? 3 : 1);
      }
      ctx.fillStyle = star ? `hsl(${(t * 6) % 360}, 90%, 60%)` : t % 30 < 15 ? '#ff3c5a' : '#b0203a';
      for (let x = 0; x < W; x += 3) ctx.fillRect(x, LINE, 2, 1);
      for (const f of foes) {
        const img = f.kind === 'boss' ? skullImg : imgs[f.s];
        if (f.kind === 'fast') {
          ctx.globalAlpha = 0.25; // 残像
          ctx.drawImage(img, Math.round(f.x - f.vx * 4 * Math.sign(Math.sin(f.age * 0.08))), Math.round(f.y - f.vy * 5), f.size, f.size);
        }
        if (f.kind === 'shroom') {
          ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.15)); // きらきら
          ctx.fillStyle = '#ffd23a';
          ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, f.size + 2, f.size + 2);
        }
        ctx.globalAlpha = f.flash % 2 ? 0.35 : 1;
        ctx.drawImage(img, Math.round(f.x), Math.round(f.y), f.size, f.size);
      }
      ctx.globalAlpha = 1;
      for (const d of dots) {
        ctx.fillStyle = d.color;
        ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
      }
      ctx.restore();
      if (whiteout) {
        ctx.fillStyle = `rgba(255,255,255,${whiteout / 30})`;
        ctx.fillRect(0, 0, W, H);
      }
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
    const floatText = (x: number, y: number, text: string, big = false) => {
      const el = document.createElement('span');
      el.className = big ? 'pop-score big' : 'pop-score';
      el.textContent = text;
      el.style.left = `${x * PX}px`;
      el.style.top = `${y * PX}px`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), big ? 1400 : 800);
    };

    const onDown = (e: PointerEvent) => {
      if (over) return;
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      const hits = (f: Foe, pad: number) => x > f.x - pad && x < f.x + f.size + pad && y > f.y - pad && y < f.y + f.size + pad;
      if (star) {
        // 無敵中: 押したまわりをまとめて消す（ボスには 3 ダメージ）
        let any = false;
        for (const f of foes) {
          if (f.hp <= 0 || !hits(f, 12)) continue;
          any = true;
          if (f.kind === 'boss') {
            f.hp -= 3;
            f.flash = 6;
            if (f.hp <= 0) kill(f);
            else sfxGame.hit();
          } else kill(f);
        }
        if (!any) combo = 0;
        foes = foes.filter((f) => f.hp > 0);
        show();
        return;
      }
      // 手前（後から出た）ものから当たりを見る。指でも当てやすいよう少し広めに
      for (let i = foes.length - 1; i >= 0; i--) {
        const f = foes[i];
        if (!hits(f, 2)) continue;
        f.hp--;
        f.flash = 6;
        if (f.hp <= 0) kill(f);
        else sfxGame.hit();
        foes = foes.filter((o) => o.hp > 0);
        show();
        return;
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
    <div className={`shooter${hud.star ? ' star' : ''}`}>
      <canvas ref={ref} className="shooter-cv" />
      <div className="shooter-hud">
        <span>
          SCORE {hud.score.toString().padStart(6, '0')}
          {hud.combo > 1 && <em> ×{Math.min(hud.combo, 8)}</em>}
        </span>
        {hud.star > 0 && <span className="hud-star">★ {hud.star}</span>}
        <span>{'♥'.repeat(Math.max(0, hud.lives))}</span>
      </div>
      {hud.boss > 0 && (
        <div className="boss-bar" aria-label="boss">
          <i style={{ width: `${hud.boss * 100}%` }} />
        </div>
      )}
      {hud.over && (
        <button className="shooter-over" onClick={() => restart.current()}>
          GAME OVER
          <small>SCORE {hud.score} · CLICK TO RETRY</small>
        </button>
      )}
    </div>
  );
}
