// 產生音樂庫：用程式合成原創配樂與音效（無版權問題），輸出 AAC 到 server/music/
// 用法：node scripts/generate-music.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'server', 'music');
const SR = 44100;
const TAU = Math.PI * 2;

// ---------- 基本工具 ----------
function makeRng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const onePoleA = (fc) => 1 - Math.exp((-TAU * fc) / SR);

function biquad(buf, type, fc, q = 0.707) {
  const w = (TAU * fc) / SR;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

const noiseRng = makeRng(99);
const noise = () => noiseRng() * 2 - 1;

/** 釋放：音符長度之後以指數衰減收尾 */
function release(buf, dur, rate = 14) {
  const start = Math.floor(dur * SR);
  for (let i = start; i < buf.length; i++) buf[i] *= Math.exp((-(i - start) / SR) * rate);
  return buf;
}

// ---------- 樂器 ----------
function pluck(f, dur, { decay = 0.996, bright = 0.6 } = {}) {
  const N = Math.max(2, Math.round(SR / f));
  const ring = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += (noise() - lp) * bright;
    ring[i] = lp;
  }
  const out = new Float32Array(Math.floor((dur + 0.5) * SR));
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const next = (idx + 1) % N;
    out[i] = ring[idx];
    ring[idx] = decay * 0.5 * (ring[idx] + ring[next]);
    idx = next;
  }
  return release(out, dur, 10);
}

function mallet(f, dur) {
  const out = new Float32Array(Math.floor((dur + 0.9) * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] =
      Math.sin(TAU * f * t) * Math.exp(-t * 3.2) +
      0.25 * Math.sin(TAU * f * 3.99 * t) * Math.exp(-t * 9) +
      0.06 * Math.sin(TAU * f * 10.2 * t) * Math.exp(-t * 28);
    if (t < 0.003) out[i] *= t / 0.003;
  }
  return out;
}

function epiano(f, dur) {
  const out = new Float32Array(Math.floor((dur + 0.4) * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const idx = 1.6 * Math.exp(-t * 3.5);
    const mod = Math.sin(TAU * f * t) * idx;
    const amp = Math.min(1, t / 0.004) * Math.exp(-t * 1.1) * (1 + 0.08 * Math.sin(TAU * 4.5 * t));
    out[i] = amp * (Math.sin(TAU * f * t + mod) + 0.05 * Math.sin(TAU * f * 7 * t) * Math.exp(-t * 18));
  }
  return release(out, dur, 9);
}

function piano(f, dur) {
  const len = Math.floor((dur + 1.2) * SR);
  const out = new Float32Array(len);
  const fk = Math.sqrt(f / 261);
  for (let k = 1; k <= 6; k++) {
    const pf = f * k * Math.sqrt(1 + 0.0004 * k * k);
    if (pf > 12000) break;
    const a = 1 / Math.pow(k, 1.4);
    const d = (0.7 + k * 0.55) * fk;
    for (let i = 0; i < len; i++) out[i] += a * Math.sin((TAU * pf * i) / SR) * Math.exp((-i / SR) * d);
  }
  for (let i = 0; i < 220; i++) out[i] = out[i] * (i / 220) + noise() * 0.08 * (1 - i / 220);
  return release(out, dur, 7);
}

function pad(f, dur, { cut = 1600, attack = 0.5 } = {}) {
  const len = Math.floor((dur + 1) * SR);
  const out = new Float32Array(len);
  const a = onePoleA(cut);
  for (const det of [-0.006, 0, 0.0055]) {
    let ph = noiseRng();
    let lp = 0;
    const inc = (f * (1 + det)) / SR;
    for (let i = 0; i < len; i++) {
      ph += inc;
      if (ph >= 1) ph -= 1;
      lp += (2 * ph - 1 - lp) * a;
      out[i] += lp / 3;
    }
  }
  for (let i = 0; i < len; i++) out[i] *= Math.min(1, i / SR / attack);
  return release(out, dur, 4);
}

function bass(f, dur, drive = 1.6) {
  const out = new Float32Array(Math.floor((dur + 0.08) * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const x = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t);
    out[i] = Math.tanh(x * drive) * Math.min(1, t / 0.005);
  }
  return release(out, dur, 40);
}

function sawBass(f, dur) {
  const out = new Float32Array(Math.floor((dur + 0.05) * SR));
  let ph = 0, lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    lp += (2 * ph - 1 - lp) * onePoleA(300 + 2200 * Math.exp(-t * 14));
    out[i] = lp * Math.min(1, t / 0.003);
  }
  return release(out, dur, 50);
}

