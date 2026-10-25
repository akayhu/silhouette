// 產生示範會員與付款紀錄，讓後台圖表有資料可看（只用在本機開發）
// 用法：npm run seed-demo          產生近 30 天的示範資料
//       npm run seed-demo -- --clean  移除所有示範資料
// 示範會員的 Email 都是 @demo.silhouette.test，付款紀錄卡號末四碼標成 demo，方便辨識與清除
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'app.db'));
const DOMAIN = '@demo.silhouette.test';

const demoIds = db.prepare(`SELECT id FROM users WHERE email LIKE ?`).all(`%${DOMAIN}`).map((r) => r.id);
for (const id of demoIds) db.prepare(`DELETE FROM users WHERE id=?`).run(id);
db.prepare(`DELETE FROM payments WHERE card_last4='demo'`).run();
if (process.argv.includes('--clean')) {
  console.log(`已移除 ${demoIds.length} 位示範會員與示範付款紀錄。`);
  process.exit(0);
}

// 固定亂數種子，每次產生的資料都一樣
let seed = 20261025;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const surnames = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周';
const given = ['小美', '志明', '雅婷', '冠宇', '怡君', '家豪', '佩珊', '承翰', '詩涵', '宗翰', '欣怡', '俊傑', '宜蓁', '柏翰', '品妤'];
const salt = randomBytes(16).toString('hex');
const hash = `${salt}:${scryptSync(randomBytes(12).toString('hex'), salt, 64).toString('hex')}`; // 示範帳號無法登入

const DAY = 86400_000;
const today = Date.now();
let users = 0;
let payments = 0;
for (let d = 29; d >= 0; d--) {
  // 越接近今天註冊越多，模擬成長
  const signups = Math.floor(1 + rand() * 3 + (29 - d) / 8);
  for (let i = 0; i < signups; i++) {
    const created = new Date(today - d * DAY - rand() * DAY * 0.9);
    const id = randomUUID();
    const paid = rand() < 0.38;
    const name = surnames[Math.floor(rand() * surnames.length)] + given[Math.floor(rand() * given.length)];
    const renews = new Date(created.getTime() + 30 * DAY).toISOString();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, plan, plan_source, plan_renews_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, `user${users + 1}${DOMAIN}`, name, hash, paid ? 'pro' : 'free', paid ? 'paid' : null, paid ? renews : null, created.toISOString());
    users++;
    if (paid) {
      const payAt = new Date(created.getTime() + rand() * Math.min(d, 3) * DAY);
      db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, 'demo', ?)`).run(randomUUID(), id, 399, payAt.toISOString());
      payments++;
    }
  }
}
console.log(`已產生 ${users} 位示範會員、${payments} 筆示範付款（近 30 天）。移除：npm run seed-demo -- --clean`);
