// 產生音樂庫：用程式合成原創配樂與音效（無版權問題），輸出 AAC 到 server/music/
// 用法：node scripts/generate-music.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'server', 'music');
const SR = 44100;
const TAU = Math.PI * 2;

// 配樂改用開源 fluidsynth + MIT 授權的 MuseScore_General soundfont（真樂器取樣音色），
// 音效（sfx）維持原本的程式合成。soundfont 不進版控，第一次執行會自動下載。
const SOUNDFONT_URL = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3';
const SOUNDFONT = path.join(ROOT, 'scripts', '.cache', 'MuseScore_General.sf3');

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

// ---------- 配樂用 MIDI 樂器（真實樂器取樣音色，透過 fluidsynth 渲染） ----------
// 原本的手刻波形樂器函式（pluck/piano/bass…）只給音效（sfx）用；配樂改成產生「音符描述」，
// 交給 MusicMixer 收集成 MIDI 事件，最後一次用 fluidsynth + soundfont 渲染成音訊。
const ftom = (f) => 69 + 12 * Math.log2(f / 440);
const noteDesc = (program, f, dur) => ({ __midi: true, isDrum: false, program, note: Math.round(ftom(f)), dur: Math.max(0.05, dur) });
const drumDesc = (drumNote, dur) => ({ __midi: true, isDrum: true, program: 0, note: drumNote, dur });

// General MIDI 樂器編號：https://www.midi.org/specifications-old/item/gm-level-1-sound-set
const mPiano = (f, dur) => noteDesc(0, f, dur); // Acoustic Grand Piano
const mEpiano = (f, dur) => noteDesc(4, f, dur); // Electric Piano 1
const mPluck = (f, dur) => noteDesc(24, f, dur); // Acoustic Guitar (nylon)
const mMallet = (f, dur) => noteDesc(12, f, dur); // Marimba
const mBell = (f, dur = 1.2) => noteDesc(14, f, dur); // Tubular Bells
const mPad = (f, dur) => noteDesc(48, f, dur); // String Ensemble 1（比合成器 pad 更像真樂器）
const mBass = (f, dur) => noteDesc(32, f, dur); // Acoustic Bass
const mSawBass = (f, dur) => noteDesc(38, f, dur); // Synth Bass 1（電子曲風保留合成器音色）
const mPulse = (f, dur) => noteDesc(81, f, dur); // Lead 2 (sawtooth)
const mSineLead = (f, dur) => noteDesc(73, f, dur); // Flute
const mKick = () => drumDesc(36, 0.3);
const mSnare = () => drumDesc(38, 0.22);
const mHat = (open = false) => drumDesc(open ? 46 : 42, open ? 0.3 : 0.12);
const mClap = () => drumDesc(39, 0.2);
const mShaker = () => drumDesc(70, 0.12);
const mChipKick = () => drumDesc(36, 0.15);
const mChipNoise = () => drumDesc(42, 0.1);

// ---------- MIDI 檔案寫出（Standard MIDI File，type 1） ----------
const MIDI_PPQ = 480;
const MIDI_TICKS_PER_SEC = MIDI_PPQ * 2; // 固定用 120bpm 當參考時間軸，事件時間已經是秒數換算

function vlq(n) {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return Buffer.from(bytes);
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b; };
const mtrk = (data) => Buffer.concat([Buffer.from('MTrk'), u32(data.length), data]);

function buildTempoTrack() {
  const data = Buffer.concat([
    vlq(0), Buffer.from([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]), // tempo 500000us = 120bpm
    vlq(0), Buffer.from([0xff, 0x2f, 0x00]),
  ]);
  return mtrk(data);
}

function buildChannelTrack(channel, program, events, { wet = 0.3, isDrum = false } = {}) {
  const toTicks = (s) => Math.max(0, Math.round(s * MIDI_TICKS_PER_SEC));
  let avgPan = 0;
  for (const e of events) avgPan += e.pan ?? 0;
  avgPan = events.length ? avgPan / events.length : 0;
  const panCC = Math.max(0, Math.min(127, Math.round(((avgPan + 1) / 2) * 127)));
  const reverbCC = Math.max(0, Math.min(127, Math.round(wet * 200)));

  const msgs = [];
  if (!isDrum) msgs.push({ tick: 0, bytes: [0xc0 | channel, program] });
  msgs.push({ tick: 0, bytes: [0xb0 | channel, 10, panCC] });
  msgs.push({ tick: 0, bytes: [0xb0 | channel, 91, reverbCC] });

  for (const e of events) {
    const vel = Math.max(10, Math.min(127, Math.round(e.gain * 300)));
    const onTick = toTicks(e.time);
    const offTick = Math.max(onTick + 1, toTicks(e.time + e.dur));
    msgs.push({ tick: onTick, bytes: [0x90 | channel, e.note, vel] });
    msgs.push({ tick: offTick, bytes: [0x80 | channel, e.note, 0] });
  }
  msgs.sort((a, b) => a.tick - b.tick);

  const parts = [];
  let last = 0;
  for (const m of msgs) {
    parts.push(vlq(m.tick - last));
    parts.push(Buffer.from(m.bytes));
    last = m.tick;
  }
  parts.push(vlq(0), Buffer.from([0xff, 0x2f, 0x00]));
  return mtrk(Buffer.concat(parts));
}

function buildSMF(channelGroups, { wet }) {
  const tracks = [buildTempoTrack()];
  for (const g of channelGroups) tracks.push(buildChannelTrack(g.channel, g.program, g.events, { wet, isDrum: g.isDrum }));
  const header = Buffer.concat([Buffer.from('MThd'), u32(6), u16(1), u16(tracks.length), u16(MIDI_PPQ)]);
  return Buffer.concat([header, ...tracks]);
}

function readWavPCM16(file) {
  const buf = fs.readFileSync(file);
  let offset = 12; // 跳過 RIFF header
  let dataOffset = -1, dataLen = 0, channels = 2;
  while (offset < buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const len = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') channels = buf.readUInt16LE(offset + 10);
    if (id === 'data') { dataOffset = offset + 8; dataLen = len; }
    offset += 8 + len + (len % 2);
  }
  const n = Math.floor(dataLen / 2 / channels);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = buf.readInt16LE(dataOffset + i * channels * 2) / 32768;
    R[i] = buf.readInt16LE(dataOffset + i * channels * 2 + (channels > 1 ? 2 : 0)) / 32768;
  }
  return { L, R };
}

function ensureSoundfont() {
  if (fs.existsSync(SOUNDFONT)) return;
  console.log('下載開源 soundfont（MuseScore_General.sf3，MIT 授權，約 38MB）...');
  fs.mkdirSync(path.dirname(SOUNDFONT), { recursive: true });
  execFileSync('curl', ['-L', '-o', SOUNDFONT, SOUNDFONT_URL], { stdio: 'inherit' });
}

