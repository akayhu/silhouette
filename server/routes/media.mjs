// ---------- 素材靜態檔案、音樂庫、文字朗讀（macOS 系統語音與 BreezyVoice 台灣腔 AI 人聲） ----------
import { Router } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from '../db.mjs';
import { requireAuth, requirePro } from '../helpers.mjs';
import { ROOT, UPLOAD_DIR } from '../env.mjs';
import { ownProject } from './projects.mjs';

const run = promisify(execFile);
const router = Router();

// 自訂聲音的錄音上限：10 秒左右的 16kHz 單聲道 WAV 大約 320KB，20MB 已經很寬裕，
// 避免有人（或用壞的前端）上傳超大檔案把磁碟塞滿
const MAX_VOICE_BYTES = 20 * 1024 * 1024;

// 只讓本人讀取自己的檔案；express.static 會處理 Range，影片才能拖曳播放
router.use('/uploads/:userId', (req, res, next) => {
  if (req.user?.id !== req.params.userId) return res.status(403).end();
  next();
}, (req, res, next) => express.static(path.join(UPLOAD_DIR, req.params.userId))(req, res, next));

// ---------- 音樂庫（scripts/generate-music.mjs 產生的原創音樂，公開讀取） ----------
const MUSIC_DIR = path.join(ROOT, 'music');
router.use('/music', express.static(MUSIC_DIR, { maxAge: '7d' }));
router.get('/api/music', requireAuth, (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(MUSIC_DIR, 'library.json'), 'utf8')));
  } catch {
    res.json({ license: '', items: [] });
  }
});

// ---------- 文字朗讀 ----------
// 兩種引擎：macOS 內建語音（快、機械感）與 BreezyVoice 台灣腔 AI 人聲（自然、較慢，需要 tts/ 下的 Python 環境）

let voiceCache;
async function listSystemVoices() {
  if (voiceCache) return voiceCache;
  try {
    const { stdout } = await run('say', ['-v', '?']);
    voiceCache = stdout
      .split('\n')
      .map((line) => line.match(/^(.+?)\s{2,}(\w\w_\w\w)\s+#\s*(.*)$/))
      .filter((m) => m && /^zh_(TW|CN|HK)$/.test(m[2]))
      .map((m) => ({ id: m[1].trim(), locale: m[2], sample: m[3].trim(), engine: 'system' }))
      .filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i);
  } catch {
    voiceCache = [];
  }
  return voiceCache;
}

const TTS_DIR = path.join(ROOT, '..', 'tts');
const BREEZY_PYTHON = path.join(TTS_DIR, '.venv', 'bin', 'python');
const BREEZY_PORT = 8790;
const breezyAvailable = () => fs.existsSync(BREEZY_PYTHON) && fs.existsSync(path.join(TTS_DIR, 'models', 'BreezyVoice', 'llm.pt'));

function builtinBreezyVoices() {
  try {
    return JSON.parse(fs.readFileSync(path.join(TTS_DIR, 'voices', 'voices.json'), 'utf8')).map((v) => ({
      ...v,
      audio: path.join(TTS_DIR, v.audio),
    }));
  } catch {
    return [];
  }
}

function breezyVoicesFor(userId) {
  const custom = db
    .prepare(`SELECT id, name, prompt_text AS text, file FROM voices WHERE user_id=? ORDER BY created_at`)
    .all(userId)
    .map((v) => ({ id: `custom-${v.id}`, name: v.name, desc: '我的聲音', text: v.text, audio: path.join(UPLOAD_DIR, userId, 'voices', v.file), custom: true }));
  return [...builtinBreezyVoices(), ...custom];
}

router.get('/api/tts/voices', requireAuth, async (req, res) => {
  const breezy = breezyAvailable()
    ? breezyVoicesFor(req.user.id).map((v) => ({ id: v.id, name: v.name, desc: v.desc, locale: 'zh_TW', engine: 'breezy', custom: !!v.custom }))
    : [];
  res.json({ voices: [...breezy, ...(await listSystemVoices())], breezy: breezyAvailable() });
});

// 建立自己的聲音：上傳 16kHz 單聲道 WAV（前端錄音後轉檔），附上朗讀的句子
router.post('/api/voices', requireAuth, requirePro, (req, res) => {
  if (!breezyAvailable()) return res.status(501).json({ error: '尚未安裝台灣腔 AI 語音' });
  const name = decodeURIComponent(String(req.headers['x-voice-name'] || '')).trim().slice(0, 20);
  const text = decodeURIComponent(String(req.headers['x-voice-text'] || '')).trim().slice(0, 200);
  if (!name || !text) return res.status(400).json({ error: '請輸入聲音名稱' });
  if (Number(req.headers['content-length']) > MAX_VOICE_BYTES) return res.status(413).json({ error: '錄音檔太大，請錄短一點' });
  const count = db.prepare(`SELECT COUNT(*) AS n FROM voices WHERE user_id=?`).get(req.user.id).n;
  if (count >= 10) return res.status(400).json({ error: '最多可以建立 10 個聲音' });
  const id = randomUUID();
  const dir = path.join(UPLOAD_DIR, req.user.id, 'voices');
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${id}.part`);
  const out = fs.createWriteStream(temp);
  let size = 0;
  let failed = false;
  const abort = (status, error) => {
    if (failed) return;
    failed = true;
    out.destroy();
    fs.rmSync(temp, { force: true });
    if (!res.headersSent) res.status(status).json({ error });
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_VOICE_BYTES) {
      abort(413, '錄音檔太大，請錄短一點');
      req.destroy();
    }
  });
  req.on('aborted', () => abort(400, '上傳中斷'));
  req.pipe(out);
  out.on('error', () => abort(500, '上傳失敗'));
  out.on('finish', () => {
    if (failed) return;
    if (!size) return abort(400, '沒有收到錄音');
    fs.renameSync(temp, path.join(dir, `${id}.wav`));
    db.prepare(`INSERT INTO voices (id, user_id, name, prompt_text, file, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, req.user.id, name, text, `${id}.wav`, now());
    res.json({ voice: { id: `custom-${id}`, name, desc: '我的聲音', locale: 'zh_TW', engine: 'breezy', custom: true } });
  });
});

