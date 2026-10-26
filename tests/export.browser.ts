import { exportVideo, validateExport } from '../src/lib/exportVideo';
import { waitForReady, supportedExportMimes } from '../src/lib/exportSupport';
import { STICKERS } from '../src/lib/stickers';
import type { ProjectData } from '../src/lib/types';

// Open /tests/export.html through Vite, then click Run. No account or uploaded media required.
const button = document.querySelector<HTMLButtonElement>('#run')!;
const summary = document.querySelector('#summary')!;
const results = document.querySelector('#results')!;
const preview = document.querySelector('#preview')!;
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const canvas = () => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; preview.replaceChildren(c); return c; };
const controller = () => new AbortController();
const options = (signal = controller().signal) => ({ signal, quality: 720 as const, watermark: false, onStage: (s: string) => { summary.textContent = s; }, onProgress: () => {} });
const rejects = async (run: () => unknown, pattern: RegExp) => {
  try { await run(); } catch (error) { assert(pattern.test(String(error)), `錯誤不符預期：${error}`); return; }
  throw new Error('預期應拒絕，但操作成功');
};

function fixture(): ProjectData {
  const c = canvas();
  c.getContext('2d')!.fillStyle = '#e02020'; c.getContext('2d')!.fillRect(0, 0, c.width, c.height);
  const rate = 16000, samples = rate * 2;
  const wav = new ArrayBuffer(44 + samples * 2), view = new DataView(wav);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / rate * 440 * 2 * Math.PI) * 10000, true);
  return { aspect: '16:9', duration: 1, media: [
    { id: 'image', name: '紅色圖片', kind: 'image', url: c.toDataURL(), duration: 2 },
    { id: 'audio', name: '440Hz 音訊', kind: 'audio', url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })), duration: 2 },
  ], clips: [{ id: 'clip', mediaId: 'image', in: 0, out: 1, speed: 1, volume: 1 }],
  audio: [{ id: 'audio', mediaId: 'audio', start: 0, in: 0, out: 1, volume: 1 }], captions: [], stickers: [{ id: 's', stickerId: STICKERS[0].id, start: 0.1, end: 0.6, x: 0.8, y: 0.8, scale: 0.3, rotation: 0, opacity: 1, animation: 'none' }], overlays: [] };
}

