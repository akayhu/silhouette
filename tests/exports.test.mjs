// 匯出成品上傳：1080p 高畫質是專業版功能，伺服器端也要擋，不能只靠前端 UI
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

const exportMeta = (quality) => ({
  ext: 'mp4', width: 1280, height: 720, quality, fps: 30, bitrate: 'standard', duration: 5, mode: 'offline',
});

const upload = (server, projectId, meta) =>
  fetch(`${server.base}/api/projects/${projectId}/exports`, {
    method: 'POST',
    headers: { Cookie: server.cookie, 'X-Export-Meta': encodeURIComponent(JSON.stringify(meta)) },
    body: new Uint8Array([1, 2, 3, 4]),
  });

test('免費版帳號不能繞過前端把 1080p 匯出存進帳戶', async () => {
  const server = await startTestServer();
  try {
    const email = 'export-test@example.test';
    await server.request('/api/auth/register', { email, password: 'test-password-123', name: '匯出測試' });
    const token = await server.findLink('/api/auth/verify');
    await server.request(`/api/auth/verify?token=${token}`);
    // 驗證完成會有 7 天試用（plan='pro'），改成一般免費版才能測到真正的擋下
    const userId = server.db.prepare(`SELECT id FROM users WHERE email=?`).get(email).id;
    server.db.prepare(`UPDATE users SET plan='free', plan_source=NULL WHERE id=?`).run(userId);
    const project = (await (await server.request('/api/projects', { name: '匯出測試專案', aspect: '9:16' })).json()).project;

    // 720p 正常放行
    const ok720 = await upload(server, project.id, exportMeta(720));
    assert.equal(ok720.status, 200);
    assert.equal((await ok720.json()).export.quality, 720);

    // 1080p 被擋下（免費版）
    const blocked1080 = await upload(server, project.id, exportMeta(1080));
    assert.equal(blocked1080.status, 402);
    assert.equal((await blocked1080.json()).code, 'UPGRADE_REQUIRED');
    const list = await (await server.request(`/api/projects/${project.id}/exports`)).json();
    assert.ok(!list.exports.some((e) => e.quality === 1080));

    // 升級成專業版後，1080p 就能正常存
    server.db.prepare(`UPDATE users SET plan='pro' WHERE id=?`).run(userId);
    const ok1080 = await upload(server, project.id, exportMeta(1080));
    assert.equal(ok1080.status, 200);
  } finally {
    await server.stop();
  }
});