router.delete('/api/voices/:id', requireAuth, (req, res) => {
  const id = req.params.id.replace(/^custom-/, '');
  const row = db.prepare(`SELECT * FROM voices WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '找不到這個聲音' });
  db.prepare(`DELETE FROM voices WHERE id=?`).run(id);
  fs.rmSync(path.join(UPLOAD_DIR, req.user.id, 'voices', row.file), { force: true });
  res.json({ ok: true });
});

// ---- BreezyVoice 常駐服務：第一次用到才啟動，閒置 10 分鐘自動關閉以釋放記憶體 ----
let breezyProc = null;
let breezyReady = null;
let breezyIdle = null;

async function breezyHealth() {
  try {
    return await (await fetch(`http://127.0.0.1:${BREEZY_PORT}/health`)).json();
  } catch {
    return null;
  }
}

function ensureBreezy() {
  if (breezyReady) return breezyReady;
  breezyReady = (async () => {
    if (!(await breezyHealth())) {
      breezyProc = spawn(BREEZY_PYTHON, [path.join(TTS_DIR, 'service.py')], {
        env: { ...process.env, BREEZY_PORT: String(BREEZY_PORT), PYTHONUTF8: '1', PYTHONWARNINGS: 'ignore' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      breezyProc.stdout.on('data', (d) => process.stdout.write(`[breezy] ${d}`));
      breezyProc.stderr.on('data', () => {});
      breezyProc.on('exit', () => {
        breezyProc = null;
        breezyReady = null;
      });
    }
    for (let i = 0; i < 180; i++) {
      const h = await breezyHealth();
      if (h?.ready) return;
      if (h?.error) throw new Error('AI 語音模型載入失敗：' + h.error);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('AI 語音模型啟動逾時');
  })().catch((e) => {
    breezyReady = null;
    throw e;
  });
  return breezyReady;
}

function touchBreezy() {
  clearTimeout(breezyIdle);
  breezyIdle = setTimeout(() => {
    if (!jobs.size || [...jobs.values()].every((j) => j.status !== 'running')) breezyProc?.kill();
  }, 10 * 60_000);
}

process.on('exit', () => breezyProc?.kill());

/** 讀出 WAV 的格式與 PCM 資料（say 的輸出可能夾帶其他 chunk，要逐段找） */
function readWav(buf) {
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString('ascii', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(o + 10), sampleRate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('無法解析語音檔');
  return { ...fmt, data };
}

function writeWav(file, { channels, sampleRate, bits }, data) {
  const header = Buffer.alloc(44);
  const blockAlign = (channels * bits) / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

/** 把逐句的 WAV 接成一個檔案，句子之間留一點停頓，回傳每句的起訖秒數 */
function joinSentences(files, texts, outFile, pause = 0) {
  const wavs = files.map((f) => readWav(fs.readFileSync(f)));
  const fmt = wavs[0];
  const bytesPerSec = (fmt.sampleRate * fmt.channels * fmt.bits) / 8;
  const align = (fmt.channels * fmt.bits) / 8;
  const gap = Buffer.alloc(Math.round((pause * bytesPerSec) / align) * align);
  let t = 0;
  const parts = [];
  const segments = wavs.map((w, i) => {
    const start = t;
    t += w.data.length / bytesPerSec;
    parts.push(w.data);
    if (i < wavs.length - 1 && gap.length) {
      parts.push(gap);
      t += gap.length / bytesPerSec;
    }
    return { text: texts[i], start, end: start + w.data.length / bytesPerSec };
  });
  writeWav(outFile, fmt, Buffer.concat(parts));
  return segments;
}

// ---- 朗讀工作：AI 人聲每句要數十秒，改成背景工作，前端輪詢進度 ----
const jobs = new Map();

async function runBreezyJob(job, voice, parts, dir, fileName, userId, projectId) {
  const tmp = parts.map(() => path.join(dir, `.tmp-${randomUUID()}.wav`));
  try {
    job.stage = 'loading';
    await ensureBreezy();
    job.stage = 'speaking';
    for (const [i, text] of parts.entries()) {
      touchBreezy();
      const r = await fetch(`http://127.0.0.1:${BREEZY_PORT}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: [text], prompt_audio: voice.audio, prompt_text: voice.text, output: tmp[i] }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'AI 語音產生失敗');
      job.done = i + 1;
    }
    const segments = joinSentences(tmp, parts, path.join(dir, fileName), 0.18);
    job.result = { url: `/uploads/${userId}/${projectId}/${fileName}`, segments };
    job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  } finally {
    tmp.forEach((f) => fs.rmSync(f, { force: true }));
    touchBreezy();
    setTimeout(() => jobs.delete(job.id), 30 * 60_000);
  }
}

/**
 * 文字朗讀。傳入 segments（已切好的句子）時逐句合成再接成一個檔案，並回傳每句的起訖秒數。
 * 系統語音直接回傳結果；AI 人聲回傳 jobId，用 GET /api/tts/jobs/:id 查進度。
 */
router.post('/api/projects/:id/tts', requireAuth, requirePro, async (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const parts = (Array.isArray(req.body.segments) ? req.body.segments : [req.body.text])
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .slice(0, 200);
  if (!parts.length || parts.join('').length > 2000) return res.status(400).json({ error: '請輸入 1～2000 字的朗讀文字' });
  const dir = path.join(UPLOAD_DIR, req.user.id, row.id);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `tts-${randomUUID()}.wav`;

  const breezyVoice = breezyAvailable() ? breezyVoicesFor(req.user.id).find((v) => v.id === req.body.voice) : null;
  if (breezyVoice) {
    const job = { id: randomUUID(), userId: req.user.id, status: 'running', stage: 'queued', done: 0, total: parts.length };
    jobs.set(job.id, job);
    runBreezyJob(job, breezyVoice, parts, dir, fileName, req.user.id, row.id);
    return res.json({ jobId: job.id, total: parts.length });
  }

  const voices = await listSystemVoices();
  if (!voices.length) return res.status(501).json({ error: '這台電腦沒有可用的中文語音（需要 macOS）' });
  const voice = voices.find((v) => v.id === req.body.voice)?.id ?? voices[0].id;
  const rate = Math.min(360, Math.max(90, Number(req.body.rate) || 180));
  const tmp = parts.map(() => path.join(dir, `.tmp-${randomUUID()}.wav`));
  try {
    await Promise.all(
      parts.map((t, i) => run('say', ['-v', voice, '-r', String(rate), '-o', tmp[i], '--file-format=WAVE', '--data-format=LEI16@44100', t])),
    );
    const segments = joinSentences(tmp, parts, path.join(dir, fileName));
    res.json({ url: `/uploads/${req.user.id}/${row.id}/${fileName}`, voice, segments });
  } catch (err) {
    res.status(500).json({ error: '語音產生失敗：' + err.message });
  } finally {
    tmp.forEach((f) => fs.rmSync(f, { force: true }));
  }
});

router.get('/api/tts/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.userId !== req.user.id) return res.status(404).json({ error: '找不到這個工作' });
  const { userId, ...rest } = job;
  res.json(rest);
});

export default router;
