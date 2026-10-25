// 建立管理者帳號（或把現有會員升級為管理者）
// 用法：npm run create-admin -- --email admin@example.com [--password 密碼] [--name 名稱]
// 沒有指定密碼時會自動產生一組，並寫到 server/data/admin-credentials.txt（不會上傳 GitHub）
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, cur, i, all) => (cur.startsWith('--') ? [...pairs, [cur.slice(2), all[i + 1]]] : pairs), []),
);
const email = String(args.email || '').trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error('請用 --email 指定管理者的 Email，例如：npm run create-admin -- --email admin@example.com');
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error('找不到資料庫，請先執行一次 npm run dev 讓後端建立資料庫。');
  process.exit(1);
}

const generated = !args.password;
const password = args.password || randomBytes(9).toString('base64url');
if (password.length < 8) {
  console.error('密碼至少需要 8 個字元');
  process.exit(1);
}
const name = String(args.name || '管理者');
const salt = randomBytes(16).toString('hex');
const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;

const db = new DatabaseSync(DB_PATH);
const columns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (!columns.includes('role')) db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
if (!columns.includes('plan_source')) db.exec(`ALTER TABLE users ADD COLUMN plan_source TEXT`);

const existing = db.prepare(`SELECT id FROM users WHERE email=?`).get(email);
if (existing) {
  db.prepare(`UPDATE users SET role='admin', password_hash=? WHERE id=?`).run(hash, existing.id);
  console.log(`已把 ${email} 升級為管理者，並重設密碼。`);
} else {
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)`).run(
    randomUUID(), email, name, hash, new Date().toISOString(),
  );
  console.log(`已建立管理者帳號 ${email}。`);
}

if (generated) {
  const file = path.join(DATA_DIR, 'admin-credentials.txt');
  fs.appendFileSync(file, `${new Date().toISOString()}\nEmail：${email}\n密碼：${password}\n\n`, { mode: 0o600 });
  console.log(`已自動產生密碼，寫在 ${path.relative(ROOT, file)}（這個資料夾不會上傳 GitHub）。登入後台後建議到帳戶設定改密碼。`);
}
console.log('後台網址：http://localhost:5173/admin');
