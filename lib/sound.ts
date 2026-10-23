'use client';
// pixmint — 効果音（Web Audio でその場で作る。音のファイルは使わない）
//   スタンプ = ぽよん / 塗りつぶし = ぽこっ / 戻す = おっとっと（下がる音）/ 全部消す = どかーん（ノイズ）
// オン・オフはこのブラウザに覚える。最初の操作（クリック）までは鳴らない（ブラウザの決まり）

const KEY = 'pixmint-sound';
let ctx: AudioContext | null = null;
let on = true;
try {
  on = typeof window === 'undefined' ? true : localStorage.getItem(KEY) !== 'off';
} catch {}

export const soundOn = () => on;
export function setSound(v: boolean) {
  on = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {}
}

function ac(): AudioContext | null {
  if (!on || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** 周波数を f0 → f1 に動かす短い音 */
function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.08) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** ノイズ（爆発など） */
function noise(dur: number, vol = 0.12) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = a.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

export const sfx = {
  stamp: () => {
    tone(520, 880, 0.08, 'square', 0.06);
    setTimeout(() => tone(880, 660, 0.06, 'triangle', 0.05), 70);
  },
  fill: () => tone(300, 900, 0.12, 'sine', 0.09),
  undo: () => {
    tone(700, 500, 0.09, 'square', 0.05);
    setTimeout(() => tone(500, 260, 0.14, 'square', 0.05), 90);
  },
  boom: () => {
    noise(0.7, 0.16);
    tone(160, 40, 0.5, 'sawtooth', 0.06);
  },
};
