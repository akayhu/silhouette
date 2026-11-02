// 測試共用：啟動一個全新、獨立資料庫的伺服器子行程，給會打真的 API 的整合測試用。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

/**
 * 啟動測試伺服器，回傳：
 * - request(url, body?, method?)：帶著目前 cookie 呼叫 API，回應裡的 Set-Cookie 會自動記起來給下一次呼叫用
 * - findLink(pathPrefix)：從伺服器印出的 log 找連結（沒設定 RESEND_API_KEY 時，驗證信／重設密碼信只會印出來，不會真的寄）
 * - db：直接開同一個 sqlite 檔案，方便測試時造資料（例如把使用者升級成管理者）
 * - stop()：關閉伺服器、刪掉暫存資料夾
 */
export async function startTestServer() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'silhouette-test-'));
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('../../', import.meta.url),
    env: { ...process.env, PORT: '0', SILHOUETTE_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  let base;
  for (let i = 0; i < 100; i++) {
    const match = output.match(/http:\/\/localhost:(\d+)/);
    if (match) { base = `http://127.0.0.1:${match[1]}`; break; }
    if (child.exitCode !== null) throw new Error('測試伺服器啟動失敗：' + output);
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!base) throw new Error('測試伺服器未啟動：' + output);

  let cookie = '';
  async function request(url, body, method = body === undefined ? 'GET' : 'POST') {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return res;
  }

  // 回傳「最新一次」符合的連結 token：同一個 path 可能在測試過程中印出好幾次（多個使用者各自註冊／重設密碼）
  async function findLink(pathPrefix) {
    const re = new RegExp(`${pathPrefix.replace(/\//g, '\\/')}\\?token=([0-9a-f]+)`, 'g');
    for (let i = 0; i < 100; i++) {
      const matches = [...output.matchAll(re)];
      if (matches.length) return matches.at(-1)[1];
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`沒有在伺服器輸出裡找到 ${pathPrefix} 的連結\n${output}`);
  }

  const db = new DatabaseSync(path.join(dataDir, 'app.db'));

  async function stop() {
    db.close();
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dataDir, { recursive: true, force: true });
  }

  return { base, request, findLink, db, stop, get output() { return output; } };
}