function pulse(f, dur, { duty = 0.5, vib = 0, cut = 0 } = {}) {
  const out = new Float32Array(Math.floor((dur + 0.06) * SR));
  let ph = 0, lp = 0;
  const a = cut ? onePoleA(cut) : 1;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const v = t > 0.12 ? 1 + vib * Math.sin(TAU * 5.5 * t) : 1;
    ph = (ph + (f * v) / SR) % 1;
    lp += ((ph < duty ? 1 : -1) - lp) * a;
    out[i] = lp * Math.min(1, t / 0.004);
  }
  return release(out, dur, 35);
}

function sineLead(f, dur, vib = 0.012) {
  const out = new Float32Array(Math.floor((dur + 0.25) * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += (f * (1 + (t > 0.15 ? vib * Math.sin(TAU * 5 * t) : 0))) / SR;
    out[i] = (Math.sin(TAU * ph) + 0.12 * Math.sin(TAU * 2 * ph)) * Math.min(1, t / 0.03);
  }
  return release(out, dur, 12);
}

function bell(f, dur = 0) {
  const out = new Float32Array(Math.floor((dur + 2.5) * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const mod = Math.sin(TAU * f * 3.5 * t) * 2.5 * Math.exp(-t * 3);
    out[i] = Math.sin(TAU * f * t + mod) * Math.exp(-t * 1.4) * Math.min(1, t / 0.002);
  }
  return out;
}

// ---------- 鼓組 ----------
function kick(punch = 1) {
  const out = new Float32Array(Math.floor(0.45 * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += (48 + 110 * punch * Math.exp(-t * 32)) / SR;
    out[i] = Math.tanh(1.6 * Math.sin(TAU * ph) * Math.exp(-t * 7)) + (t < 0.002 ? noise() * 0.3 : 0);
  }
  return out;
}

function snare(tone = 190) {
  const out = new Float32Array(Math.floor(0.3 * SR));
  for (let i = 0; i < out.length; i++) out[i] = noise() * Math.exp((-i / SR) * 17) * 0.7;
  biquad(out, 'hp', 1200);
  for (let i = 0; i < out.length; i++) out[i] += Math.sin((TAU * tone * i) / SR) * Math.exp((-i / SR) * 22) * 0.6;
  return out;
}

function hat(open = false) {
  const out = new Float32Array(Math.floor((open ? 0.35 : 0.08) * SR));
  for (let i = 0; i < out.length; i++) out[i] = noise() * Math.exp((-i / SR) * (open ? 11 : 60));
  return biquad(biquad(out, 'hp', 7000), 'hp', 7000);
}

function clap() {
  const out = new Float32Array(Math.floor(0.3 * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const burst = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) * (o === 0.022 ? 18 : 140)) : 0), 0);
    out[i] = noise() * burst * 0.5;
  }
  return biquad(out, 'bp', 1400, 0.8);
}

function shaker() {
  const out = new Float32Array(Math.floor(0.07 * SR));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = noise() * Math.min(1, t / 0.012) * Math.exp(-t * 45);
  }
  return biquad(out, 'hp', 5000);
}

function chipKick() {
  const out = new Float32Array(Math.floor(0.12 * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph = (ph + (55 + 220 * Math.exp(-t * 45)) / SR) % 1;
    out[i] = (ph < 0.5 ? 1 : -1) * Math.exp(-t * 22);
  }
  return out;
}

function chipNoise(len = 0.05) {
  const out = new Float32Array(Math.floor(len * SR));
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    if (i % 6 === 0) held = noise();
    out[i] = held * Math.exp((-i / SR) * 50);
  }
  return out;
}

// ---------- 混音器 ----------
class Mixer {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    for (const k of ['mL', 'mR', 'dL', 'dR', 'sL', 'sR']) this[k] = new Float32Array(this.n);
    this.duck = null;
  }
  add(buf, time, { gain = 1, pan = 0, send = 0.15, bus = 'm' } = {}) {
    const start = Math.floor(time * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    const L = this[bus + 'L'];
    const R = this[bus + 'R'];
    for (let i = 0; i < buf.length; i++) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= this.n) break;
      L[j] += buf[i] * gl;
      R[j] += buf[i] * gr;
      if (send) {
        this.sL[j] += buf[i] * gl * send;
        this.sR[j] += buf[i] * gr * send;
      }
    }
  }
  render({ wet = 0.3, lowpass = 0, fadeOut = 3 } = {}) {
    const revL = reverb(this.sL, 0);
    const revR = reverb(this.sR, 23);
    const L = new Float32Array(this.n);
    const R = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const d = this.duck ? this.duck(i / SR) : 1;
      L[i] = this.mL[i] * d + this.dL[i] + revL[i] * wet;
      R[i] = this.mR[i] * d + this.dR[i] + revR[i] * wet;
    }
    if (lowpass) {
      biquad(L, 'lp', lowpass);
      biquad(R, 'lp', lowpass);
    }
    return master(L, R, fadeOut);
  }
}