/** 把收集到的 MIDI 事件渲染成 PCM：寫 .mid → fluidsynth 渲染 → 讀回 WAV */
function renderMidiEvents(events, { wet = 0.3 } = {}) {
  ensureSoundfont();
  const progGroups = new Map();
  const drumEvents = [];
  for (const e of events) {
    if (e.isDrum) drumEvents.push(e);
    else {
      if (!progGroups.has(e.program)) progGroups.set(e.program, []);
      progGroups.get(e.program).push(e);
    }
  }
  const groups = [];
  let ch = 0;
  for (const [program, evs] of progGroups) {
    if (ch === 9) ch++;
    groups.push({ channel: ch, program, events: evs, isDrum: false });
    ch++;
  }
  if (drumEvents.length) groups.push({ channel: 9, program: 0, events: drumEvents, isDrum: true });
  if (!groups.length) return { L: new Float32Array(0), R: new Float32Array(0) };

  const midi = buildSMF(groups, { wet });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pianke-midi-'));
  const midPath = path.join(tmpDir, 'song.mid');
  const wavPath = path.join(tmpDir, 'song.wav');
  fs.writeFileSync(midPath, midi);
  execFileSync('fluidsynth', ['-ni', '-F', wavPath, '-r', String(SR), '-g', '1.1', '-R', '1', SOUNDFONT, midPath], { stdio: 'ignore' });
  const pcm = readWavPCM16(wavPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return pcm;
}

/** 配樂用混音器：收集 MIDI 音符事件，也相容少數直接疊加原始波形的質地層（雨聲、雜訊等） */
class MusicMixer {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.events = [];
    this.duck = null; // MIDI 渲染不支援 sidechain，忽略
  }
  add(desc, time, { gain = 1, pan = 0, send = 0.15 } = {}) {
    this.events.push({ time, dur: desc.dur, note: desc.note, program: desc.program, isDrum: desc.isDrum, gain, pan, send });
  }
  render({ wet = 0.3, lowpass = 0, fadeOut = 3 } = {}) {
    const { L: midiL, R: midiR } = this.events.length ? renderMidiEvents(this.events, { wet }) : { L: new Float32Array(0), R: new Float32Array(0) };
    const L = new Float32Array(this.n);
    const R = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      L[i] = midiL[i] || 0;
      R[i] = midiR[i] || 0;
    }
    if (lowpass) {
      biquad(L, 'lp', lowpass);
      biquad(R, 'lp', lowpass);
    }
    return master(L, R, fadeOut);
  }
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
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 69, 93);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        const sec = b < 4 ? 'intro' : b < 12 ? 'verse' : b < 20 ? 'chorus' : b < 28 ? 'verse2' : 'outro';
        const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[0] + 12, ch[1]];
        arp.forEach((n, i) => M.add(mPluck(mtof(n), S.beat * 0.5), S.at(b, i * 0.5), { gain: 0.3 * (i % 2 ? 0.75 : 1), pan: i % 2 ? 0.35 : -0.35, send: 0.25 }));
        for (let i = 0; i < 8; i++) M.add(mShaker(), S.at(b, i * 0.5), { gain: 0.12, pan: 0.5, bus: 'd', send: 0 });
        if (sec !== 'intro' && sec !== 'outro') {
          [0, 2, 2.5].forEach((p) => M.add(mKick(), S.at(b, p), { gain: 0.75, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.5, bus: 'd', send: 0.3 }));
          for (let i = 0; i < 8; i++) M.add(mBass(mtof(root - 24 + (i === 6 ? 7 : 0)), S.beat * 0.42), S.at(b, i * 0.5), { gain: 0.42, send: 0 });
        }
        if (sec === 'chorus' || sec === 'verse2') {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) {
            const voice = sec === 'chorus' ? mMallet(mtof(n.note), n.len * S.beat) : mSineLead(mtof(n.note - 12), n.len * S.beat * 0.9);
            M.add(voice, S.at(b, n.pos), { gain: sec === 'chorus' ? 0.42 : 0.28, pan: 0.1, send: 0.3 });
          }
        }
        if (sec === 'outro') ch.forEach((n) => M.add(mPad(mtof(n), S.bar), S.at(b, 0), { gain: 0.12, send: 0.4 }));
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
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 72, 91);
      const A = motif(rng, scale.length, [[0, 1.5, 3], [0.5, 2, 2.5], [0, 2], [1, 1.5, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 2.8), S.at(b, 0) + i * 0.012, { gain: 0.2, pan: -0.2 + i * 0.13, send: 0.25 }));
        ch.slice(1).forEach((n) => M.add(mEpiano(mtof(n), S.beat * 0.8), S.at(b, 2.5), { gain: 0.11, pan: 0.2, send: 0.25 }));
        if (b >= 2) {
          M.add(mBass(mtof(root - 24), S.beat * 1.8, 1.1), S.at(b, 0), { gain: 0.5, send: 0 });
          M.add(mBass(mtof(root - 24 + 7), S.beat * 0.9, 1.1), S.at(b, 2.5), { gain: 0.4, send: 0 });
          [0, 2.5].forEach((p) => M.add(mKick(0.6), S.at(b, p), { gain: 0.7, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mSnare(170), S.at(b, p), { gain: 0.45, bus: 'd', send: 0.15 }));
          for (let i = 0; i < 8; i++) M.add(mHat(), S.at(b, i * 0.5), { gain: i % 2 ? 0.08 : 0.13, pan: 0.3, bus: 'd', send: 0 });
        }
        if (b >= 8 && b < 20) for (const n of realize(A, b % 2, scale, ch)) M.add(mEpiano(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.24, pan: 0.15, send: 0.35 });
      }
      return M.render({ wet: 0.25, lowpass: 6500 });
    },
  },
  {
    id: 'warm-memories', title: '溫暖回憶', mood: '溫馨', bpm: 72,
    desc: '溫柔的鋼琴分解和弦與弦樂鋪底，適合家庭、紀念、感動時刻',
    render() {
      const S = song(72), bars = 20, key = 55, rng = makeRng(37);
      const prog = [[5, 'maj'], [0, 'maj'], [7, 'maj'], [9, 'min']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'major', 67, 88);
      const A = motif(rng, scale.length, [[0, 1, 2, 3], [0, 1.5, 2], [0, 2, 3], [0, 0.5, 1, 2]]);
      const B = motif(rng, scale.length, [[0, 1, 2, 3], [0, 1.5, 2], [0, 2, 3], [0, 0.5, 1, 2]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 55);
        const lh = [root - 12, ch[1] - 12 + 12, ch[2], root, ch[1] + 12, ch[2], root, ch[1]];
        lh.forEach((n, i) => M.add(mPiano(mtof(n), S.beat * 0.9), S.at(b, i * 0.5), { gain: 0.2 * (i === 0 ? 1.3 : 1), pan: -0.25, send: 0.4 }));
        if (b >= 4 && b < 18) {
          const m = b < 12 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(mPiano(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.32, pan: 0.2, send: 0.45 });
        }
        if (b >= 8) ch.forEach((n) => M.add(mPad(mtof(n), S.bar, { cut: 1100, attack: 1 }), S.at(b, 0), { gain: 0.1, send: 0.5 }));
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
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minPent', 69, 88);
      const A = motif(rng, scale.length, [[0, 0.75, 1.5, 2.5, 3], [0, 0.5, 1.5, 2, 3], [0.5, 1, 2, 3.5]]);
      const kicking = (b) => b >= 4 && !(b >= 16 && b < 20) && b < 34;
      M.duck = (t) => (kicking(Math.floor(t / S.bar)) ? 1 - 0.55 * Math.exp(-(t % S.beat) / 0.09) : 1);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        [0.5, 1.75, 3].forEach((p) => ch.forEach((n) => M.add(mPad(mtof(n), S.beat * 0.35, { cut: 2600, attack: 0.005 }), S.at(b, p), { gain: 0.16, send: 0.35 })));
        for (let i = 0; i < 4; i++) M.add(mHat(true), S.at(b, i + 0.5), { gain: 0.16, pan: 0.25, bus: 'd', send: 0.05 });
        if (kicking(b)) {
          for (let i = 0; i < 4; i++) M.add(mKick(1.2), S.at(b, i), { gain: 0.85, bus: 'd', send: 0 });
          [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.45, bus: 'd', send: 0.2 }));
          for (let i = 0; i < 4; i++) M.add(mSawBass(mtof(root - 24), S.beat * 0.4), S.at(b, i + 0.5), { gain: 0.42, send: 0 });
        }
        if ((b >= 8 && b < 16) || (b >= 20 && b < 32)) {
          for (const n of realize(A, b % 2, scale, ch)) M.add(mPluck(mtof(n.note), n.len * S.beat * 0.8, { bright: 0.8 }), S.at(b, n.pos), { gain: 0.38, pan: -0.1, send: 0.35 });
        }
        if (b >= 16 && b < 20) {
          const steps = 6;
          for (let i = 0; i < steps; i++) M.add(mPulse(mtof(key + 60 + i * 2), S.bar / steps, { duty: 0.3 }), S.at(b, 0) + (i * S.bar) / steps, { gain: 0.1 + i * 0.02, send: 0.3 });
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
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 74, 96);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      const strum = [[0, 1], [1, 1], [1.5, -1], [2.5, -1], [3, 1], [3.5, -1]];
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 64);
        const notes = [ch[0], ch[1], ch[2], ch[0] + 12];
        for (const [p, dir] of strum) {
          (dir > 0 ? notes : [...notes].reverse()).forEach((n, i) =>
            M.add(mPluck(mtof(n), S.beat * 0.6, { decay: 0.993, bright: 0.5 }), S.at(b, p) + i * 0.011, { gain: dir > 0 ? 0.16 : 0.1, pan: 0.2, send: 0.2 }),
          );
        }
        if (b >= 4 && b < 30) {
          [0, 2].forEach((p) => M.add(mKick(0.8), S.at(b, p), { gain: 0.6, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.38, bus: 'd', send: 0.25 }));
          [0, 1.5, 2, 3.5].forEach((p, i) => M.add(mBass(mtof(root - 24 + (i === 3 ? 7 : 0)), S.beat * 0.45), S.at(b, p), { gain: 0.45, send: 0 }));
          for (let i = 0; i < 8; i++) M.add(mShaker(), S.at(b, i * 0.5), { gain: 0.1, pan: -0.4, bus: 'd', send: 0 });
        }
        if ((b >= 12 && b < 20) || (b >= 24 && b < 30)) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(mSineLead(mtof(n.note), n.len * S.beat * 0.85, 0.02), S.at(b, n.pos), { gain: 0.26, pan: -0.15, send: 0.35 });
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
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'minor', 71, 88);
      const A = motif(rng, scale.length, [[0, 1.5, 2], [0, 1, 2, 3], [0, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 64);
        const arp = [ch[0], ch[1], ch[2], ch[1] + 12];
        for (let i = 0; i < 16; i++) M.add(mPad(mtof(arp[i % 4] + (i >= 8 ? 12 : 0)), S.beat * 0.2, { cut: 2200 + 800 * Math.sin(b / 3), attack: 0.003 }), S.at(b, i * 0.25), { gain: 0.15, pan: i % 2 ? 0.4 : -0.4, send: 0.3 });
        ch.forEach((n) => M.add(mPad(mtof(n - 12), S.bar, { cut: 900, attack: 0.8 }), S.at(b, 0), { gain: 0.12, send: 0.4 }));
        if (b >= 4 && b < 26) {
          for (let i = 0; i < 8; i++) M.add(mBass(mtof(root - 24 + (i % 2 ? 12 : 0)), S.beat * 0.4, 2.2), S.at(b, i * 0.5), { gain: 0.36, send: 0 });
          [0, 2].forEach((p) => M.add(mKick(1.1), S.at(b, p), { gain: 0.8, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mSnare(200), S.at(b, p), { gain: 0.55, bus: 'd', send: 0.8 }));
          for (let i = 0; i < 8; i++) M.add(mHat(), S.at(b, i * 0.5), { gain: 0.09, pan: 0.3, bus: 'd', send: 0 });
        }
        if (b >= 12 && b < 26) for (const n of realize(A, b % 2, scale, ch)) M.add(mPulse(mtof(n.note), n.len * S.beat * 0.9, { duty: 0.5, vib: 0.008, cut: 3000 }), S.at(b, n.pos), { gain: 0.22, send: 0.45 });
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
      const M = new MusicMixer(bars * S.bar + 2);
      const scale = scaleNotes(key, 'major', 72, 91);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        for (let i = 0; i < 8; i++) M.add(mPulse(mtof(root - 24 + (i % 2 ? 12 : 0)), S.beat * 0.4, { duty: 0.5, cut: 1500 }), S.at(b, i * 0.5), { gain: 0.3, send: 0 });
        if (b >= 2) for (let i = 0; i < 16; i++) M.add(mPulse(mtof(ch[i % 3] + 12), S.beat * 0.2, { duty: 0.125 }), S.at(b, i * 0.25), { gain: 0.06, pan: 0.35, send: 0.1 });
        if (b >= 4 && b < 34) {
          [0, 1.5, 2].forEach((p) => M.add(mChipKick(), S.at(b, p), { gain: 0.5, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mChipNoise(0.12), S.at(b, p), { gain: 0.3, bus: 'd', send: 0.1 }));
          for (let i = 0; i < 8; i++) M.add(mChipNoise(0.03), S.at(b, i * 0.5), { gain: 0.1, pan: -0.3, bus: 'd', send: 0 });
        }
        if (b >= 4 && b < 34) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(mPulse(mtof(n.note), n.len * S.beat * 0.8, { duty: 0.25, vib: 0.01 }), S.at(b, n.pos), { gain: 0.2, send: 0.15 });
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
      const M = new MusicMixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'majPent', 74, 93);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 57);
        ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar * 1.05, { cut: 1300, attack: 1.4 }), S.at(b, 0), { gain: 0.15, pan: -0.3 + i * 0.2, send: 0.6 }));
        M.add(mBass(mtof(root - 12), S.bar, 0.8), S.at(b, 0), { gain: 0.22, send: 0.1 });
        for (let i = 0; i < 4; i++) if (rng() < 0.55) M.add(mBell(mtof(pick(rng, scale))), S.at(b, i + (rng() < 0.3 ? 0.5 : 0)), { gain: 0.1, pan: rng() * 1.2 - 0.6, send: 0.7 });
      }
      return M.render({ wet: 0.55, fadeOut: 5 });
    },
  },
  {
    id: 'rise-up', title: '奮起向前', mood: '勵志', bpm: 100,
    desc: '鋼琴與弦樂逐漸堆疊的勵志節奏，適合運動、里程碑、勵志故事',
    render() {
      const S = song(100), bars = 28, key = 60, rng = makeRng(131);
      const prog = [[0, 'maj'], [9, 'min'], [7, 'maj'], [5, 'maj']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'major', 67, 91);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 55);
        const lh = [root - 12, ch[1], ch[2], root, ch[1] + 12, ch[2], root, ch[1]];
        lh.forEach((n, i) => M.add(mPiano(mtof(n), S.beat * 0.48), S.at(b, i * 0.5), { gain: 0.22, pan: -0.2, send: 0.3 }));
        if (b >= 6) ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar, { cut: 1500, attack: 0.6 }), S.at(b, 0), { gain: 0.12 + Math.min(0.1, b / 280), pan: -0.2 + i * 0.2, send: 0.4 }));
        if (b >= 12) {
          [0, 1, 2, 3].forEach((p) => M.add(mKick(1 + Math.min(0.3, b / 90)), S.at(b, p), { gain: 0.6, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mSnare(180), S.at(b, p), { gain: 0.4 + Math.min(0.2, b / 140), bus: 'd', send: 0.4 }));
          M.add(mBass(mtof(root - 24), S.bar * 0.95, 1.3), S.at(b, 0), { gain: 0.4, send: 0 });
        }
        if (b >= 12 && b < 28) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(mMallet(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.32 + Math.min(0.15, b / 200), pan: 0.15, send: 0.3 });
        }
      }
      return M.render({ wet: 0.3, fadeOut: 4 });
    },
  },
  {
    id: 'quiet-rain', title: '雨後', mood: '感傷', bpm: 66,
    desc: '簡約鋼琴與細雨般的質感，適合離別、回顧、感傷片段',
    render() {
      const S = song(66), bars = 18, key = 57, rng = makeRng(149);
      const prog = [[0, 'min7'], [8, 'maj7'], [5, 'min7'], [10, 'maj7']];
      const M = new MusicMixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'minor', 69, 89);
      const A = motif(rng, scale.length, [[0, 1.5, 3], [0, 2, 2.5], [0.5, 2, 3], [0, 1, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 55);
        ch.forEach((n, i) => M.add(mPiano(mtof(n - 12), S.beat * 2.2), S.at(b, 0) + i * 0.02, { gain: 0.16, pan: -0.15 + i * 0.1, send: 0.5 }));
        if (b >= 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mPiano(mtof(n.note), n.len * S.beat * 1.1), S.at(b, n.pos), { gain: 0.3, pan: 0.1, send: 0.5 });
        if (b >= 6) ch.forEach((n) => M.add(mPad(mtof(n - 12), S.bar, { cut: 900, attack: 1.6 }), S.at(b, 0), { gain: 0.08, send: 0.55 }));
      }
      return M.render({ wet: 0.5, fadeOut: 5 });
    },
  },
  {
    id: 'festival-cheer', title: '節慶歡騰', mood: '歡慶', bpm: 128,
    desc: '熱鬧的鐘鈴與鼓點，適合節日、慶典、開幕、驚喜揭曉',
    render() {
      const S = song(128), bars = 30, key = 62, rng = makeRng(163);
      const prog = [[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 74, 96);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 62);
        for (let i = 0; i < 4; i++) if (rng() < 0.7) M.add(mBell(mtof(pick(rng, ch) + 12)), S.at(b, i), { gain: 0.14, pan: rng() * 1.6 - 0.8, send: 0.35 });
        [0, 1, 2, 3].forEach((p) => M.add(mKick(1.1), S.at(b, p), { gain: 0.7, bus: 'd', send: 0 }));
        [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.5, bus: 'd', send: 0.25 }));
        for (let i = 0; i < 8; i++) M.add(mHat(i % 4 === 3), S.at(b, i * 0.5), { gain: 0.14, pan: 0.3, bus: 'd', send: 0 });
        M.add(mBass(mtof(root - 24), S.beat * 0.9, 1.4), S.at(b, 0), { gain: 0.42, send: 0 });
        M.add(mBass(mtof(root - 24 + 7), S.beat * 0.45), S.at(b, 2), { gain: 0.36, send: 0 });
        if (b >= 4) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(mMallet(mtof(n.note + 12), n.len * S.beat * 0.8), S.at(b, n.pos), { gain: 0.3, pan: -0.1, send: 0.3 });
        }
      }
      return M.render({ wet: 0.25, fadeOut: 2 });
    },
  },
  {
    id: 'mystery-step', title: '懸疑步伐', mood: '懸疑', bpm: 90,
    desc: '低音脈動與滴答節奏，適合解謎、揭密、緊張鋪陳的片段',
    render() {
      const S = song(90), bars = 24, key = 50, rng = makeRng(179);
      const prog = [[0, 'min'], [1, 'maj'], [0, 'min'], [6, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minor', 62, 84);
      const A = motif(rng, scale.length, [[0, 1, 2, 3], [0.5, 1.5, 2.5], [0, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 48);
        for (let i = 0; i < 4; i++) M.add(mHat(), S.at(b, i), { gain: 0.1, pan: i % 2 ? 0.3 : -0.3, bus: 'd', send: 0 });
        M.add(mBass(mtof(root - 12), S.bar * 0.9, 1), S.at(b, 0), { gain: 0.32, send: 0.15 });
        ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar, { cut: 700 + 50 * i, attack: 1.2 }), S.at(b, 0), { gain: 0.1, send: 0.45 }));
        if (b >= 6 && rng() < 0.6) M.add(mBell(mtof(pick(rng, scale))), S.at(b, pick(rng, [0, 1, 2, 3])), { gain: 0.08, send: 0.5 });
        if (b >= 8 && b < 22) for (const n of realize(A, b % 2, scale, ch)) M.add(mPulse(mtof(n.note - 12), n.len * S.beat * 0.6, { duty: 0.3, cut: 1800 }), S.at(b, n.pos), { gain: 0.16, send: 0.2 });
      }
      return M.render({ wet: 0.35, fadeOut: 3 });
    },
  },
  {
    id: 'jazz-lounge', title: '爵士慢生活', mood: '爵士', bpm: 90,
    desc: '搖擺節奏與行走貝斯，適合美食、餐廳、優雅日常',
    render() {
      const S = song(90, 0.08), bars = 22, key = 58, rng = makeRng(191);
      const prog = [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'major', 69, 89);
      const A = motif(rng, scale.length, [[0, 1.5, 2.5], [0.5, 1, 2, 3], [0, 2, 3.5]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 58);
        const walk = [root - 24, root - 24 + 4, root - 24 + 7, root - 24 + 9];
        walk.forEach((n, i) => M.add(mBass(mtof(n), S.beat * 0.85, 1.1), S.at(b, i), { gain: 0.4, send: 0.1 }));
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 0.9), S.at(b, 1.5) + i * 0.01, { gain: 0.18, pan: -0.2 + i * 0.12, send: 0.3 }));
        [1, 3].forEach((p) => M.add(mHat(), S.at(b, p), { gain: 0.1, bus: 'd', send: 0.05 }));
        if (b >= 2 && b < 20) for (const n of realize(A, b % 2, scale, ch)) M.add(mSineLead(mtof(n.note), n.len * S.beat * 0.85, 0.015), S.at(b, n.pos), { gain: 0.22, pan: 0.1, send: 0.35 });
      }
      return M.render({ wet: 0.3, fadeOut: 3 });
    },
  },
  {
    id: 'epic-rise', title: '史詩崛起', mood: '史詩', bpm: 86,
    desc: '大氣鋪底與鼓點堆疊，適合預告片、轉折、重大揭曉時刻',
    render() {
      const S = song(86), bars = 20, key = 48, rng = makeRng(211);
      const prog = [[0, 'min'], [5, 'maj'], [8, 'maj'], [0, 'min']];
      const M = new MusicMixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'minor', 60, 84);
      const A = motif(rng, scale.length, [[0, 1, 2, 3], [0, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 48);
        const rise = Math.min(1, b / 14);
        ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar, { cut: 500 + 1800 * rise, attack: 1 }), S.at(b, 0), { gain: 0.14 + 0.1 * rise, pan: -0.2 + i * 0.2, send: 0.5 }));
        if (b >= 4) M.add(mKick(1.3), S.at(b, 0), { gain: 0.5 + 0.3 * rise, bus: 'd', send: 0 });
        if (b >= 8) [0, 1, 2, 3].forEach((p) => M.add(mKick(1.3), S.at(b, p), { gain: 0.65, bus: 'd', send: 0 }));
        if (b >= 8) M.add(mBass(mtof(root - 24), S.bar * 0.9, 1.6), S.at(b, 0), { gain: 0.4, send: 0.1 });
        if (b >= 10) for (const n of realize(A, b % 2, scale, ch)) M.add(mMallet(mtof(n.note + 12), n.len * S.beat), S.at(b, n.pos), { gain: 0.28, pan: 0.15, send: 0.4 });
        if (b >= 14) [1, 3].forEach((p) => M.add(mSnare(200), S.at(b, p), { gain: 0.4, bus: 'd', send: 0.3 }));
      }
      return M.render({ wet: 0.4, fadeOut: 5 });
    },
  },
];

