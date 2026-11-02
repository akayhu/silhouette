// ---------- 專案與匯出的成品（存到帳戶，每個專案只留最近幾支） ----------
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from '../db.mjs';
import { requireAuth, publicUser } from '../helpers.mjs';
import { UPLOAD_DIR, FREE_MONTHLY_PROJECTS } from '../env.mjs';

const router = Router();

const projectRow = (r, withData = false) => ({
  id: r.id,
  name: r.name,
  thumbnail: r.thumbnail,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(withData ? { data: JSON.parse(r.data) } : { aspect: JSON.parse(r.data).aspect, duration: JSON.parse(r.data).duration ?? 0 }),
});

router.get('/api/projects', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC`).all(req.user.id);
  res.json({ projects: rows.map((r) => projectRow(r)) });
});

router.post('/api/projects', requireAuth, (req, res) => {
  const user = publicUser(req.user);
  if (user.usage.projectLimit !== null && user.usage.projectsThisMonth >= user.usage.projectLimit) {
    return res.status(402).json({ error: `免費版每月最多建立 ${FREE_MONTHLY_PROJECTS} 個專案`, code: 'UPGRADE_REQUIRED' });
  }
  const id = randomUUID();
  const aspect = ['9:16', '16:9', '1:1'].includes(req.body.aspect) ? req.body.aspect : '9:16';
  const data = { aspect, media: [], clips: [], audio: [], captions: [], stickers: [], overlays: [], markers: [], duration: 0 };
  const name = String(req.body.name || '').trim().slice(0, 100) || '未命名專案';
  db.prepare(`INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, req.user.id, name, JSON.stringify(data), now(), now(),
  );
  db.prepare(`INSERT INTO project_creations (user_id, created_at) VALUES (?, ?)`).run(req.user.id, now());
  res.json({ project: projectRow(db.prepare(`SELECT * FROM projects WHERE id=?`).get(id), true) });
});

export function ownProject(req, res) {
  const row = db.prepare(`SELECT * FROM projects WHERE id=? AND user_id=?`).get(req.params.id, req.user.id);
  if (!row) res.status(404).json({ error: '找不到這個專案' });
  return row;
}

router.get('/api/projects/:id', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (row) res.json({ project: projectRow(row, true) });
});

router.patch('/api/projects/:id', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  if (req.body.expectedUpdatedAt !== undefined && typeof req.body.expectedUpdatedAt !== 'string') {
    return res.status(400).json({ error: '專案版本無效' });
  }
  if (req.body.expectedUpdatedAt !== undefined && req.body.expectedUpdatedAt !== row.updated_at) {
    return res.status(409).json({ error: '專案已被其他分頁或裝置更新', code: 'PROJECT_CONFLICT' });
  }
  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 100) || row.name : row.name;
  const data = req.body.data !== undefined ? JSON.stringify(req.body.data) : row.data;
  const thumbnail = req.body.thumbnail !== undefined ? req.body.thumbnail : row.thumbnail;
  // Monotonic tokens also distinguish two writes received within the same millisecond.
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
  const result = db.prepare(`UPDATE projects SET name=?, data=?, thumbnail=?, updated_at=? WHERE id=? AND updated_at=?`).run(name, data, thumbnail, updatedAt, row.id, row.updated_at);
  if (!result.changes) return res.status(409).json({ error: '專案已被更新', code: 'PROJECT_CONFLICT' });
  if (req.body.data !== undefined) cleanUnusedFiles(req.user.id, row.id, req.body.data);
  res.json({ project: projectRow(db.prepare(`SELECT * FROM projects WHERE id=?`).get(row.id)) });
});