function reverb(input, spread) {
  const out = new Float32Array(input.length);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((n) => ({ buf: new Float32Array(n + spread), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n + spread), i: 0 }));
  for (let s = 0; s < input.length; s++) {
    const x = input[s] * 0.02;
    let y = 0;
    for (const c of combs) {
      const v = c.buf[c.i];
      c.lp = v * 0.75 + c.lp * 0.25;
      c.buf[c.i] = x + c.lp * 0.86;
      c.i = (c.i + 1) % c.buf.length;
      y += v;
    }
    for (const a of aps) {
      const v = a.buf[a.i];
      a.buf[a.i] = y + v * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = v - y;
    }
    out[s] = y;
  }
  return out;
}

function master(L, R, fadeOut) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    L[i] = Math.tanh(L[i] * 0.9);
    R[i] = Math.tanh(R[i] * 0.9);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / (peak || 1);
  const fadeIn = Math.floor(0.02 * SR);
  const fo = Math.floor(fadeOut * SR);
  for (let i = 0; i < L.length; i++) {
    let e = g;
    if (i < fadeIn) e *= i / fadeIn;
    if (i > L.length - fo) e *= Math.max(0, (L.length - i) / fo);
    L[i] *= e;
    R[i] *= e;
  }
  return [L, R];
}

// ---------- 樂理 ----------
const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus2: [0, 2, 7] };
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], majPent: [0, 2, 4, 7, 9], minPent: [0, 3, 5, 7, 10] };

function voicing(root, q, low) {
  return QUAL[q]
    .map((iv) => {
      let n = root + iv;
      while (n < low) n += 12;
      while (n >= low + 12) n -= 12;
      return n;
    })
    .sort((a, b) => a - b);
}

function scaleNotes(key, scale, lo, hi) {
  const out = [];
  for (let n = lo; n <= hi; n++) if (SCALE[scale].includes((((n - key) % 12) + 12) % 12)) out.push(n);
  return out;
}

function song(bpm, swing = 0) {
  const beat = 60 / bpm;
  const bar = beat * 4;
  return {
    beat,
    bar,
    at: (b, pos) => b * bar + (pos + (swing && Math.abs((pos % 1) - 0.5) < 1e-6 ? swing : 0)) * beat,
  };
}

const RHYTHMS = [
  [0, 1, 2, 3],
  [0, 1.5, 2, 3],
  [0, 0.5, 1, 2, 3],
  [0, 1, 1.5, 2.5, 3],
  [0, 2, 2.5, 3],
  [0, 0.75, 1.5, 2, 3],
  [0, 1, 2, 2.5],
];

/** 產生 2 小節動機，之後依和弦調整強拍音高，讓旋律重複又有變化 */
function motif(rng, size, rhythms = RHYTHMS) {
  const notes = [];
  let deg = Math.floor(size / 2);
  for (let bar = 0; bar < 2; bar++) {
    const r = pick(rng, rhythms);
    r.forEach((pos, i) => {
      const next = i + 1 < r.length ? r[i + 1] : 4;
      deg = clamp(deg + pick(rng, [-2, -1, -1, 0, 1, 1, 2, 3, -3]), 0, size - 1);
      if (!(bar === 1 && i === r.length - 1 && rng() < 0.4)) notes.push({ bar, pos, len: next - pos, deg });
    });
  }
  return notes;
}

function realize(m, bar, scale, chord) {
  const pcs = chord.map((n) => n % 12);
  return m
    .filter((n) => n.bar === bar)
    .map((n) => {
      let note = scale[n.deg];
      if (n.pos % 2 === 0) {
        let best = note;
        for (let d = 0; d <= 6; d++) {
          if (pcs.includes((note + d) % 12)) { best = note + d; break; }
          if (pcs.includes((((note - d) % 12) + 12) % 12)) { best = note - d; break; }
        }
        note = best;
      }
      return { ...n, note };
    });
}