// ---------- 第二批曲目：共用「輕快琶音」骨架，差異在調性、速度、和弦走向與配器 ----------
// 許多 Vlog／輕快系的曲子用這個骨架省去重複程式碼；還是各自不同調性、速度、配器，聽起來不會一樣
function popArpTrack({ id, title, mood, bpm, bars = 28, key, scaleName, prog, seed, inst, lead, bassDrive = 1.3, drumsFrom = 4, leadFrom = 8, leadTo, wet = 0.28, fadeOut = 3, desc }) {
  return {
    id, title, mood, bpm, desc,
    render() {
      const S = song(bpm);
      const rng = makeRng(seed);
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, scaleName, 69, 93);
      const A = motif(rng, scale.length);
      const B = motif(rng, scale.length);
      const toEnd = leadTo ?? bars - 2;
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % prog.length];
        const root = key + iv;
        const ch = voicing(root, q, 60);
        const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[0] + 12, ch[1]];
        arp.forEach((n, i) => M.add(inst(mtof(n), S.beat * 0.5), S.at(b, i * 0.5), { gain: 0.28 * (i % 2 ? 0.75 : 1), pan: i % 2 ? 0.3 : -0.3, send: 0.25 }));
        if (b >= drumsFrom) {
          [0, 2].forEach((p) => M.add(mKick(0.8), S.at(b, p), { gain: 0.65, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.4, bus: 'd', send: 0.25 }));
          for (let i = 0; i < 8; i++) M.add(mShaker(), S.at(b, i * 0.5), { gain: 0.1, pan: -0.3, bus: 'd', send: 0 });
          M.add(mBass(mtof(root - 24), S.beat * 0.42, bassDrive), S.at(b, 0), { gain: 0.4, send: 0 });
        }
        if (b >= leadFrom && b < toEnd) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(lead(mtof(n.note), n.len * S.beat * 0.85), S.at(b, n.pos), { gain: 0.26, pan: 0.1, send: 0.3 });
        }
      }
      return M.render({ wet, fadeOut });
    },
  };
}

