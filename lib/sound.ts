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
  redo: () => {
    tone(260, 500, 0.09, 'square', 0.05);
    setTimeout(() => tone(500, 700, 0.12, 'square', 0.05), 90);
  },
  boom: () => {
    noise(0.7, 0.16);
    tone(160, 40, 0.5, 'sawtooth', 0.06);
  },
};

// ── シューティング（クレジットの隠し遊び）の音 ──
export const sfxGame = {
  shoot: () => tone(1400, 700, 0.05, 'square', 0.025),
  hit: () => tone(400, 120, 0.12, 'square', 0.06),
  pop: () => {
    noise(0.25, 0.1);
    tone(600, 90, 0.2, 'triangle', 0.07);
  },
  ouch: () => {
    noise(0.5, 0.14);
    tone(220, 50, 0.45, 'sawtooth', 0.07);
  },
};

/** BGM: guruguruhyena「WALLS」(objkt KT1PZMvG…/43) と同じ曲。32 ステップのベース＋メロディ、
 *  ノコギリ波ベース（レゾナンスの効いたローパス＋1 オクターブ下の矩形波）、つつたた のドラム。
 *  bgm.speed(0..1) でテンポが上がる（0.26 秒 → 0.11 秒 / ステップ）。少し先まで予約して鳴らす */
const BASSN = [36, 36, 36, 36, 39, 39, 39, 39, 41, 41, 41, 40, 0, 40, 40, 40, 39, 39, 39, 39, 38, 38, 38, 38, 37, 37, 37, 36, 0, 36, 36, 36];
const MELN = [60, 0, 0, 0, 63, 0, 0, 0, 65, 0, 0, 64, 0, 0, 64, 0, 63, 0, 0, 0, 62, 0, 0, 0, 61, 0, 0, 60, 0, 0, 60, 0];
const nf = (n: number) => 440 * 2 ** ((n - 69) / 12);

let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmGain: GainNode | null = null;
let bgmSpeed = 0;

function beepAt(a: AudioContext, out: AudioNode, t: number, f: number, d: number, type: OscillatorType, v: number, slide = 0) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d);
}
function noiseAt(a: AudioContext, out: AudioNode, t: number, d: number, v: number) {
  const n = Math.floor(a.sampleRate * d);
  const b = a.createBuffer(1, n, a.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = v;
  s.buffer = b;
  s.connect(g).connect(out);
  s.start(t);
}
function bassAt(a: AudioContext, out: AudioNode, t: number, f: number, d: number) {
  const o = a.createOscillator();
  const flt = a.createBiquadFilter();
  const g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  flt.type = 'lowpass';
  flt.Q.value = 9;
  flt.frequency.setValueAtTime(1400, t);
  flt.frequency.exponentialRampToValueAtTime(180, t + d * 0.9);
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(flt).connect(g).connect(out);
  o.start(t);
  o.stop(t + d);
  beepAt(a, out, t, f / 2, d, 'square', 0.07);
}

export const bgm = {
  speed(v: number) {
    bgmSpeed = Math.max(0, Math.min(1, v));
  },
  start() {
    const a = ac();
    if (!a || bgmTimer) return;
    bgmGain = a.createGain();
    bgmGain.gain.value = 0.7;
    bgmGain.connect(a.destination);
    const out = bgmGain;
    let step = 0;
    let next = a.currentTime + 0.1;
    bgmTimer = setInterval(() => {
      while (next < a.currentTime + 0.3) {
        const iv = 0.26 - bgmSpeed * 0.15;
        const st = step % 32;
        if (BASSN[st]) bassAt(a, out, next, nf(BASSN[st]) * 2, iv * 0.95);
        if (st % 4 < 2) noiseAt(a, out, next, 0.015, 0.06);
        else {
          noiseAt(a, out, next, 0.07, 0.16); // snare
          beepAt(a, out, next, 190, 0.07, 'triangle', 0.05, -60);
        }
        if (st % 8 === 0) beepAt(a, out, next, 55, 0.06, 'sine', 0.1, -20); // kick
        if (MELN[st]) beepAt(a, out, next, nf(MELN[st]), iv * 0.8, 'square', 0.035);
        next += iv;
        step++;
      }
    }, 50);
  },
  stop() {
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = null;
    if (bgmGain && ctx) {
      const g = bgmGain;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(() => g.disconnect(), 600);
    }
    bgmGain = null;
  },
};