// ---------- 曲目 ----------
const tracks = [
  {
    id: 'sunny-morning', title: '陽光早晨', mood: '輕快', bpm: 120,
    desc: '明亮的撥弦琶音與拍手節奏，適合生活 vlog、開箱',
    render() {
      const S = song(120), bars = 32, key = 60, rng = makeRng(11);
      const prog = [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']];
      const M = new Mixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 69, 93);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        const sec = b < 4 ? 'intro' : b < 12 ? 'verse' : b < 20 ? 'chorus' : b < 28 ? 'verse2' : 'outro';
        const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[0] + 12, ch[1]];
        arp.forEach((n, i) => M.add(pluck(mtof(n), S.beat * 0.5), S.at(b, i * 0.5), { gain: 0.3 * (i % 2 ? 0.75 : 1), pan: i % 2 ? 0.35 : -0.35, send: 0.25 }));
        for (let i = 0; i < 8; i++) M.add(shaker(), S.at(b, i * 0.5), { gain: 0.12, pan: 0.5, bus: 'd', send: 0 });
        if (sec !== 'intro' && sec !== 'outro') {
          [0, 2, 2.5].forEach((p) => M.add(kick(), S.at(b, p), { gain: 0.75, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(clap(), S.at(b, p), { gain: 0.5, bus: 'd', send: 0.3 }));
          for (let i = 0; i < 8; i++) M.add(bass(mtof(root - 24 + (i === 6 ? 7 : 0)), S.beat * 0.42), S.at(b, i * 0.5), { gain: 0.42, send: 0 });
        }
        if (sec === 'chorus' || sec === 'verse2') {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) {
            const voice = sec === 'chorus' ? mallet(mtof(n.note), n.len * S.beat) : sineLead(mtof(n.note - 12), n.len * S.beat * 0.9);
            M.add(voice, S.at(b, n.pos), { gain: sec === 'chorus' ? 0.42 : 0.28, pan: 0.1, send: 0.3 });
          }
        }
        if (sec === 'outro') ch.forEach((n) => M.add(pad(mtof(n), S.bar), S.at(b, 0), { gain: 0.12, send: 0.4 }));
      }
      return M.render({ wet: 0.3 });
    },
  },
  {
    id: 'afternoon-coffee', title: '午後咖啡', mood: 'Lo-fi', bpm: 78,
    desc: '慵懶的電鋼琴和弦與黑膠底噪，適合讀書、咖啡廳、日常',
    render() {
      const S = song(78, 0.12), bars = 24, key = 53, rng = makeRng(23);
      const prog = [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7']];
      const M = new Mixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 72, 91);
      const A = motif(rng, scale.length, [[0, 1.5, 3], [0.5, 2, 2.5], [0, 2], [1, 1.5, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        ch.forEach((n, i) => M.add(epiano(mtof(n), S.beat * 2.8), S.at(b, 0) + i * 0.012, { gain: 0.2, pan: -0.2 + i * 0.13, send: 0.25 }));
        ch.slice(1).forEach((n) => M.add(epiano(mtof(n), S.beat * 0.8), S.at(b, 2.5), { gain: 0.11, pan: 0.2, send: 0.25 }));
        if (b >= 2) {
          M.add(bass(mtof(root - 24), S.beat * 1.8, 1.1), S.at(b, 0), { gain: 0.5, send: 0 });
          M.add(bass(mtof(root - 24 + 7), S.beat * 0.9, 1.1), S.at(b, 2.5), { gain: 0.4, send: 0 });
          [0, 2.5].forEach((p) => M.add(kick(0.6), S.at(b, p), { gain: 0.7, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(biquad(snare(170), 'lp', 3500), S.at(b, p), { gain: 0.45, bus: 'd', send: 0.15 }));
          for (let i = 0; i < 8; i++) M.add(hat(), S.at(b, i * 0.5), { gain: i % 2 ? 0.08 : 0.13, pan: 0.3, bus: 'd', send: 0 });
        }
        if (b >= 8 && b < 20) for (const n of realize(A, b % 2, scale, ch)) M.add(epiano(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.24, pan: 0.15, send: 0.35 });
      }
      const crackle = new Float32Array(M.n);
      const r = makeRng(5);
      for (let i = 0; i < M.n; i++) {
        if (r() < 0.0004) crackle[i] = (r() * 2 - 1) * 0.5;
        crackle[i] += (r() * 2 - 1) * 0.006;
      }
      M.add(biquad(crackle, 'bp', 2500, 0.5), 0, { gain: 0.6, bus: 'd', send: 0 });
      return M.render({ wet: 0.25, lowpass: 6500 });
    },
  },
  {
    id: 'warm-memories', title: '溫暖回憶', mood: '溫馨', bpm: 72,
    desc: '溫柔的鋼琴分解和弦與弦樂鋪底，適合家庭、紀念、感動時刻',
    render() {
      const S = song(72), bars = 20, key = 55, rng = makeRng(37);
      const prog = [[5, 'maj'], [0, 'maj'], [7, 'maj'], [9, 'min']];
      const M = new Mixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'major', 67, 88);
      const A = motif(rng, scale.length, [[0, 1, 2, 3], [0, 1.5, 2], [0, 2, 3], [0, 0.5, 1, 2]]);
      const B = motif(rng, scale.length, [[0, 1, 2, 3], [0, 1.5, 2], [0, 2, 3], [0, 0.5, 1, 2]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 55);
        const lh = [root - 12, ch[1] - 12 + 12, ch[2], root, ch[1] + 12, ch[2], root, ch[1]];
        lh.forEach((n, i) => M.add(piano(mtof(n), S.beat * 0.9), S.at(b, i * 0.5), { gain: 0.2 * (i === 0 ? 1.3 : 1), pan: -0.25, send: 0.4 }));
        if (b >= 4 && b < 18) {
          const m = b < 12 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(piano(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.32, pan: 0.2, send: 0.45 });
        }
        if (b >= 8) ch.forEach((n) => M.add(pad(mtof(n), S.bar, { cut: 1100, attack: 1 }), S.at(b, 0), { gain: 0.1, send: 0.5 }));
      }
      return M.render({ wet: 0.45, fadeOut: 4 });
    },
  },
  {
    id: 'city-rhythm', title: '城市節奏', mood: '動感', bpm: 124,
    desc: '四拍底鼓的 House 節奏，適合穿搭、運動、快節奏剪輯',
    render() {
      const S = song(124), bars = 36, key = 57, rng = makeRng(41);
      const prog = [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']];
      const M = new Mixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minPent', 69, 88);
      const A = motif(rng, scale.length, [[0, 0.75, 1.5, 2.5, 3], [0, 0.5, 1.5, 2, 3], [0.5, 1, 2, 3.5]]);
      const kicking = (b) => b >= 4 && !(b >= 16 && b < 20) && b < 34;
      M.duck = (t) => (kicking(Math.floor(t / S.bar)) ? 1 - 0.55 * Math.exp(-(t % S.beat) / 0.09) : 1);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        [0.5, 1.75, 3].forEach((p) => ch.forEach((n) => M.add(pad(mtof(n), S.beat * 0.35, { cut: 2600, attack: 0.005 }), S.at(b, p), { gain: 0.16, send: 0.35 })));
        for (let i = 0; i < 4; i++) M.add(hat(true), S.at(b, i + 0.5), { gain: 0.16, pan: 0.25, bus: 'd', send: 0.05 });
        if (kicking(b)) {
          for (let i = 0; i < 4; i++) M.add(kick(1.2), S.at(b, i), { gain: 0.85, bus: 'd', send: 0 });
          [1, 3].forEach((p) => M.add(clap(), S.at(b, p), { gain: 0.45, bus: 'd', send: 0.2 }));
          for (let i = 0; i < 4; i++) M.add(sawBass(mtof(root - 24), S.beat * 0.4), S.at(b, i + 0.5), { gain: 0.42, send: 0 });
        }
        if ((b >= 8 && b < 16) || (b >= 20 && b < 32)) {
          for (const n of realize(A, b % 2, scale, ch)) M.add(pluck(mtof(n.note), n.len * S.beat * 0.8, { bright: 0.8 }), S.at(b, n.pos), { gain: 0.38, pan: -0.1, send: 0.35 });
        }
        if (b >= 16 && b < 20) {
          const rise = new Float32Array(Math.floor(S.bar * SR));
          for (let i = 0; i < rise.length; i++) rise[i] = noise() * ((b - 16) * S.bar + i / SR) / (4 * S.bar);
          M.add(biquad(rise, 'hp', 2000 + (b - 16) * 1500), S.at(b, 0), { gain: 0.12, send: 0.3, bus: 'd' });
        }
      }
      return M.render({ wet: 0.22 });
    },
  },
  {
    id: 'road-trip', title: '旅行出發', mood: '輕快', bpm: 108,
    desc: '烏克麗麗刷弦和口哨旋律，適合旅遊、戶外、美食探店',
    render() {
      const S = song(108), bars = 32, key = 55, rng = makeRng(53);
      const prog = [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'maj']];
      const M = new Mixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 74, 96);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      const strum = [[0, 1], [1, 1], [1.5, -1], [2.5, -1], [3, 1], [3.5, -1]];
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 64);
        const notes = [ch[0], ch[1], ch[2], ch[0] + 12];
        for (const [p, dir] of strum) {
          (dir > 0 ? notes : [...notes].reverse()).forEach((n, i) =>
            M.add(pluck(mtof(n), S.beat * 0.6, { decay: 0.993, bright: 0.5 }), S.at(b, p) + i * 0.011, { gain: dir > 0 ? 0.16 : 0.1, pan: 0.2, send: 0.2 }),
          );
        }
        if (b >= 4 && b < 30) {
          [0, 2].forEach((p) => M.add(kick(0.8), S.at(b, p), { gain: 0.6, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(clap(), S.at(b, p), { gain: 0.38, bus: 'd', send: 0.25 }));
          [0, 1.5, 2, 3.5].forEach((p, i) => M.add(bass(mtof(root - 24 + (i === 3 ? 7 : 0)), S.beat * 0.45), S.at(b, p), { gain: 0.45, send: 0 }));
          for (let i = 0; i < 8; i++) M.add(shaker(), S.at(b, i * 0.5), { gain: 0.1, pan: -0.4, bus: 'd', send: 0 });
        }
        if ((b >= 12 && b < 20) || (b >= 24 && b < 30)) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(sineLead(mtof(n.note), n.len * S.beat * 0.85, 0.02), S.at(b, n.pos), { gain: 0.26, pan: -0.15, send: 0.35 });
        }
      }
      return M.render({ wet: 0.28 });
    },
  },
  {
    id: 'neon-night', title: '夜晚霓虹', mood: '電子', bpm: 96,
    desc: '復古合成器琶音與大鼓，適合夜景、城市、科技感畫面',
    render() {
      const S = song(96), bars = 28, key = 52, rng = makeRng(67);
      const prog = [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']];
      const M = new Mixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'minor', 71, 88);
      const A = motif(rng, scale.length, [[0, 1.5, 2], [0, 1, 2, 3], [0, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 64);
        const arp = [ch[0], ch[1], ch[2], ch[1] + 12];
        for (let i = 0; i < 16; i++) M.add(pad(mtof(arp[i % 4] + (i >= 8 ? 12 : 0)), S.beat * 0.2, { cut: 2200 + 800 * Math.sin(b / 3), attack: 0.003 }), S.at(b, i * 0.25), { gain: 0.15, pan: i % 2 ? 0.4 : -0.4, send: 0.3 });
        ch.forEach((n) => M.add(pad(mtof(n - 12), S.bar, { cut: 900, attack: 0.8 }), S.at(b, 0), { gain: 0.12, send: 0.4 }));
        if (b >= 4 && b < 26) {
          for (let i = 0; i < 8; i++) M.add(bass(mtof(root - 24 + (i % 2 ? 12 : 0)), S.beat * 0.4, 2.2), S.at(b, i * 0.5), { gain: 0.36, send: 0 });
          [0, 2].forEach((p) => M.add(kick(1.1), S.at(b, p), { gain: 0.8, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(snare(200), S.at(b, p), { gain: 0.55, bus: 'd', send: 0.8 }));
          for (let i = 0; i < 8; i++) M.add(hat(), S.at(b, i * 0.5), { gain: 0.09, pan: 0.3, bus: 'd', send: 0 });
        }
        if (b >= 12 && b < 26) for (const n of realize(A, b % 2, scale, ch)) M.add(pulse(mtof(n.note), n.len * S.beat * 0.9, { duty: 0.5, vib: 0.008, cut: 3000 }), S.at(b, n.pos), { gain: 0.22, send: 0.45 });
      }
      return M.render({ wet: 0.35, fadeOut: 4 });
    },
  },
  {
    id: 'cute-daily', title: '可愛日常', mood: '可愛', bpm: 132,
    desc: '8-bit 電玩風旋律，適合寵物、搞笑、可愛小日常',
    render() {
      const S = song(132), bars = 36, key = 60, rng = makeRng(71);
      const prog = [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']];
      const M = new Mixer(bars * S.bar + 2);
      const scale = scaleNotes(key, 'major', 72, 91);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        for (let i = 0; i < 8; i++) M.add(pulse(mtof(root - 24 + (i % 2 ? 12 : 0)), S.beat * 0.4, { duty: 0.5, cut: 1500 }), S.at(b, i * 0.5), { gain: 0.3, send: 0 });
        if (b >= 2) for (let i = 0; i < 16; i++) M.add(pulse(mtof(ch[i % 3] + 12), S.beat * 0.2, { duty: 0.125 }), S.at(b, i * 0.25), { gain: 0.06, pan: 0.35, send: 0.1 });
        if (b >= 4 && b < 34) {
          [0, 1.5, 2].forEach((p) => M.add(chipKick(), S.at(b, p), { gain: 0.5, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(chipNoise(0.12), S.at(b, p), { gain: 0.3, bus: 'd', send: 0.1 }));
          for (let i = 0; i < 8; i++) M.add(chipNoise(0.03), S.at(b, i * 0.5), { gain: 0.1, pan: -0.3, bus: 'd', send: 0 });
        }
        if (b >= 4 && b < 34) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(pulse(mtof(n.note), n.len * S.beat * 0.8, { duty: 0.25, vib: 0.01 }), S.at(b, n.pos), { gain: 0.2, send: 0.15 });
        }
      }
      return M.render({ wet: 0.15, fadeOut: 2 });
    },
  },
  {
    id: 'quiet-thoughts', title: '靜謐思考', mood: '氛圍', bpm: 64,
    desc: '空靈的鋪底與鐘聲，音量平穩不搶話，適合口播、教學、旁白',
    render() {
      const S = song(64), bars = 16, key = 50, rng = makeRng(83);
      const prog = [[0, 'maj7'], [9, 'min7'], [5, 'maj7'], [7, 'sus2']];
      const M = new Mixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'majPent', 74, 93);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 57);
        ch.forEach((n, i) => M.add(pad(mtof(n), S.bar * 1.05, { cut: 1300, attack: 1.4 }), S.at(b, 0), { gain: 0.15, pan: -0.3 + i * 0.2, send: 0.6 }));
        M.add(bass(mtof(root - 12), S.bar, 0.8), S.at(b, 0), { gain: 0.22, send: 0.1 });
        for (let i = 0; i < 4; i++) if (rng() < 0.55) M.add(bell(mtof(pick(rng, scale))), S.at(b, i + (rng() < 0.3 ? 0.5 : 0)), { gain: 0.1, pan: rng() * 1.2 - 0.6, send: 0.7 });
      }
      return M.render({ wet: 0.55, fadeOut: 5 });
    },
  },
];