const PROG_I_IV_vi_V = [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'maj']];
const PROG_vi_IV_I_V = [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']];
const PROG_I_V_vi_IV = [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']];
const PROG_ii_V_I = [[2, 'min'], [7, 'maj'], [0, 'maj'], [5, 'maj']];

const tracks2 = [
  // ---- Vlog：烏克麗麗／木吉他感的撥弦，速度不快不慢，生活感的日常配樂 ----
  popArpTrack({ id: 'ukulele-cafe', title: '咖啡廳烏克麗麗', mood: 'Vlog', bpm: 100, key: 60, scaleName: 'majPent', prog: PROG_I_IV_vi_V, seed: 211, inst: (f, d) => mPluck(f, d, { bright: 0.55 }), lead: mSineLead, desc: '輕鬆的烏克麗麗撥弦，適合咖啡廳、小店探訪' }),
  popArpTrack({ id: 'morning-walk', title: '晨間散步', mood: 'Vlog', bpm: 92, key: 62, scaleName: 'major', prog: PROG_I_V_vi_IV, seed: 223, inst: (f, d) => mPluck(f, d, { bright: 0.45 }), lead: mMallet, desc: '悠閒的早晨節奏，適合散步、晨間日常' }),
  popArpTrack({ id: 'city-stroll', title: '城市漫步', mood: 'Vlog', bpm: 104, key: 57, scaleName: 'majPent', prog: PROG_vi_IV_I_V, seed: 229, inst: (f, d) => mPluck(f, d, { bright: 0.6 }), lead: mSineLead, desc: '輕快但不搶戲，適合城市街拍、逛街紀錄' }),
  popArpTrack({ id: 'cozy-home', title: '居家日常', mood: 'Vlog', bpm: 88, key: 65, scaleName: 'major', prog: PROG_I_IV_vi_V, seed: 233, inst: mEpiano, lead: mEpiano, bassDrive: 1.1, desc: '溫暖的電鋼琴，適合居家整理、下廚日常' }),
  popArpTrack({ id: 'gentle-breeze', title: '微風', mood: 'Vlog', bpm: 96, key: 59, scaleName: 'majPent', prog: PROG_I_V_vi_IV, seed: 241, inst: (f, d) => mPluck(f, d, { bright: 0.5, decay: 0.994 }), lead: mSineLead, desc: '清爽不膩的配樂，萬用的 Vlog 背景音樂' }),
  popArpTrack({ id: 'simple-life', title: '簡單生活', mood: 'Vlog', bpm: 90, key: 64, scaleName: 'major', prog: PROG_vi_IV_I_V, seed: 251, inst: mMallet, lead: mMallet, bassDrive: 1.2, desc: '明亮的木琴質感，適合生活紀錄、開箱' }),
  popArpTrack({ id: 'soft-piano-vlog', title: '輕鋼琴手記', mood: 'Vlog', bpm: 84, key: 60, scaleName: 'major', prog: PROG_ii_V_I, seed: 257, bars: 24, inst: (f, d) => mPiano(f, d * 0.6), lead: mPiano, bassDrive: 1, desc: '簡單的鋼琴小品，適合日記式的生活影片' }),
  popArpTrack({ id: 'acoustic-friends', title: '朋友聚會', mood: 'Vlog', bpm: 108, key: 67, scaleName: 'majPent', prog: PROG_I_IV_vi_V, seed: 263, inst: (f, d) => mPluck(f, d, { bright: 0.65 }), lead: mMallet, desc: '熱鬧但不吵，適合聚會、朋友出遊' }),
  popArpTrack({ id: 'first-love', title: '初戀心動', mood: 'Vlog', bpm: 94, key: 62, scaleName: 'major', prog: PROG_vi_IV_I_V, seed: 269, inst: mEpiano, lead: mSineLead, bassDrive: 1.1, desc: '帶點少女感的小調配樂，適合情侶、紀念日' }),
  popArpTrack({ id: 'family-time', title: '家庭時光', mood: 'Vlog', bpm: 86, key: 65, scaleName: 'majPent', prog: PROG_I_V_vi_IV, seed: 277, inst: mMallet, lead: mEpiano, bassDrive: 1.1, desc: '溫馨的家庭感配樂，適合親子、寵物日常' }),

  // ---- 其餘補滿不同情緒：輕快、溫馨、可愛、歡慶，跟 Vlog 系互相呼應 ----
  popArpTrack({ id: 'summer-pool', title: '夏日泳池', mood: '輕快', bpm: 118, key: 60, scaleName: 'majPent', prog: PROG_I_V_vi_IV, seed: 281, inst: (f, d) => mPluck(f, d, { bright: 0.7 }), lead: mSineLead, desc: '活力滿滿，適合夏天、戶外運動' }),
  popArpTrack({ id: 'spring-bloom', title: '春天綻放', mood: '輕快', bpm: 112, key: 62, scaleName: 'major', prog: PROG_I_IV_vi_V, seed: 283, inst: mMallet, lead: mMallet, desc: '明亮清新，適合賞花、戶外踏青' }),
  popArpTrack({ id: 'autumn-walk', title: '秋日散步', mood: '溫馨', bpm: 82, key: 57, scaleName: 'major', prog: PROG_ii_V_I, seed: 293, bars: 22, inst: mEpiano, lead: mEpiano, bassDrive: 1, desc: '微涼而溫暖，適合秋天、戶外步道' }),
  popArpTrack({ id: 'winter-light', title: '冬日暖陽', mood: '溫馨', bpm: 78, key: 60, scaleName: 'major', prog: PROG_vi_IV_I_V, seed: 307, bars: 22, inst: (f, d) => mPiano(f, d * 0.7), lead: mPiano, bassDrive: 1, desc: '柔和的鋼琴聲，適合冬天室內、節日氣氛' }),
  popArpTrack({ id: 'elegant-piano', title: '優雅鋼琴', mood: '溫馨', bpm: 80, key: 65, scaleName: 'major', prog: PROG_ii_V_I, seed: 311, bars: 20, inst: (f, d) => mPiano(f, d * 0.65), lead: mPiano, bassDrive: 0.9, desc: '優雅內斂，適合質感開箱、生活美學' }),
  popArpTrack({ id: 'playful-puppy', title: '調皮小狗', mood: '可愛', bpm: 128, key: 62, scaleName: 'major', prog: PROG_I_IV_vi_V, seed: 317, inst: (f, d) => mPulse(f, d, { duty: 0.4 }), lead: mPulse, bassDrive: 1.6, desc: '俏皮彈跳感，適合寵物、萌寵日常' }),
  popArpTrack({ id: 'kids-playground', title: '兒童樂園', mood: '可愛', bpm: 124, key: 64, scaleName: 'major', prog: PROG_I_V_vi_IV, seed: 331, inst: mMallet, lead: mMallet, bassDrive: 1.3, desc: '歡樂的兒童感配樂，適合親子、遊樂園' }),
  popArpTrack({ id: 'beach-sunset', title: '海邊夕陽', mood: '輕快', bpm: 100, key: 57, scaleName: 'majPent', prog: PROG_vi_IV_I_V, seed: 337, inst: (f, d) => mPluck(f, d, { bright: 0.55 }), lead: mSineLead, desc: '帶點慵懶的海邊氣氛，適合夕陽、旅遊收尾' }),
  popArpTrack({ id: 'graduation-day', title: '畢業時刻', mood: '勵志', bpm: 96, key: 60, scaleName: 'major', prog: PROG_I_IV_vi_V, seed: 347, inst: mMallet, lead: mMallet, bassDrive: 1.2, desc: '感動又有朝氣，適合畢業、里程碑影片' }),
];
tracks.push(...tracks2);

// ---------- 第三批：風格較不一樣，沿用個別手寫的編曲（氛圍、電子、懸疑、史詩、爵士、感傷、動感、勵志） ----------
const tracks3 = [
  {
    id: 'dreamy-clouds', title: '夢幻雲朵', mood: '氛圍', bpm: 68,
    desc: '飄浮感的鋪底與鐘聲，適合天空、慢動作畫面',
    render() {
      const S = song(68), bars = 16, key = 61, rng = makeRng(353);
      const prog = [[0, 'maj7'], [5, 'maj7'], [9, 'min7'], [7, 'sus2']];
      const M = new MusicMixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'majPent', 73, 92);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 57);
        ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar * 1.05, { cut: 1500, attack: 1.3 }), S.at(b, 0), { gain: 0.14, pan: -0.25 + i * 0.18, send: 0.55 }));
        for (let i = 0; i < 4; i++) if (rng() < 0.5) M.add(mBell(mtof(pick(rng, scale))), S.at(b, i), { gain: 0.1, pan: rng() * 1.2 - 0.6, send: 0.6 });
      }
      return M.render({ wet: 0.5, fadeOut: 5 });
    },
  },
  {
    id: 'night-drive', title: '夜間兜風', mood: '電子', bpm: 100,
    desc: '復古 Synthwave 節奏，適合夜晚開車、城市夜景',
    render() {
      const S = song(100), bars = 26, key = 54, rng = makeRng(359);
      const prog = [[0, 'min'], [8, 'maj'], [5, 'min'], [10, 'maj']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'minor', 70, 87);
      const A = motif(rng, scale.length, [[0, 1.5, 2], [0, 1, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 62);
        for (let i = 0; i < 8; i++) M.add(mPad(mtof(ch[i % 3]), S.beat * 0.22, { cut: 2000, attack: 0.004 }), S.at(b, i * 0.5), { gain: 0.14, pan: i % 2 ? 0.35 : -0.35, send: 0.3 });
        if (b >= 4) {
          [0, 2].forEach((p) => M.add(mKick(1), S.at(b, p), { gain: 0.75, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mSnare(190), S.at(b, p), { gain: 0.5, bus: 'd', send: 0.6 }));
          for (let i = 0; i < 8; i++) M.add(mBass(mtof(root - 24), S.beat * 0.4, 1.8), S.at(b, i * 0.5), { gain: 0.34, send: 0 });
        }
        if (b >= 10 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mPulse(mtof(n.note), n.len * S.beat * 0.8, { duty: 0.4, cut: 2800 }), S.at(b, n.pos), { gain: 0.22, send: 0.35 });
      }
      return M.render({ wet: 0.3, fadeOut: 3 });
    },
  },
  {
    id: 'midnight-city', title: '午夜城市', mood: '懸疑', bpm: 86,
    desc: '低音脈動與疏落的鐘聲，適合揭密、夜間探索',
    render() {
      const S = song(86), bars = 22, key = 52, rng = makeRng(367);
      const prog = [[0, 'min'], [3, 'maj'], [0, 'min'], [8, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minor', 64, 84);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 50);
        M.add(mBass(mtof(root - 12), S.bar * 0.9, 1), S.at(b, 0), { gain: 0.3, send: 0.15 });
        ch.forEach((n) => M.add(mPad(mtof(n), S.bar, { cut: 700, attack: 1.1 }), S.at(b, 0), { gain: 0.1, send: 0.5 }));
        for (let i = 0; i < 4; i++) M.add(mHat(), S.at(b, i), { gain: 0.08, pan: i % 2 ? 0.3 : -0.3, bus: 'd', send: 0 });
        if (rng() < 0.4) M.add(mBell(mtof(pick(rng, scale))), S.at(b, pick(rng, [0, 1.5, 3])), { gain: 0.09, send: 0.5 });
      }
      return M.render({ wet: 0.35, fadeOut: 3 });
    },
  },
  {
    id: 'road-less-traveled', title: '未知旅途', mood: '史詩', bpm: 90,
    desc: '逐漸堆疊的大氣鋪底，適合冒險、未知的旅程',
    render() {
      const S = song(90), bars = 18, key = 50, rng = makeRng(373);
      const prog = [[0, 'min'], [10, 'maj'], [5, 'min'], [8, 'maj']];
      const M = new MusicMixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'minor', 62, 86);
      const A = motif(rng, scale.length, [[0, 1, 2, 3], [0, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 48);
        const rise = Math.min(1, b / 12);
        ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar, { cut: 450 + 1600 * rise, attack: 1 }), S.at(b, 0), { gain: 0.13 + 0.08 * rise, pan: -0.2 + i * 0.2, send: 0.5 }));
        if (b >= 6) [0, 2].forEach((p) => M.add(mKick(1.2), S.at(b, p), { gain: 0.5 + 0.25 * rise, bus: 'd', send: 0 }));
        if (b >= 8) M.add(mBass(mtof(root - 24), S.bar * 0.9, 1.4), S.at(b, 0), { gain: 0.36, send: 0.1 });
        if (b >= 9) for (const n of realize(A, b % 2, scale, ch)) M.add(mMallet(mtof(n.note + 12), n.len * S.beat), S.at(b, n.pos), { gain: 0.26, pan: 0.15, send: 0.4 });
      }
      return M.render({ wet: 0.4, fadeOut: 5 });
    },
  },
  {
    id: 'coffee-shop-jazz', title: '咖啡館爵士', mood: '爵士', bpm: 96,
    desc: '輕快搖擺的爵士節奏，適合餐廳、下午茶時光',
    render() {
      const S = song(96, 0.09), bars = 20, key = 60, rng = makeRng(379);
      const prog = [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'major', 69, 89);
      const A = motif(rng, scale.length, [[0, 1.5, 2.5], [0.5, 1, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 58);
        const walk = [root - 24, root - 24 + 3, root - 24 + 7, root - 24 + 10];
        walk.forEach((n, i) => M.add(mBass(mtof(n), S.beat * 0.85, 1), S.at(b, i), { gain: 0.36, send: 0.1 }));
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 0.9), S.at(b, 1.5) + i * 0.01, { gain: 0.17, pan: -0.2 + i * 0.12, send: 0.3 }));
        [1, 3].forEach((p) => M.add(mHat(), S.at(b, p), { gain: 0.09, bus: 'd', send: 0.05 }));
        if (b >= 3 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mSineLead(mtof(n.note), n.len * S.beat * 0.85, 0.012), S.at(b, n.pos), { gain: 0.2, pan: 0.1, send: 0.35 });
      }
      return M.render({ wet: 0.3, fadeOut: 3 });
    },
  },
  {
    id: 'soulful-blues', title: '藍調情懷', mood: '爵士', bpm: 76,
    desc: '慵懶的藍調和弦，適合晚餐、氣氛收尾',
    render() {
      const S = song(76, 0.1), bars = 16, key = 55, rng = makeRng(383);
      const prog = [[0, 'dom7'], [0, 'dom7'], [5, 'dom7'], [0, 'dom7']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minor', 67, 86);
      const A = motif(rng, scale.length, [[0, 2, 3], [0, 1.5, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 55);
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 2.6), S.at(b, 0) + i * 0.015, { gain: 0.18, pan: -0.2 + i * 0.13, send: 0.3 }));
        M.add(mBass(mtof(root - 24), S.beat * 1.6, 1.1), S.at(b, 0), { gain: 0.42, send: 0 });
        if (b >= 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mSineLead(mtof(n.note), n.len * S.beat, 0.02), S.at(b, n.pos), { gain: 0.24, pan: 0.15, send: 0.35 });
      }
      return M.render({ wet: 0.35, fadeOut: 4 });
    },
  },
  {
    id: 'tech-startup', title: '科技新創', mood: '電子', bpm: 118,
    desc: '俐落的電子節奏，適合科技、開箱、產品介紹',
    render() {
      const S = song(118), bars = 28, key = 57, rng = makeRng(389);
      const prog = [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 69, 90);
      const A = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 62);
        for (let i = 0; i < 8; i++) M.add(mPulse(mtof(ch[i % 3] + 12), S.beat * 0.18, { duty: 0.3, cut: 3200 }), S.at(b, i * 0.5), { gain: 0.12, pan: i % 2 ? 0.3 : -0.3, send: 0.2 });
        if (b >= 4) {
          [0, 1, 2, 3].forEach((p) => M.add(mKick(1), S.at(b, p), { gain: 0.6, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.4, bus: 'd', send: 0.2 }));
          M.add(mSawBass(mtof(root - 24), S.beat * 0.4), S.at(b, 0), { gain: 0.36, send: 0 });
        }
        if (b >= 8 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mPluck(mtof(n.note), n.len * S.beat * 0.8, { bright: 0.75 }), S.at(b, n.pos), { gain: 0.26, pan: 0.12, send: 0.3 });
      }
      return M.render({ wet: 0.25, fadeOut: 3 });
    },
  },
  {
    id: 'clean-minimal', title: '極簡風格', mood: '氛圍', bpm: 72,
    desc: '極簡的鋼琴與留白，適合質感、簡約風格的畫面',
    render() {
      const S = song(72), bars = 18, key = 60, rng = makeRng(397);
      const prog = [[0, 'maj7'], [7, 'sus2'], [9, 'min7'], [5, 'maj7']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'majPent', 72, 90);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        if (rng() < 0.7) M.add(mPiano(mtof(pick(rng, ch)), S.beat * 1.5), S.at(b, pick(rng, [0, 1.5, 2.5])), { gain: 0.22, send: 0.4 });
        if (b % 2 === 0) M.add(mPad(mtof(root - 12), S.bar * 1.8, { cut: 900, attack: 2 }), S.at(b, 0), { gain: 0.08, send: 0.45 });
      }
      return M.render({ wet: 0.4, fadeOut: 4 });
    },
  },
  {
    id: 'urban-groove', title: '都市律動', mood: '動感', bpm: 110,
    desc: '俐落的節奏藍調律動，適合穿搭、生活風格影片',
    render() {
      const S = song(110), bars = 26, key = 58, rng = makeRng(401);
      const prog = [[0, 'min7'], [5, 'min7'], [8, 'maj'], [3, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minPent', 70, 88);
      const A = motif(rng, scale.length, [[0, 0.75, 1.5, 2.5], [0, 1, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 0.5), S.at(b, i), { gain: 0.16, pan: -0.2 + i * 0.13, send: 0.25 }));
        if (b >= 4) {
          [0, 2.5].forEach((p) => M.add(mKick(1), S.at(b, p), { gain: 0.68, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mSnare(180), S.at(b, p), { gain: 0.42, bus: 'd', send: 0.3 }));
          for (let i = 0; i < 8; i++) M.add(mHat(i === 6), S.at(b, i * 0.5), { gain: 0.1, pan: 0.25, bus: 'd', send: 0 });
          M.add(mBass(mtof(root - 24), S.beat * 0.4, 1.5), S.at(b, 0.5), { gain: 0.4, send: 0 });
        }
        if (b >= 8 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mPluck(mtof(n.note), n.len * S.beat * 0.75, { bright: 0.7 }), S.at(b, n.pos), { gain: 0.26, send: 0.3 });
      }
      return M.render({ wet: 0.25, fadeOut: 3 });
    },
  },
  {
    id: 'late-night-study', title: '深夜讀書', mood: '氛圍', bpm: 70,
    desc: '安靜的電鋼琴配樂，適合讀書、工作、專注時刻',
    render() {
      const S = song(70), bars = 18, key = 62, rng = makeRng(409);
      const prog = [[0, 'maj7'], [9, 'min7'], [5, 'maj7'], [2, 'min7']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'majPent', 71, 88);
      const A = motif(rng, scale.length, [[0, 1.5, 3], [0, 2]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 2.4), S.at(b, 0) + i * 0.01, { gain: 0.15, pan: -0.2 + i * 0.13, send: 0.3 }));
        if (b >= 3 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mEpiano(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.18, pan: 0.1, send: 0.35 });
      }
      return M.render({ wet: 0.35, fadeOut: 4 });
    },
  },
  {
    id: 'new-beginnings', title: '嶄新開始', mood: '勵志', bpm: 104,
    desc: '逐漸堆疊的鋼琴與弦樂，適合開箱、新的開始',
    render() {
      const S = song(104), bars = 24, key = 62, rng = makeRng(419);
      const prog = [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'major', 69, 91);
      const A = motif(rng, scale.length), B = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 57);
        ch.forEach((n, i) => M.add(mPiano(mtof(n), S.beat * 0.5), S.at(b, i * 0.5), { gain: 0.2, pan: -0.2, send: 0.3 }));
        if (b >= 5) ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar, { cut: 1600, attack: 0.6 }), S.at(b, 0), { gain: 0.1, pan: -0.2 + i * 0.2, send: 0.4 }));
        if (b >= 10) {
          [0, 1, 2, 3].forEach((p) => M.add(mKick(1), S.at(b, p), { gain: 0.55, bus: 'd', send: 0 }));
          M.add(mBass(mtof(root - 24), S.bar * 0.9, 1.2), S.at(b, 0), { gain: 0.36, send: 0 });
        }
        if (b >= 10 && b < bars - 2) {
          const m = (b % 8) < 4 ? A : B;
          for (const n of realize(m, b % 2, scale, ch)) M.add(mMallet(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.3, pan: 0.15, send: 0.3 });
        }
      }
      return M.render({ wet: 0.3, fadeOut: 4 });
    },
  },
  {
    id: 'gentle-rain-piano', title: '細雨鋼琴', mood: '感傷', bpm: 64,
    desc: '單薄的鋼琴聲與雨聲質感，適合離別、安靜的片段',
    render() {
      const S = song(64), bars = 16, key = 57, rng = makeRng(421);
      const prog = [[0, 'min7'], [5, 'min7'], [8, 'maj7'], [3, 'maj7']];
      const M = new MusicMixer(bars * S.bar + 5);
      const scale = scaleNotes(key, 'minor', 69, 86);
      const A = motif(rng, scale.length, [[0, 2, 3], [0, 1.5, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 55);
        ch.forEach((n, i) => M.add(mPiano(mtof(n - 12), S.beat * 2.2), S.at(b, 0) + i * 0.02, { gain: 0.15, pan: -0.15 + i * 0.1, send: 0.5 }));
        if (b >= 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mPiano(mtof(n.note), n.len * S.beat * 1.1), S.at(b, n.pos), { gain: 0.28, pan: 0.1, send: 0.5 });
      }
      return M.render({ wet: 0.5, fadeOut: 5 });
    },
  },
  {
    id: 'tropical-escape', title: '熱帶假期', mood: '輕快', bpm: 114,
    desc: '南洋打擊樂風格，適合海島、度假、夏日旅遊',
    render() {
      const S = song(114), bars = 24, key = 62, rng = makeRng(431);
      const prog = [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'majPent', 69, 90);
      const A = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 60);
        for (let i = 0; i < 4; i++) M.add(mShaker(), S.at(b, i), { gain: 0.16, pan: i % 2 ? 0.4 : -0.4, bus: 'd', send: 0 });
        if (b >= 3) {
          [0, 2].forEach((p) => M.add(mKick(0.8), S.at(b, p), { gain: 0.55, bus: 'd', send: 0 }));
          M.add(mBass(mtof(root - 24), S.beat * 0.4, 1.2), S.at(b, 0), { gain: 0.36, send: 0 });
          ch.forEach((n, i) => M.add(mPluck(mtof(n), S.beat * 0.4, { bright: 0.7 }), S.at(b, 1 + i * 0.3), { gain: 0.2, pan: -0.2 + i * 0.2, send: 0.25 }));
        }
        if (b >= 6 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mMallet(mtof(n.note + 12), n.len * S.beat * 0.8), S.at(b, n.pos), { gain: 0.26, send: 0.3 });
      }
      return M.render({ wet: 0.3, fadeOut: 3 });
    },
  },
  {
    id: 'zen-garden', title: '禪意庭園', mood: '氛圍', bpm: 62,
    desc: '空靈的鐘聲與留白，適合冥想、自然、安靜片段',
    render() {
      const S = song(62), bars = 14, key = 59, rng = makeRng(439);
      const prog = [[0, 'maj7'], [5, 'sus2'], [9, 'min7'], [2, 'sus2']];
      const M = new MusicMixer(bars * S.bar + 6);
      const scale = scaleNotes(key, 'majPent', 71, 91);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 57);
        ch.forEach((n, i) => M.add(mPad(mtof(n), S.bar * 1.3, { cut: 1100, attack: 1.6 }), S.at(b, 0), { gain: 0.11, pan: -0.2 + i * 0.2, send: 0.6 }));
        if (rng() < 0.55) M.add(mBell(mtof(pick(rng, scale))), S.at(b, pick(rng, [0, 1, 2, 3])), { gain: 0.11, send: 0.65 });
      }
      return M.render({ wet: 0.55, fadeOut: 6 });
    },
  },
  {
    id: 'campfire-stories', title: '營火故事', mood: '溫馨', bpm: 86,
    desc: '溫暖的木吉他撥弦，適合露營、夜晚聚會',
    render() {
      const S = song(86), bars = 20, key = 57, rng = makeRng(443);
      const prog = [[0, 'maj'], [9, 'min'], [5, 'maj'], [0, 'maj']];
      const M = new MusicMixer(bars * S.bar + 4);
      const scale = scaleNotes(key, 'majPent', 69, 88);
      const A = motif(rng, scale.length);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 57);
        const arp = [ch[0], ch[1], ch[2], ch[1]];
        arp.forEach((n, i) => M.add(mPluck(mtof(n), S.beat * 0.9, { bright: 0.4, decay: 0.993 }), S.at(b, i), { gain: 0.24, pan: i % 2 ? 0.25 : -0.25, send: 0.3 }));
        if (b >= 4) M.add(mBass(mtof(root - 24), S.beat * 0.9, 1), S.at(b, 0), { gain: 0.34, send: 0 });
        if (b >= 7 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mMallet(mtof(n.note), n.len * S.beat), S.at(b, n.pos), { gain: 0.22, send: 0.3 });
      }
      return M.render({ wet: 0.35, fadeOut: 4 });
    },
  },
  {
    id: 'countdown-hype', title: '倒數時刻', mood: '動感', bpm: 128,
    desc: '堆疊張力的電子節奏，適合開獎、倒數、高潮片段',
    render() {
      const S = song(128), bars = 20, key = 55, rng = makeRng(449);
      const prog = [[0, 'min'], [5, 'min'], [8, 'maj'], [10, 'maj']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'minor', 67, 88);
      const A = motif(rng, scale.length, [[0, 0.5, 1, 1.5], [0, 1, 2, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 58);
        const rise = Math.min(1, b / 14);
        for (let i = 0; i < 8; i++) M.add(mPulse(mtof(ch[i % 3] + 12), S.beat * 0.15, { duty: 0.25 + rise * 0.2 }), S.at(b, i * 0.5), { gain: 0.1 + 0.08 * rise, send: 0.2 });
        if (b >= 3) {
          [0, 1, 2, 3].forEach((p) => M.add(mKick(1), S.at(b, p), { gain: 0.55 + 0.2 * rise, bus: 'd', send: 0 }));
          [1, 3].forEach((p) => M.add(mClap(), S.at(b, p), { gain: 0.35, bus: 'd', send: 0.3 }));
          M.add(mSawBass(mtof(root - 24), S.beat * 0.38), S.at(b, 0), { gain: 0.34, send: 0 });
        }
        if (b >= 10 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mPulse(mtof(n.note + 12), n.len * S.beat * 0.7, { duty: 0.35 }), S.at(b, n.pos), { gain: 0.22, send: 0.3 });
      }
      return M.render({ wet: 0.22, fadeOut: 2 });
    },
  },
  {
    id: 'sunday-brunch', title: '週末早午餐', mood: 'Vlog', bpm: 98, bars: 22,
    desc: '輕盈的電鋼琴配爵士味和弦，適合早午餐、週末日常',
    render() {
      const S = song(98, 0.08), bars = 22, key = 60, rng = makeRng(457);
      const prog = [[0, 'maj7'], [5, 'dom7'], [9, 'min7'], [2, 'min7']];
      const M = new MusicMixer(bars * S.bar + 3);
      const scale = scaleNotes(key, 'major', 69, 89);
      const A = motif(rng, scale.length, [[0, 1, 2.5], [0.5, 1.5, 3]]);
      for (let b = 0; b < bars; b++) {
        const [iv, q] = prog[b % 4];
        const root = key + iv, ch = voicing(root, q, 58);
        ch.forEach((n, i) => M.add(mEpiano(mtof(n), S.beat * 0.7), S.at(b, i * 0.5), { gain: 0.17, pan: -0.2 + i * 0.13, send: 0.25 }));
        if (b >= 4) {
          M.add(mBass(mtof(root - 24), S.beat * 0.7, 1.1), S.at(b, 0), { gain: 0.34, send: 0 });
          [1, 3].forEach((p) => M.add(mHat(), S.at(b, p), { gain: 0.08, bus: 'd', send: 0.05 }));
        }
        if (b >= 6 && b < bars - 2) for (const n of realize(A, b % 2, scale, ch)) M.add(mSineLead(mtof(n.note), n.len * S.beat * 0.85, 0.015), S.at(b, n.pos), { gain: 0.22, pan: 0.12, send: 0.3 });
      }
      return M.render({ wet: 0.3, fadeOut: 3 });
    },
  },
];
tracks.push(...tracks3);

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
  {
    id: 'sfx-heart', title: '心動', mood: '可愛', desc: '愛心彈出的音效，適合按讚、收藏、喜歡的瞬間',
    render: () => sfx(0.6, (M) => {
      [0, 0.09].forEach((t, i) => {
        const out = new Float32Array(Math.floor(0.14 * SR));
        let ph = 0;
        for (let j = 0; j < out.length; j++) {
          const tt = j / SR;
          ph += (520 + 420 * Math.exp(-tt * 30)) / SR;
          out[j] = Math.sin(TAU * ph) * Math.exp(-tt * 20);
        }
        M.add(out, t, { gain: i === 0 ? 0.7 : 0.5, send: 0.2 });
      });
    }),
  },
  {
    id: 'sfx-swipe', title: '滑動', mood: '轉場', desc: '輕快的滑動音效，適合切換畫面、翻頁',
    render: () => sfx(0.5, (M) => {
      const len = Math.floor(0.22 * SR);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        out[i] = noise() * Math.sin(Math.PI * t);
      }
      M.add(biquad(out, 'bp', 2600, 1.4), 0, { gain: 0.9, pan: -0.3, send: 0.1 });
    }),
  },
  {
    id: 'sfx-notify', title: '通知', mood: '提示', desc: '兩聲上揚的提示音，適合彈出訊息、提醒',
    render: () => sfx(1, (M) => {
      M.add(bell(988), 0, { gain: 0.4, send: 0.25 });
      M.add(bell(1480), 0.09, { gain: 0.35, send: 0.25 });
    }),
  },
  {
    id: 'sfx-countdown', title: '倒數', mood: '提示', desc: '三聲倒數加一聲上揚，適合開場、倒數計時',
    render: () => sfx(2.6, (M) => {
      [0, 0.7, 1.4].forEach((t) => M.add(pulse(880, 0.12, { duty: 0.5 }), t, { gain: 0.5, send: 0.1 }));
      M.add(pulse(1320, 0.3, { duty: 0.5 }), 2.1, { gain: 0.55, send: 0.15 });
    }),
  },
  {
    id: 'sfx-applause', title: '掌聲', mood: '完成', desc: '一小段鼓掌聲，適合成果揭曉、感謝畫面',
    render: () => sfx(1.6, (M) => {
      const r = makeRng(29);
      let t = 0;
      while (t < 1.3) {
        const c = new Float32Array(Math.floor(0.03 * SR));
        for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 70);
        M.add(biquad(c, 'bp', 1800 + r() * 2200, 1.2), t, { gain: 0.3 + r() * 0.2, pan: r() * 2 - 1, send: 0.15 });
        t += 0.015 + r() * 0.02;
      }
    }),
  },
  {
    id: 'sfx-success', title: '完成打勾', mood: '完成', desc: '上揚的三音符鈴聲，適合任務完成、打勾、成功提示',
    render: () => sfx(1, (M) => {
      [523, 659, 784].forEach((f, i) => M.add(bell(f), i * 0.08, { gain: 0.35, send: 0.2 }));
    }),
  },
  {
    id: 'sfx-error', title: '錯誤提示', mood: '提示', desc: '低沉的兩聲警示音，適合錯誤、失敗、禁止動作',
    render: () => sfx(0.7, (M) => {
      M.add(pulse(220, 0.16, { duty: 0.5, cut: 1800 }), 0, { gain: 0.5, send: 0.05 });
      M.add(pulse(165, 0.2, { duty: 0.5, cut: 1800 }), 0.16, { gain: 0.5, send: 0.05 });
    }),
  },
  {
    id: 'sfx-cash', title: '叮噹進帳', mood: '完成', desc: '金屬鈴響與清脆噪音，適合金額、優惠、成果數字跳動',
    render: () => sfx(1.2, (M) => {
      M.add(bell(1760), 0, { gain: 0.35, send: 0.25 });
      M.add(bell(2640), 0.02, { gain: 0.2, send: 0.25 });
      const c = new Float32Array(Math.floor(0.08 * SR));
      for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 55);
      M.add(biquad(c, 'bp', 4200, 1.6), 0.01, { gain: 0.5, send: 0.1 });
    }),
  },
  {
    id: 'sfx-glitch', title: '故障干擾', mood: '轉場', desc: '跳動的數位噪音，適合故障風格轉場、驚嚇、資訊錯亂',
    render: () => sfx(0.8, (M) => {
      const r = makeRng(37);
      let t = 0;
      while (t < 0.6) {
        const dur = 0.015 + r() * 0.03;
        if (r() < 0.5) M.add(chipNoise(dur), t, { gain: 0.5 + r() * 0.3, pan: r() * 2 - 1, send: 0 });
        else M.add(pulse(200 + r() * 2600, dur, { duty: 0.3 + r() * 0.4 }), t, { gain: 0.3 + r() * 0.2, send: 0 });
        t += dur + r() * 0.025;
      }
    }),
  },
  {
    id: 'sfx-pageturn', title: '翻頁', mood: '轉場', desc: '輕薄的紙張翻動聲，適合條列、步驟切換、翻頁動畫',
    render: () => sfx(0.5, (M) => {
      const len = Math.floor(0.26 * SR);
      const out = new Float32Array(len);
      const r = makeRng(43);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        out[i] = noise() * Math.sin(Math.PI * t) * (0.7 + 0.3 * (r() < 0.1 ? 1 : 0));
      }
      M.add(biquad(out, 'bp', 6200, 1.1), 0, { gain: 0.7, pan: 0.2, send: 0.08 });
    }),
  },
  {
    id: 'sfx-bubble', title: '泡泡', mood: '可愛', desc: '一串由低到高的泡泡音，適合輕鬆、兒童、氣泡動畫',
    render: () => sfx(1.1, (M) => {
      const r = makeRng(59);
      [0, 0.1, 0.22, 0.36, 0.52].forEach((t, i) => {
        const out = new Float32Array(Math.floor(0.1 * SR));
        let ph = 0;
        const base = 350 + i * 90 + r() * 60;
        for (let j = 0; j < out.length; j++) {
          const tt = j / SR;
          ph += (base + base * 2.4 * Math.exp(-tt * 38)) / SR;
          out[j] = Math.sin(TAU * ph) * Math.exp(-tt * 32);
        }
        M.add(out, t, { gain: 0.5, pan: r() * 1.2 - 0.6, send: 0.15 });
      });
    }),
  },
  {
    id: 'sfx-impact', title: '重擊強調', mood: '轉場', desc: '低沉厚實的一擊，適合重點畫面、文字強調、震撼轉折',
    render: () => sfx(0.8, (M) => {
      M.add(kick(1.5), 0, { gain: 0.95, bus: 'd', send: 0.15 });
      const c = new Float32Array(Math.floor(0.1 * SR));
      for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 45);
      M.add(biquad(c, 'bp', 900, 0.8), 0, { gain: 0.6, send: 0.3 });
    }),
  },
  {
    id: 'sfx-confetti', title: '彩帶慶祝', mood: '完成', desc: '碎紙噴發般的清脆噪音群，適合慶祝、驚喜揭曉、結尾畫面',
    render: () => sfx(1.4, (M) => {
      const r = makeRng(61);
      const burst = new Float32Array(Math.floor(0.05 * SR));
      for (let i = 0; i < burst.length; i++) burst[i] = noise() * Math.exp((-i / SR) * 90);
      M.add(biquad(burst, 'hp', 2000), 0, { gain: 0.8, send: 0.15 });
      let t = 0.03;
      while (t < 1.1) {
        const c = new Float32Array(Math.floor(0.025 * SR));
        for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 100);
        M.add(biquad(c, 'bp', 3000 + r() * 4000, 2), t, { gain: 0.18 + r() * 0.12, pan: r() * 2 - 1, send: 0.1 });
        t += 0.02 + r() * 0.07;
      }
    }),
  },
  {
    id: 'sfx-click', title: '點擊', mood: '提示', desc: '乾淨短促的點擊聲，適合按鈕、選單互動',
    render: () => sfx(0.3, (M) => {
      const out = new Float32Array(Math.floor(0.02 * SR));
      for (let i = 0; i < out.length; i++) out[i] = Math.sin(TAU * 1600 * (i / SR)) * Math.exp((-i / SR) * 260);
      M.add(out, 0, { gain: 0.6, send: 0.05 });
    }),
  },
  {
    id: 'sfx-toggle', title: '切換', mood: '提示', desc: '高低兩段的切換音，適合開關、模式切換',
    render: () => sfx(0.4, (M) => {
      M.add(pulse(600, 0.05, { duty: 0.5 }), 0, { gain: 0.4, send: 0.05 });
      M.add(pulse(900, 0.05, { duty: 0.5 }), 0.07, { gain: 0.4, send: 0.05 });
    }),
  },
  {
    id: 'sfx-pop-low', title: '低音啵', mood: '可愛', desc: '較低沉的彈出聲，適合貼圖、區塊出現',
    render: () => sfx(0.4, (M) => {
      const out = new Float32Array(Math.floor(0.14 * SR));
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        ph += (160 + 480 * Math.exp(-t * 32)) / SR;
        out[i] = Math.sin(TAU * ph) * Math.exp(-t * 28);
      }
      M.add(out, 0, { gain: 0.8, send: 0.1 });
    }),
  },
  {
    id: 'sfx-ding-double', title: '雙響叮', mood: '提示', desc: '兩聲上揚鈴聲，適合收到訊息、小提醒',
    render: () => sfx(1, (M) => {
      M.add(bell(1046), 0, { gain: 0.4, send: 0.25 });
      M.add(bell(1318), 0.12, { gain: 0.3, send: 0.25 });
    }),
  },
  {
    id: 'sfx-swoosh-soft', title: '輕咻', mood: '轉場', desc: '輕柔短暫的風聲，適合淡入淡出、柔和轉場',
    render: () => sfx(0.6, (M) => {
      const len = Math.floor(0.4 * SR);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        out[i] = noise() * Math.sin(Math.PI * t) * 0.8;
      }
      M.add(biquad(out, 'bp', 1800, 1), 0, { gain: 0.6, send: 0.3 });
    }),
  },
  {
    id: 'sfx-slidein', title: '滑入定位', mood: '轉場', desc: '滑入後輕輕到位的聲音，適合文字、圖片滑入畫面',
    render: () => sfx(0.6, (M) => {
      const len = Math.floor(0.2 * SR);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) out[i] = noise() * (1 - i / len);
      M.add(biquad(out, 'bp', 2400, 1.3), 0, { gain: 0.5, pan: -0.2, send: 0.1 });
      M.add(bell(1046), 0.17, { gain: 0.25, send: 0.2 });
    }),
  },
  {
    id: 'sfx-camera-ready', title: '相機對焦', mood: '拍照', desc: '對焦後快門的兩段聲音，適合拍照、截圖畫面',
    render: () => sfx(0.8, (M) => {
      M.add(pulse(1400, 0.03, { duty: 0.5 }), 0, { gain: 0.25, send: 0.05 });
      const c = new Float32Array(Math.floor(0.04 * SR));
      for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 100);
      M.add(biquad(c, 'bp', 3200, 1.6), 0.18, { gain: 0.7, send: 0.05 });
    }),
  },
  {
    id: 'sfx-polaroid', title: '拍立得', mood: '拍照', desc: '機械吐片般的聲音，適合復古拍照、拼貼風格',
    render: () => sfx(0.9, (M) => {
      const c = new Float32Array(Math.floor(0.5 * SR));
      const r = makeRng(67);
      for (let i = 0; i < c.length; i++) c[i] = noise() * (0.3 + 0.2 * Math.sin((i / SR) * 40)) * Math.exp((-i / SR) * 2);
      M.add(biquad(c, 'bp', 1200, 1), 0, { gain: 0.5, send: 0.1 });
      M.add(pulse(900, 0.03, { duty: 0.5 }), 0, { gain: 0.2, send: 0.05 });
    }),
  },
  {
    id: 'sfx-fanfare', title: '小號慶祝', mood: '完成', desc: '簡短的小號式上揚旋律，適合頒獎、里程碑',
    render: () => sfx(1.6, (M) => {
      [523, 659, 784, 1046].forEach((f, i) => M.add(pad(f, 0.3, { cut: 4000, attack: 0.005 }), i * 0.14, { gain: 0.35, send: 0.3 }));
      M.add(snare(), 0.56, { gain: 0.4, bus: 'd', send: 0.3 });
    }),
  },
  {
    id: 'sfx-levelup', title: '升級音效', mood: '完成', desc: '上升琶音加亮點，適合升級、解鎖、數值提升',
    render: () => sfx(1, (M) => {
      [440, 554, 659, 880].forEach((f, i) => M.add(pulse(f, 0.1, { duty: 0.4 }), i * 0.07, { gain: 0.4, send: 0.2 }));
      M.add(bell(1760), 0.3, { gain: 0.3, send: 0.3 });
    }),
  },
  {
    id: 'sfx-stamp', title: '蓋章', mood: '完成', desc: '沉重的一擊，適合核准、認證、蓋章畫面',
    render: () => sfx(0.6, (M) => {
      M.add(kick(1.1), 0, { gain: 0.7, bus: 'd', send: 0.1 });
      const c = new Float32Array(Math.floor(0.05 * SR));
      for (let i = 0; i < c.length; i++) c[i] = noise() * Math.exp((-i / SR) * 140);
      M.add(biquad(c, 'bp', 1600, 1.4), 0, { gain: 0.45, send: 0.1 });
    }),
  },
  {
    id: 'sfx-alarm-soft', title: '柔和警示', mood: '提示', desc: '不刺耳的兩聲提醒，適合計時、溫和警示',
    render: () => sfx(1, (M) => {
      [0, 0.26].forEach((t) => M.add(pulse(740, 0.14, { duty: 0.5, cut: 2200 }), t, { gain: 0.4, send: 0.1 }));
    }),
  },
  {
    id: 'sfx-denied', title: '禁止動作', mood: '提示', desc: '短促的否定音，適合禁止、不可操作提示',
    render: () => sfx(0.5, (M) => {
      M.add(pulse(180, 0.2, { duty: 0.3, cut: 1200 }), 0, { gain: 0.5, send: 0.05 });
    }),
  },
  {
    id: 'sfx-whip-pan', title: '甩鏡', mood: '轉場', desc: '快速且短的甩動聲，適合甩鏡、快速切換',
    render: () => sfx(0.4, (M) => {
      const len = Math.floor(0.16 * SR);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        out[i] = noise() * Math.exp(-t * 6) * (1 - t);
      }
      M.add(biquad(out, 'bp', 3400, 1.5), 0, { gain: 1, pan: 0.5, send: 0.15 });
    }),
  },
  {
    id: 'sfx-zoom-blur', title: '縮放模糊', mood: '轉場', desc: '帶音高下滑的推近感音效，適合縮放、強調特寫',
    render: () => sfx(0.8, (M) => {
      const len = Math.floor(0.5 * SR);
      const out = new Float32Array(len);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ph += (900 - 650 * t) / SR;
        out[i] = Math.sin(TAU * ph) * Math.exp(-t * 2) * 0.6 + noise() * 0.15 * (1 - t);
      }
      M.add(out, 0, { gain: 0.6, send: 0.3 });
    }),
  },
  {
    id: 'sfx-drumroll', title: '鼓聲鋪陳', mood: '轉場', desc: '漸快的小鼓滾奏，適合揭曉前的緊張鋪陳',
    render: () => sfx(1.6, (M) => {
      let t = 0, gap = 0.2;
      while (t < 1.4) {
        M.add(snare(260), t, { gain: 0.3 + (t / 1.4) * 0.3, bus: 'd', send: 0.2 });
        gap = Math.max(0.03, gap * 0.92);
        t += gap;
      }
    }),
  },
  {
    id: 'sfx-pencil', title: '書寫筆畫', mood: '文字', desc: '輕微的筆尖摩擦聲，適合手寫字幕、簽名動畫',
    render: () => sfx(1, (M) => {
      const r = makeRng(71);
      const out = new Float32Array(Math.floor(0.8 * SR));
      for (let i = 0; i < out.length; i++) out[i] = (r() * 2 - 1) * 0.15 * (0.5 + 0.5 * Math.sin(i / 220));
      M.add(biquad(out, 'bp', 3800, 0.8), 0, { gain: 0.5, send: 0.05 });
    }),
  },
  {
    id: 'sfx-stars-twinkle', title: '星光閃爍', mood: '可愛', desc: '一串清亮的高音點，適合星星、亮點裝飾動畫',
    render: () => sfx(1.2, (M) => {
      const r = makeRng(79);
      [0, 0.12, 0.26, 0.42, 0.6].forEach((t) => M.add(bell(1800 + r() * 1400), t, { gain: 0.2 + r() * 0.15, pan: r() * 1.6 - 0.8, send: 0.35 }));
    }),
  },
  {
    id: 'sfx-magic-sparkle', title: '魔法閃光', mood: '可愛', desc: '上揚的鈴聲群，適合特效出現、變身瞬間',
    render: () => sfx(1.2, (M) => {
      [0, 0.04, 0.08, 0.14, 0.22].forEach((t, i) => M.add(bell(900 + i * 420), t, { gain: 0.3 - i * 0.03, send: 0.4 }));
    }),
  },
  {
    id: 'sfx-balloon-squeak', title: '氣球擠壓', mood: '搞笑', desc: '滑稽的擠壓聲，適合誇張、搞笑橋段',
    render: () => sfx(0.6, (M) => {
      const out = new Float32Array(Math.floor(0.4 * SR));
      let ph = 0;
      const r = makeRng(83);
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        ph += (500 + 300 * Math.sin(t * 40) + r() * 20) / SR;
        out[i] = Math.sin(TAU * ph) * 0.5;
      }
      M.add(out, 0, { gain: 0.6, send: 0.05 });
    }),
  },
  {
    id: 'sfx-cartoon-fall', title: '卡通跌倒', mood: '搞笑', desc: '下滑音加撞擊，適合誇張的跌倒、失敗橋段',
    render: () => sfx(1, (M) => {
      const len = Math.floor(0.5 * SR);
      const out = new Float32Array(len);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ph += (700 * Math.pow(0.08, t)) / SR;
        out[i] = Math.sin(TAU * ph) * (1 - t * 0.3);
      }
      M.add(out, 0, { gain: 0.6, send: 0.1 });
      M.add(kick(1), 0.5, { gain: 0.6, bus: 'd', send: 0.1 });
    }),
  },
  {
    id: 'sfx-record-scratch', title: '唱片刮音', mood: '搞笑', desc: '誇張的急停刮音，適合劇情急轉、吐槽時刻',
    render: () => sfx(0.5, (M) => {
      const len = Math.floor(0.22 * SR);
      const out = new Float32Array(len);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ph += (260 * (1 - t) + noise() * 40) / SR;
        out[i] = Math.sin(TAU * ph) * (1 - t);
      }
      M.add(biquad(out, 'lp', 2400), 0, { gain: 0.8, send: 0.05 });
    }),
  },
  {
    id: 'sfx-water-drop', title: '水滴', mood: '自然', desc: '清澈的水滴聲，適合廚房、飲品、水景畫面',
    render: () => sfx(0.6, (M) => {
      const out = new Float32Array(Math.floor(0.3 * SR));
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        ph += (1400 * Math.exp(-t * 18)) / SR;
        out[i] = Math.sin(TAU * ph) * Math.exp(-t * 10);
      }
      M.add(out, 0, { gain: 0.5, send: 0.3 });
    }),
  },
  {
    id: 'sfx-wind-chime', title: '風鈴', mood: '自然', desc: '清脆的多音鈴響，適合戶外、庭院、悠閒片段',
    render: () => sfx(1.8, (M) => {
      const r = makeRng(89);
      const notes = [1046, 1318, 1568, 1760, 2093];
      for (let i = 0; i < 6; i++) M.add(bell(notes[Math.floor(r() * notes.length)]), r() * 1.4, { gain: 0.18 + r() * 0.1, pan: r() * 1.6 - 0.8, send: 0.45 });
    }),
  },
  {
    id: 'sfx-page-flip-fast', title: '快速翻頁', mood: '轉場', desc: '連續快速翻頁聲，適合相簿、列表快速捲動',
    render: () => sfx(0.9, (M) => {
      const r = makeRng(97);
      let t = 0;
      while (t < 0.7) {
        const len = Math.floor(0.05 * SR);
        const out = new Float32Array(len);
        for (let i = 0; i < len; i++) out[i] = noise() * Math.sin((Math.PI * i) / len);
        M.add(biquad(out, 'bp', 5800, 1), t, { gain: 0.4, send: 0.05 });
        t += 0.045 + r() * 0.02;
      }
    }),
  },
  {
    id: 'sfx-coin', title: '金幣', mood: '完成', desc: '短促的金屬叮聲，適合分數、金幣、小獎勵',
    render: () => sfx(0.5, (M) => {
      M.add(bell(1568), 0, { gain: 0.4, send: 0.3 });
      M.add(bell(2349), 0.06, { gain: 0.3, send: 0.3 });
    }),
  },
  {
    id: 'sfx-unlock', title: '解鎖', mood: '完成', desc: '兩段式的解鎖聲，適合解鎖成就、隱藏內容出現',
    render: () => sfx(0.9, (M) => {
      M.add(pulse(520, 0.08, { duty: 0.5 }), 0, { gain: 0.35, send: 0.1 });
      M.add(bell(1760), 0.12, { gain: 0.35, send: 0.3 });
    }),
  },
  {
    id: 'sfx-heartbeat', title: '心跳', mood: '懸疑', desc: '低沉的兩拍心跳聲，適合緊張、懸疑鋪陳',
    render: () => sfx(1.2, (M) => {
      [0, 0.32].forEach((t, i) => M.add(kick(1.3), t, { gain: i === 0 ? 0.7 : 0.5, bus: 'd', send: 0.05 }));
    }),
  },
  {
    id: 'sfx-chime-transition', title: '轉場鐘聲', mood: '轉場', desc: '一聲清亮鐘聲帶微微回音，適合章節、段落轉換',
    render: () => sfx(1.4, (M) => {
      M.add(bell(1318), 0, { gain: 0.45, send: 0.5 });
      M.add(bell(1976), 0.03, { gain: 0.2, send: 0.5 });
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
