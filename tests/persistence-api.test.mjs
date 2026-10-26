import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('project saves use atomic version checks without changing other project data', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'silhouette-save-test-'));
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', SILHOUETTE_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', (d) => { output += d; }); child.stderr.on('data', (d) => { output += d; });
  let base;
  let cookie = '';
  const request = (url, body, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  try {
    for (let i = 0; i < 100; i++) {
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { base = `http://127.0.0.1:${match[1]}`; break; }
      if (child.exitCode !== null) throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(base, '測試伺服器未啟動');
    const register = await request('/api/auth/register', { email: 'save-test@example.test', password: 'test-only-password-123', name: '儲存測試' });
    assert.equal(register.status, 200); cookie = register.headers.get('set-cookie').split(';')[0];
    const created = await (await request('/api/projects', { name: '原始版本', aspect: '9:16' })).json();
    const project = created.project;
    const patch = (body) => request(`/api/projects/${project.id}`, body, 'PATCH');
    const first = await patch({ name: '第一次儲存', data: project.data, expectedUpdatedAt: project.updatedAt });
    assert.equal(first.status, 200); const saved = (await first.json()).project;
    assert.ok(saved.updatedAt > project.updatedAt);
    const stale = await patch({ name: '過期分頁', expectedUpdatedAt: project.updatedAt });
    assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'PROJECT_CONFLICT');
    const current = await (await fetch(`${base}/api/projects/${project.id}`, { headers: { Cookie: cookie } })).json();
    assert.equal(current.project.name, '第一次儲存'); assert.deepEqual(current.project.data, project.data);
    const simultaneous = await Promise.all([patch({ name: '分頁 A', expectedUpdatedAt: saved.updatedAt }), patch({ name: '分頁 B', expectedUpdatedAt: saved.updatedAt })]);
    assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 409]);
    const invalid = await patch({ name: '無效版本', expectedUpdatedAt: 123 }); assert.equal(invalid.status, 400);
    const unauthorized = await fetch(`${base}/api/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '未登入' }) });
    assert.equal(unauthorized.status, 401);
  } finally {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await rm(dataDir, { recursive: true, force: true });
  }
});