// ---------- 音效 ----------
function sfx(seconds, fn) {
  const M = new Mixer(seconds);
  fn(M);
  return M.render({ wet: 0.2, fadeOut: 0.05 });
}

const effects = [
  { id: 'sfx-ding', title: '叮', mood: '提示', desc: '清脆的提示鈴聲', render: () => sfx(2.2, (M) => { M.add(bell(1318), 0, { gain: 0.5, send: 0.3 }); M.add(bell(2637), 0.01, { gain: 0.15, send: 0.3 }); }) },
  {
    id: 'sfx-whoosh', title: '咻', mood: '轉場', desc: '快速轉場的風聲',
    render: () => sfx(1, (M) => {
      const len = Math.floor(0.7 * SR);
      const L = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        L[i] = noise() * Math.sin(Math.PI * t) ** 2;
      }
      const segs = 14;
      const out = new Float32Array(len);
      for (let s = 0; s < segs; s++) {
        const a = Math.floor((s / segs) * len), z = Math.floor(((s + 1) / segs) * len);
        const part = biquad(L.slice(a, z + 200), 'bp', 400 + 2600 * Math.sin((Math.PI * s) / segs), 1.2);
        for (let i = 0; i < z - a; i++) out[a + i] += part[i];
      }
      M.add(out, 0, { gain: 1.2, pan: -0.4, send: 0.2 });
      M.add(out, 0.02, { gain: 1.2, pan: 0.4, send: 0.2 });
    }),
  },
  {
    id: 'sfx-pop', title: '啵', mood: '可愛', desc: '泡泡彈出的聲音，適合文字、貼圖出現',
    render: () => sfx(0.4, (M) => {
      const out = new Float32Array(Math.floor(0.12 * SR));
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        ph += (300 + 900 * Math.exp(-t * 40)) / SR;
        out[i] = Math.sin(TAU * ph) * Math.exp(-t * 35);
      }
      M.add(out, 0, { gain: 0.8, send: 0.1 });
    }),
  },
  {
    id: 'sfx-shutter', title: '喀嚓', mood: '拍照', desc: '相機快門聲',
    render: () => sfx(0.5, (M) => {
      for (const [t, g] of [[0, 1], [0.085, 0.7]]) {
        const c = new Float32Array(Math.floor(0.05 * SR));
        for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 90);
        M.add(biquad(c, 'bp', 3000, 1.5), t, { gain: g, send: 0.05 });
      }
    }),
  },
  {
    id: 'sfx-tada', title: '登登登登', mood: '完成', desc: '揭曉、完成時的歡呼音效',
    render: () => sfx(2.4, (M) => {
      [60, 64, 67].forEach((n, i) => M.add(pad(mtof(n + 12), 0.1, { cut: 3500, attack: 0.005 }), i * 0.1, { gain: 0.4, send: 0.3 }));
      [60, 64, 67, 72].forEach((n) => M.add(pad(mtof(n + 12), 1.1, { cut: 3500, attack: 0.01 }), 0.32, { gain: 0.3, send: 0.4 }));
      M.add(snare(), 0.32, { gain: 0.5, bus: 'd', send: 0.5 });
      M.add(hat(true), 0.32, { gain: 0.4, bus: 'd', send: 0.3 });
    }),
  },
  {
    id: 'sfx-boing', title: '啵嚶', mood: '搞笑', desc: '彈簧般的搞笑音效',
    render: () => sfx(0.9, (M) => {
      const out = new Float32Array(Math.floor(0.7 * SR));
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        ph += (180 + 120 * t + 60 * Math.sin(TAU * 13 * t) * Math.exp(-t * 3)) / SR;
        out[i] = Math.sin(TAU * ph) * Math.exp(-t * 4.5) * Math.min(1, t / 0.005);
      }
      M.add(out, 0, { gain: 0.8, send: 0.1 });
    }),
  },
  {
    id: 'sfx-typing', title: '打字聲', mood: '文字', desc: '鍵盤打字聲，適合文字逐字出現',
    render: () => sfx(1.8, (M) => {
      const r = makeRng(7);
      let t = 0;
      while (t < 1.6) {
        const c = new Float32Array(Math.floor(0.03 * SR));
        for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 160);
        M.add(biquad(c, 'bp', 2200 + r() * 1800, 2), t, { gain: 0.6 + r() * 0.3, pan: r() - 0.5, send: 0.05 });
        t += 0.07 + r() * 0.1;
      }
    }),
  },
  {
    id: 'sfx-riser', title: '上升轉場', mood: '轉場', desc: '漸強的掃頻，接在重點畫面之前',
    render: () => sfx(2.6, (M) => {
      const len = Math.floor(2.2 * SR);
      const out = new Float32Array(len);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ph = (ph + (150 * Math.pow(12, t)) / SR) % 1;
        out[i] = (0.6 * (2 * ph - 1) + noise() * 0.5) * t * t;
      }
      M.add(biquad(out, 'hp', 300), 0, { gain: 0.5, send: 0.4 });
    }),
  },
];

