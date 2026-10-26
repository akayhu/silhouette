import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TextPanel } from '../src/editor/panels/TextPanel';
import { ToastProvider } from '../src/components/ui';
import { useEditor } from '../src/editor/store';
import { defaultCaptionStyle, splitCaptionAt } from '../src/lib/timeline';
import { parseSubtitles } from '../src/lib/captions';
import type { Caption, ProjectData } from '../src/lib/types';
import '../src/index.css';
const host = document.querySelector('#sandbox')!;
const list = document.querySelector('#results')!;
const summary = document.querySelector('#summary')!;
const runButton = document.querySelector<HTMLButtonElement>('#run')!;
const root = createRoot(host);
const sleep = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const until = async (test: () => boolean) => { const end = Date.now() + 3000; while (!test()) { if (Date.now() > end) throw new Error('等待逾時'); await sleep(); } };
const field = (label: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
async function set(label: string, value: string) {
  const element = field(label); assert(element, `沒有欄位 ${label}`);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  flushSync(() => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
  await sleep();
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text); assert(button, '沒有按鈕 ' + text);
  flushSync(() => button!.click()); await sleep();
}
const caption = (id: string, start: number, text: string, role?: 'flower'): Caption => ({ id, start, end: start + 2, text, style: defaultCaptionStyle(), ...(role ? { role } : {}) });
const fixture = (): ProjectData => ({ aspect: '9:16', duration: 8, media: [], clips: [], audio: [], stickers: [], overlays: [], captions: [caption('a', 1, '你好台北'), caption('b', 3, 'Mac Book 好好用'), caption('c', 5, '第二次來台北'), caption('flower', 1, '台北花字', 'flower')] });
let seeks: number[] = [];
function mount(data = fixture()) {
  flushSync(() => root.render(null));
  useEditor.getState().load('caption-test-' + crypto.randomUUID(), '字幕測試', data); seeks = [];
  flushSync(() => root.render(<StrictMode><ToastProvider><TextPanel seek={(t) => seeks.push(t)} /></ToastProvider></StrictMode>));
}
async function upload(text: string, name = 'test.srt') {
  const file = new File([text], name, { type: 'text/plain' });
  const transfer = new DataTransfer(); transfer.items.add(file);
  const input = field('匯入字幕檔') as HTMLInputElement; input.files = transfer.files;
  flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true }))); await sleep();
}
const ordinary = () => useEditor.getState().data.captions.filter((c) => c.role !== 'flower');
const srt = '1\n00:00:01,250 --> 00:00:02,500\n匯入第一句\n\n2\n00:00:03,000 --> 00:00:04,000\n匯入第二句';
runButton.disabled = false; runButton.textContent = '執行全部測試';
runButton.onclick = async () => {
  runButton.disabled = true; list.replaceChildren(); let passed = 0, failed = 0;
  const run = async (name: string, test: () => unknown) => {
    const li = document.createElement('li'); li.textContent = '測試中：' + name; list.append(li);
    try { await test(); passed++; li.textContent = 'PASS：' + name; }
    catch (e) { failed++; li.textContent = `FAIL：${name} — ${e}`; }
  };
  await run('搜尋與批次取代預設排除花字，修改可一次復原', async () => {
    mount(); await set('搜尋字幕', '台北'); assert(host.querySelectorAll('textarea[aria-label$="字幕文字"]').length === 2, '搜尋數量錯誤');
    await set('取代文字', '臺北'); await click('全部取代');
    assert(ordinary().filter((c) => c.text.includes('臺北')).length === 2, '沒有批次取代'); assert(useEditor.getState().data.captions.find((c) => c.role === 'flower')!.text === '台北花字', '更動花字');
    assert(useEditor.getState().past.length === 1 && useEditor.getState().save === 'dirty', '未接上復原與儲存');
    flushSync(() => useEditor.getState().undo()); assert(ordinary()[0].text === '你好台北', '無法復原');
  });
  await run('選取範圍僅修改勾選項目，不受其他頁或花字影響', async () => {
    mount(); const checkbox = field('勾選第 1 句') as HTMLInputElement; flushSync(() => checkbox.click());
    await set('字幕操作範圍', 'selected'); await set('搜尋字幕', '台北'); await set('取代文字', '臺北'); await click('全部取代');
    assert(ordinary()[0].text.includes('臺北') && ordinary()[2].text.includes('台北'), '未限定選取範圍');
  });
  await run('勾選相鄰字幕可合併，復原後文字與時間完整', async () => {
    mount(); flushSync(() => (field('勾選第 1 句') as HTMLInputElement).click()); flushSync(() => (field('勾選第 2 句') as HTMLInputElement).click()); await sleep();
    await click('合併勾選 2 句'); assert(ordinary().length === 2 && ordinary()[0].text === '你好台北\nMac Book 好好用', '合併錯誤');
    flushSync(() => useEditor.getState().undo()); assert(ordinary().length === 3 && ordinary()[1].start === 3, '復原錯誤');
  });
  await run('依文字游標拆句，同時分配文字與時間', async () => {
    mount(); const textarea = field('第 1 句字幕文字') as HTMLTextAreaElement; textarea.focus(); textarea.setSelectionRange(2, 2);
    await click('依游標拆句'); assert(ordinary().length === 4 && ordinary()[0].text === '你好' && ordinary()[1].text === '台北', '文字未拆開');
    assert(ordinary()[0].end === 2 && ordinary()[1].start === 2, '時間未分配');
    const d = fixture(); const split = splitCaptionAt(d, 'a', 2); assert(split.captions[0].text === '你好' && split.captions[1].text === '台北', '時間軸分割仍複製整句');
  });
  await run('批次平移保持時長，負數超出零點時不修改任何字幕', async () => {
    mount(); host.querySelector('details')!.open = true; await set('批次平移秒數', '-2'); await click('平移秒數'); assert(ordinary()[0].start === 1, '錯誤平移有部分套用');
    await set('批次平移秒數', '0.125'); await click('平移秒數'); assert(ordinary()[0].start === 1.125 && ordinary()[0].end === 3.125, '平移時間不正確');
    assert(useEditor.getState().data.captions.find((c) => c.role === 'flower')!.start === 1, '移動花字');
  });
  await run('單句時間欄位支援毫秒，反向時間不會寫入', async () => {
    mount(); const time = field('第 1 句開始時間') as HTMLInputElement; time.focus(); await set('第 1 句開始時間', '1.250'); flushSync(() => time.blur()); await sleep(); assert(ordinary()[0].start === 1.25, '毫秒未寫入');
    const end = field('第 1 句結束時間') as HTMLInputElement; end.focus(); await set('第 1 句結束時間', '0.5'); flushSync(() => end.blur()); await sleep(); assert(ordinary()[0].end === 3, '反向時間寫入');
  });
  await run('Enter 移至下一句並跳轉預覽，輸入後可復原', async () => {
    mount(); const text = field('第 1 句字幕文字') as HTMLTextAreaElement; text.focus(); await set('第 1 句字幕文字', '修改一句');
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(80);
    assert(document.activeElement === field('第 2 句字幕文字') && seeks.includes(3), '未移至下一句');
    flushSync(() => useEditor.getState().undo()); assert(ordinary()[0].text === '你好台北', '輸入無法復原');
  });
  await run('中文輸入法確認字詞時，Enter 不會跳走或拆句', async () => {
    mount(); const text = field('第 1 句字幕文字') as HTMLTextAreaElement; text.focus();
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); await sleep();
    assert(document.activeElement === text, '輸入法確認時跳到下一句');
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })); await sleep();
    assert(document.activeElement === text && ordinary().length === 3, '未處理輸入法 229 事件');
  });
  await run('批次樣式僅套用指定範圍，且可以復原', async () => {
    mount(); host.querySelector('details')!.open = true;
    flushSync(() => (field('勾選第 1 句') as HTMLInputElement).click());
    await set('字幕操作範圍', 'selected'); await set('批次字幕樣式', '1'); await click('套用樣式');
    assert(ordinary()[0].style.color === '#ffe14a' && ordinary()[1].style.color === '#ffffff', '樣式套用範圍錯誤');
    flushSync(() => useEditor.getState().undo()); assert(ordinary()[0].style.color === '#ffffff', '樣式不能復原');
  });
  await run('人名與品牌字典可隨專案儲存，套用後可復原', async () => {
    mount(); [...host.querySelectorAll('details')].find((d) => d.textContent?.includes('人名與品牌校正字典'))!.open = true;
    await set('字幕校正字典', 'Mac Book => MacBook\n台北 => 臺北'); await click('儲存字典');
    assert(useEditor.getState().data.captionDictionary?.length === 2, '字典未儲存'); await click('套用已儲存字典');
    assert(ordinary()[1].text === 'MacBook 好好用', '字典未套用'); flushSync(() => useEditor.getState().undo()); assert(ordinary()[1].text === 'Mac Book 好好用', '字典修改不能復原');
  });
  await run('匯入先預覽，取代一般字幕時保留花字並可復原', async () => {
    mount(); await upload(srt); await until(() => host.textContent!.includes('確認匯入字幕')); assert(ordinary().length === 3, '確認前就寫入');
    const replace = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1]; flushSync(() => replace.click()); await click('確認匯入');
    assert(ordinary().length === 2 && ordinary()[0].start === 1.25 && useEditor.getState().data.captions.some((c) => c.role === 'flower'), '匯入取代錯誤');
    flushSync(() => useEditor.getState().undo()); assert(ordinary().length === 3 && ordinary()[0].text === '你好台北', '匯入不能復原');
  });
  await run('損壞或不支援編碼的字幕檔會拒絕，不修改專案', async () => {
    mount(); await upload('1\n00:99:01,000 --> 00:99:02,000\n錯誤'); await sleep(); assert(ordinary().length === 3 && !host.textContent!.includes('確認匯入字幕'), '錯誤檔案被匯入');
    const bad = new File([new Uint8Array([0xff, 0xfe, 0x00])], 'bad.srt'); const transfer = new DataTransfer(); transfer.items.add(bad); const input = field('匯入字幕檔') as HTMLInputElement; input.files = transfer.files;
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(); assert(host.textContent!.includes('UTF-8'), '未回報編碼錯誤');
  });
  await run('匯出符合範圍的 SRT／VTT，內容可重新讀取', async () => {
    mount(); const downloads: Promise<{ name: string; text: string }>[] = [];
    const native = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { const name = this.download; downloads.push(fetch(this.href).then((r) => r.text()).then((text) => ({ name, text }))); };
    try { await click('匯出 SRT'); await click('匯出 VTT'); const files = await Promise.all(downloads);
      assert(files.length === 2 && files[0].name.endsWith('.srt') && files[1].text.startsWith('WEBVTT'), '下載格式錯誤');
      assert(files.every((f) => parseSubtitles(f.text).cues.length === 3 && !f.text.includes('花字')), '匯出範圍錯誤');
    } finally { HTMLAnchorElement.prototype.click = native; }
  });
  await run('字幕軌鎖定後不能輸入、批次修改或匯入，仍可匯出', async () => {
    mount(); flushSync(() => useEditor.getState().toggleLock('caption')); await sleep();
    assert((field('第 1 句字幕文字') as HTMLTextAreaElement).disabled, '文字仍可編輯');
    const importer = [...host.querySelectorAll('button')].find((b) => b.textContent === '匯入 SRT／VTT')!; assert(importer.disabled, '仍可匯入');
    assert(![...host.querySelectorAll('button')].find((b) => b.textContent === '匯出 SRT')!.disabled, '鎖定後無法匯出');
    assert(ordinary()[0].text === '你好台北', '鎖定時修改資料');
  });
  await run('大量字幕分頁，搜尋範圍包含其他頁', async () => {
    const data = fixture(); data.captions = Array.from({ length: 80 }, (_, i) => caption('p' + i, i * 2, '測試第' + i + '句'));
    mount(data); assert(host.querySelectorAll('textarea[aria-label$="字幕文字"]').length === 25, '沒有分頁');
    await set('搜尋字幕', '測試'); await set('取代文字', '已校對'); await click('全部取代'); assert(ordinary().every((c) => c.text.startsWith('已校對')), '僅修改當頁');
  });
  summary.textContent = `完成：${passed} 通過，${failed} 失敗。`;
  mount(); runButton.disabled = false;
};
