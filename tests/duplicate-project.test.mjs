// 複製專案：本機素材保留原 id 共用；伺服器端儲存的檔案（例如朗讀音訊）要真的複製一份，
// 網址也要改指到新專案，不然原專案被刪除後複製出來的專案就會壞掉；也要算進本月建立額度
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer } from './helpers/server.mjs';

test('複製專案：本機素材共用、伺服器檔案另外複製一份、算入本月額度', async () => {
  const server = await startTestServer();
  try {
    const email = 'duplicate-test@example.test';
    await server.request('/api/auth/register', { email, password: 'test-password-123', name: '複製測試' });
    const token = await server.findLink('/api/auth/verify');
    await server.request(`/api/auth/verify?token=${token}`);
    const userId = server.db.prepare(`SELECT id FROM users WHERE email=?`).get(email).id;

    const created = (await (await server.request('/api/projects', { name: '原始專案', aspect: '9:16' })).json()).project;

    // 模擬一個伺服器端儲存的檔案（朗讀產生的音訊）已經存在原專案資料夾裡
    const ttsDir = path.join(server.dataDir, 'uploads', userId, created.id);
    fs.mkdirSync(ttsDir, { recursive: true });
    fs.writeFileSync(path.join(ttsDir, 'tts-abc.wav'), 'fake-audio-bytes');
    const data = {
      ...created.data,
      media: [
        { id: 'local-1', local: true, url: 'blob:local-only' },
        { id: 'tts-1', local: false, url: `/uploads/${userId}/${created.id}/tts-abc.wav` },
      ],
    };
    await server.request(`/api/projects/${created.id}`, { data, expectedUpdatedAt: created.updatedAt }, 'PATCH');

    const dup = await server.request(`/api/projects/${created.id}/duplicate`, undefined, 'POST');
    assert.equal(dup.status, 200);
    const project = (await dup.json()).project;
    assert.equal(project.name, '原始專案（複製）');
    assert.notEqual(project.id, created.id);

    // 本機素材保留原 id／網址共用，不用複製（本來就只存在使用者自己的電腦）
    const localMedia = project.data.media.find((m) => m.id === 'local-1');
    assert.equal(localMedia.url, 'blob:local-only');

    // 伺服器檔案的網址改指到新專案，而且檔案真的被複製了一份
    const ttsMedia = project.data.media.find((m) => m.id === 'tts-1');
    assert.equal(ttsMedia.url, `/uploads/${userId}/${project.id}/tts-abc.wav`);
    const copied = fs.readFileSync(path.join(server.dataDir, 'uploads', userId, project.id, 'tts-abc.wav'), 'utf8');
    assert.equal(copied, 'fake-audio-bytes');

    // 複製後，刪除原專案不會影響複製出來那份（檔案已經是獨立的一份）
    await server.request(`/api/projects/${created.id}`, undefined, 'DELETE');
    assert.ok(fs.existsSync(path.join(server.dataDir, 'uploads', userId, project.id, 'tts-abc.wav')));

    // 免費版超過本月額度時，複製也會跟新增專案一樣被擋下
    server.db.prepare(`UPDATE users SET plan='free', plan_source=NULL WHERE id=?`).run(userId);
    for (let i = 0; i < 3; i++) await server.request('/api/projects', { name: `額度測試 ${i}`, aspect: '9:16' });
    const blocked = await server.request(`/api/projects/${project.id}/duplicate`, undefined, 'POST');
    assert.equal(blocked.status, 402);
    assert.equal((await blocked.json()).code, 'UPGRADE_REQUIRED');
  } finally {
    await server.stop();
  }
});