// ---------- 輸出 ----------
function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

function peaks(L, R, count = 48) {
  const size = Math.floor(L.length / count);
  const out = [];
  for (let p = 0; p < count; p++) {
    let m = 0;
    for (let i = p * size; i < (p + 1) * size; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
    out.push(Math.round(m * 100) / 100);
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const library = [];
for (const [category, list] of [['music', tracks], ['sfx', effects]]) {
  for (const item of list) {
    const t0 = Date.now();
    const [L, R] = item.render();
    const wav = path.join(OUT, `${item.id}.wav`);
    const m4a = path.join(OUT, `${item.id}.m4a`);
    writeWav(wav, L, R);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '160000', wav, m4a]);
    fs.rmSync(wav);
    library.push({
      id: item.id,
      title: item.title,
      category,
      mood: item.mood,
      bpm: item.bpm ?? null,
      desc: item.desc,
      duration: Math.round((L.length / SR) * 100) / 100,
      url: `/music/${item.id}.m4a`,
      peaks: peaks(L, R),
    });
    console.log(`✓ ${item.title}（${(L.length / SR).toFixed(1)} 秒，${Date.now() - t0} ms）`);
  }
}
fs.writeFileSync(path.join(OUT, 'library.json'), JSON.stringify({ license: '本站原創合成音樂，可免費用於個人與商業影片，無需標註來源。', items: library }, null, 2));
console.log(`完成，共 ${library.length} 首，輸出到 ${OUT}`);