router.delete('/api/projects/:id', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  db.prepare(`DELETE FROM projects WHERE id=?`).run(row.id);
  db.prepare(`DELETE FROM exports WHERE project_id=?`).run(row.id);
  fs.rmSync(path.join(UPLOAD_DIR, req.user.id, row.id), { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- 素材 ----------
// 本機優先：使用者的影片、圖片、音樂只存在自己的電腦，伺服器不再接收素材上傳。
// 伺服器上只剩朗讀產生的音訊（前端拿到後會存到本機）與改版前上傳的舊素材；
// 專案存檔時，刪掉專案資料夾裡不再被使用的檔案。
const UNUSED_GRACE_MS = 10 * 60 * 1000;

function cleanUnusedFiles(userId, projectId, data) {
  const dir = path.join(UPLOAD_DIR, userId, projectId);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const prefix = `/uploads/${userId}/${projectId}/`;
  const used = new Set((data?.media ?? []).map((m) => (typeof m?.url === 'string' && m.url.startsWith(prefix) ? m.url.slice(prefix.length) : null)).filter(Boolean));
  const t = Date.now();
  for (const e of entries) {
    // 只看專案資料夾第一層的檔案（exports 等子資料夾另外管理）
    if (!e.isFile() || used.has(e.name)) continue;
    const file = path.join(dir, e.name);
    try {
      // 剛產生的檔案（例如朗讀結果還沒下載到本機）先不刪
      if (t - fs.statSync(file).mtimeMs > UNUSED_GRACE_MS) fs.rmSync(file, { force: true });
    } catch {
      /* 刪不掉下次存檔再試 */
    }
  }
}

// ---------- 匯出的成品（存到帳戶，每個專案只留最近幾支） ----------
const EXPORTS_PER_PROJECT = 3;
const MAX_EXPORT_BYTES = 2 * 1024 ** 3;

const exportRow = (r) => ({
  ...JSON.parse(r.meta),
  id: r.id,
  size: r.size,
  createdAt: r.created_at,
  url: `/uploads/${r.user_id}/${r.project_id}/exports/${r.file}`,
});

/** 只接受匯出視窗會送的欄位，避免任意內容寫進資料庫 */
function exportMeta(raw) {
  let m;
  try {
    m = JSON.parse(decodeURIComponent(String(raw || '')));
  } catch {
    return null;
  }
  const num = (v, min, max) => (Number.isFinite(v) && v >= min && v <= max ? v : null);
  const meta = {
    ext: ['mp4', 'webm'].includes(m?.ext) ? m.ext : null,
    width: num(m?.width, 16, 8192),
    height: num(m?.height, 16, 8192),
    quality: [720, 1080].includes(m?.quality) ? m.quality : null,
    fps: [24, 30, 60].includes(m?.fps) ? m.fps : null,
    bitrate: ['high', 'standard', 'small'].includes(m?.bitrate) ? m.bitrate : null,
    duration: num(m?.duration, 0, 24 * 3600),
    mode: ['offline', 'realtime'].includes(m?.mode) ? m.mode : null,
  };
  return Object.values(meta).every((v) => v !== null) ? meta : null;
}

router.get('/api/projects/:id/exports', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const rows = db.prepare(`SELECT * FROM exports WHERE project_id=? AND user_id=? ORDER BY created_at DESC`).all(row.id, req.user.id);
  res.json({ exports: rows.map(exportRow) });
});

router.post('/api/projects/:id/exports', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const meta = exportMeta(req.headers['x-export-meta']);
  if (!meta) return res.status(400).json({ error: '匯出資訊不完整' });
  if (Number(req.headers['content-length']) > MAX_EXPORT_BYTES) return res.status(413).json({ error: '影片太大，無法存到帳戶' });
  const id = randomUUID();
  const dir = path.join(UPLOAD_DIR, req.user.id, row.id, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const file = `${id}.${meta.ext}`;
  const temp = path.join(dir, `${id}.part`);
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
    if (size > MAX_EXPORT_BYTES) {
      abort(413, '影片太大，無法存到帳戶');
      req.destroy();
    }
  });
  req.on('aborted', () => abort(400, '上傳中斷'));
  req.pipe(out);
  out.on('error', () => abort(500, '儲存失敗'));
  out.on('finish', () => {
    if (failed) return;
    if (!size) return abort(400, '沒有收到影片');
    fs.renameSync(temp, path.join(dir, file));
    db.prepare(`INSERT INTO exports (id, user_id, project_id, file, meta, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user.id, row.id, file, JSON.stringify(meta), size, now(),
    );
    // 超過數量就刪掉最舊的
    const old = db.prepare(`SELECT * FROM exports WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT -1 OFFSET ?`).all(row.id, req.user.id, EXPORTS_PER_PROJECT);
    for (const o of old) {
      db.prepare(`DELETE FROM exports WHERE id=?`).run(o.id);
      fs.rmSync(path.join(dir, o.file), { force: true });
    }
    res.json({ export: exportRow(db.prepare(`SELECT * FROM exports WHERE id=?`).get(id)) });
  });
});

router.delete('/api/projects/:id/exports/:exportId', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const ex = db.prepare(`SELECT * FROM exports WHERE id=? AND project_id=? AND user_id=?`).get(req.params.exportId, row.id, req.user.id);
  if (!ex) return res.status(404).json({ error: '找不到這支影片' });
  db.prepare(`DELETE FROM exports WHERE id=?`).run(ex.id);
  fs.rmSync(path.join(UPLOAD_DIR, req.user.id, row.id, 'exports', ex.file), { force: true });
  res.json({ ok: true });
});

export default router;