button.disabled = false; button.textContent = '執行全部測試';
button.onclick = async () => {
  button.disabled = true; results.replaceChildren(); let passed = 0, failed = 0;
  const run = async (name: string, test: () => unknown) => {
    const li = document.createElement('li'); li.textContent = `測試中：${name}`; results.append(li);
    try { await test(); passed++; li.textContent = `PASS：${name}`; }
    catch (error) { failed++; li.textContent = `FAIL：${name} — ${error}`; }
  };
  const captured: MediaStream[] = [];
  const contexts: AudioContext[] = [];
  const nativeCapture = HTMLCanvasElement.prototype.captureStream;
  const nativeDestination = AudioContext.prototype.createMediaStreamDestination;
  HTMLCanvasElement.prototype.captureStream = function (fps?: number) { const stream = nativeCapture.call(this, fps); captured.push(stream); return stream; };
  AudioContext.prototype.createMediaStreamDestination = function () { contexts.push(this); return nativeDestination.call(this); };
  const data = fixture(); let output: Awaited<ReturnType<typeof exportVideo>> | undefined;
  await run('空專案及遺失素材會明確拒絕', async () => {
    await rejects(() => validateExport({ ...data, clips: [], audio: [], stickers: [] }), /沒有可匯出/);
    await rejects(() => validateExport({ ...data, media: [] }), /遺失/);
    await rejects(() => validateExport({ ...data, clips: [{ ...data.clips[0], speed: 0 }] }), /速度無效/);
  });
  await run('素材等待逾時、錯誤和取消皆可結束', async () => {
    await rejects(() => waitForReady(new EventTarget(), [], () => false, () => false, '測試', undefined, 20), /逾時/);
    const target = new EventTarget();
    const pending = waitForReady(target, [], () => false, () => false, '測試');
    target.dispatchEvent(new Event('error')); await rejects(() => pending, /無法載入/);
    const cancel = controller(); const waiting = waitForReady(new EventTarget(), [], () => false, () => false, '測試', cancel.signal);
    cancel.abort(); await rejects(() => waiting, /AbortError/);
  });
  await run('圖片＋獨立音訊匯出可解碼，尺寸與尾端畫面正確', async () => {
    output = await exportVideo(canvas(), data, options());
    assert(output.blob.size > 1000, '輸出為空');
    const video = document.createElement('video'); const url = URL.createObjectURL(output.blob); video.src = url;
    try {
      await waitForReady(video, ['loadeddata'], () => video.readyState >= 2, () => !!video.error, '輸出');
      assert(video.videoWidth === 320 && video.videoHeight === 180, '影片尺寸錯誤');
      // WebM may report Infinity until it is indexed by the player.
      assert(!Number.isFinite(video.duration) || Math.abs(video.duration - 1) < 0.35, `時長錯誤 ${video.duration}`);
      video.currentTime = 0.9;
      await waitForReady(video, ['seeked'], () => !video.seeking, () => !!video.error, '尾端畫面');
      const c = canvas(); c.getContext('2d')!.drawImage(video, 0, 0); const pixel = c.getContext('2d')!.getImageData(100, 80, 1, 1).data;
      assert(pixel[0] > 150 && pixel[1] < 80, `輸出黑畫面 ${pixel}`);
      const audio = new AudioContext();
      try {
        const decoded = await audio.decodeAudioData(await output.blob.arrayBuffer());
        const energy = decoded.getChannelData(0).reduce((sum, n) => sum + n * n, 0) / decoded.length;
        assert(energy > 0.005, `輸出音訊遺失 ${energy}`);
      } finally { await audio.close(); }
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  });
  await run('影片修剪、相鄰轉場及疊加軌可匯出', async () => {
    assert(output, '先前影片匯出失敗');
    const url = URL.createObjectURL(output!.blob);
    try {
      const project: ProjectData = { ...data, audio: [], media: [{ id: 'v', name: '實錄測試影片', kind: 'video', url, duration: 1 }],
        clips: [{ id: 'a', mediaId: 'v', in: 0.1, out: 0.6, speed: 1, volume: 1 },
          { id: 'b', mediaId: 'v', in: 0.3, out: 0.8, speed: 1, volume: 1, transition: { type: 'fade', duration: 0.15 } }],
        overlays: [{ id: 'o', mediaId: 'v', start: 0.1, in: 0.1, out: 0.6, speed: 1, volume: 0.3, lane: 0, opacity: 0.5 }] };
      const result = await exportVideo(canvas(), project, options()); assert(result.blob.size > 1000, '影片輸出為空');
    } finally { URL.revokeObjectURL(url); }
  });
  await run('1080p 直式畫面保持正確解析度', async () => {
    const c = canvas(); c.width = 1080; c.height = 1920;
    const result = await exportVideo(c, { ...data, aspect: '9:16' }, { ...options(), quality: 1080 });
    assert(result.blob.size > 1000, '1080p 輸出失敗');
  });
  await run('損壞的圖片與音訊在錄製前拒絕', async () => {
    for (const id of ['image', 'audio']) {
      const project = { ...data, media: data.media.map((m) => m.id === id ? { ...m, url: 'data:application/octet-stream;base64,AAAA' } : m) };
      await rejects(() => exportVideo(canvas(), project, options()), /載入|播放失敗/);
    }
  });
  await run('準備階段可立即取消', async () => {
    const cancel = controller(); const pending = exportVideo(canvas(), data, options(cancel.signal)); cancel.abort();
    await rejects(() => pending, /AbortError/);
  });
  await run('錄製階段取消後能再次成功匯出', async () => {
    const cancel = controller(); const pending = exportVideo(canvas(), data, options(cancel.signal));
    setTimeout(() => cancel.abort(), 300); await rejects(() => pending, /AbortError/);
    const result = await exportVideo(canvas(), data, options()); assert(result.blob.size > 1000, '取消後無法重試');
  });
  await run('MP4 啟動失敗時自動備援 WebM', async () => {
    const Native = window.MediaRecorder;
    window.MediaRecorder = class extends Native {
      constructor(stream: MediaStream, config?: MediaRecorderOptions) { if (config?.mimeType?.includes('mp4')) throw new Error('模擬編碼器失敗'); super(stream, config); }
    };
    try { const result = await exportVideo(canvas(), data, options()); assert(result.ext === 'webm' && result.blob.type === 'video/webm', '沒有備援 WebM'); }
    finally { window.MediaRecorder = Native; }
  });
  await run('所有編碼器啟動失敗會顯示錯誤', async () => {
    const Native = window.MediaRecorder;
    window.MediaRecorder = class extends Native { start() { throw new Error('模擬啟動失敗'); } };
    try { await rejects(() => exportVideo(canvas(), data, options()), /編碼器/); }
    finally { window.MediaRecorder = Native; }
  });
  await run('錄製器執行中錯誤會拒絕，不會卡住', async () => {
    const Native = window.MediaRecorder;
    window.MediaRecorder = class extends Native { start(ms?: number) { super.start(ms); setTimeout(() => this.dispatchEvent(new Event('error')), 100); } };
    try { await rejects(() => exportVideo(canvas(), data, options()), /錄製失敗/); }
    finally { window.MediaRecorder = Native; }
  });
  await run('錄製器未回報完成時，逾時後可重試', async () => {
    const Native = window.MediaRecorder;
    window.MediaRecorder = class extends Native { stop() { super.stop(); this.onstop = null; } };
    try { await rejects(() => exportVideo(canvas(), data, options()), /整理逾時/); }
    finally { window.MediaRecorder = Native; }
  });
  await run('切至背景會中止，避免繼續錄製缺格影片', async () => {
    const pending = exportVideo(canvas(), data, options());
    setTimeout(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }, 200);
    try { await rejects(() => pending, /背景/); }
    finally { delete (document as unknown as Record<string, unknown>).visibilityState; }
  });
  await run('5 秒試匯出會截短長專案', async () => {
    const project = { ...data, audio: [], clips: [{ ...data.clips[0], out: 8 }] };
    const result = await exportVideo(canvas(), project, { ...options(), test: true }); assert(result.duration === 5, '沒有截短');
  });
  await run('成功、取消與失敗後，錄製軌道及音訊引擎皆已釋放', async () => {
    await sleep(50);
    assert(captured.length > 0 && captured.every((s) => s.getTracks().every((t) => t.readyState === 'ended')), '仍有錄製軌道未停止');
    assert(contexts.length > 0 && contexts.every((ctx) => ctx.state === 'closed'), '仍有音訊引擎未關閉');
  });
  HTMLCanvasElement.prototype.captureStream = nativeCapture;
  AudioContext.prototype.createMediaStreamDestination = nativeDestination;
  data.media.filter((m) => m.url.startsWith('blob:')).forEach((m) => URL.revokeObjectURL(m.url));
  summary.textContent = `完成：${passed} 通過，${failed} 失敗。支援格式：${supportedExportMimes().join(' / ')}`;
  button.disabled = false;
};
