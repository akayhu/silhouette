import { useEffect, useMemo, useRef, useState } from 'react';
import { saveLocalFile } from '../../lib/localMedia';
import { AudioLines, Loader2, Mic, Play, Sparkles, Square, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ASR_MODELS, transcribe } from '../../lib/asr';
import { denoiseRecording } from '../../lib/denoise';
import { uid } from '../../lib/format';
import { audioPeaks, decodeAudio, probe, sliceMono } from '../../lib/media';
import { splitSentences } from '../../lib/sentences';
import { captionFromWords, newCaption } from '../../lib/timeline';
import { progressLabel, runTts, type TtsProgress } from '../../lib/tts';
import type { Caption, MediaItem, Voice } from '../../lib/types';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { Chips, Slider } from '../Inspector';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';
import { VoiceCloneDialog } from './VoiceCloneDialog';

const LOCALE: Record<string, string> = { zh_TW: '系統語音・台灣國語', zh_CN: '系統語音・中國普通話', zh_HK: '系統語音・香港粵語' };

// macOS 語音的英文名稱對應成繁體中文顯示名稱
const VOICE_NAMES: Record<string, string> = {
  Meijia: '美佳（女聲）',
  Eddy: '艾迪（男聲）',
  Flo: '芙蘿（女聲）',
  Grandma: '奶奶（年長女聲）',
  Grandpa: '爺爺（年長男聲）',
  Reed: '里德（男聲）',
  Rocko: '洛可（男聲）',
  Sandy: '珊蒂（女聲）',
  Shelley: '雪莉（女聲）',
  Sinji: '善怡（女聲）',
  Tingting: '婷婷（女聲）',
};

const voiceLabel = (v: Voice) => {
  if (v.engine === 'breezy') return v.custom ? `我的聲音：${v.name}` : `${v.name}（${v.desc}）`;
  const base = v.id.replace(/ \(.*\)$/, '');
  return VOICE_NAMES[base] ?? base;
};

/** 朗讀在伺服器產生，拿到後存到這台裝置（本機優先）；伺服器上的檔案之後會自動清掉 */
async function toMedia(url: string, name: string): Promise<MediaItem> {
  const { duration } = await probe(url, 'audio');
  const id = uid();
  const base: MediaItem = { id, name: name.slice(0, 18), kind: 'audio', url, duration, origin: 'tts' };
  try {
    const blob = await (await fetch(url)).blob();
    const ext = url.match(/\.[a-z0-9]+$/i)?.[0] ?? '.wav';
    const saved = await saveLocalFile(id, blob, base.name + ext);
    return { ...base, url: saved.url, local: saved.local };
  } catch {
    // 存不到本機（空間不夠等）就先用伺服器上的檔案
    return base;
  }
}

export function VoicePanel() {
  const { user } = useAuth();
  const upgrade = useUpgrade();
  const toast = useToast();
  const projectId = useEditor((s) => s.projectId)!;
  const captionCount = useEditor((s) => s.data.captions.length);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [breezy, setBreezy] = useState(false);
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(180);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<TtsProgress | null>(null);
  const [preview, setPreview] = useState<HTMLAudioElement | null>(null);
  const [withCaptions, setWithCaptions] = useState(true);
  const [cloning, setCloning] = useState(false);
  const isPro = user?.plan === 'pro';

  const loadVoices = async (select?: string) => {
    const r = await api.voices();
    const sorted = [...r.voices].sort((a, b) => rank(a) - rank(b));
    setVoices(sorted);
    setBreezy(r.breezy);
    setVoice((cur) => select ?? (sorted.some((v) => v.id === cur) ? cur : (sorted.find((v) => v.engine === 'breezy') ?? sorted.find((v) => v.id.startsWith('Meijia')) ?? sorted[0])?.id ?? ''));
  };

  useEffect(() => {
    loadVoices();
  }, []);

  const current = voices.find((v) => v.id === voice);
  const isAI = current?.engine === 'breezy';

  const grouped = useMemo(() => {
    const g = new Map<string, Voice[]>();
    voices.forEach((v) => {
      const key = v.engine === 'breezy' ? 'breezy' : v.locale;
      g.set(key, [...(g.get(key) ?? []), v]);
    });
    return [...g.entries()];
  }, [voices]);

  const guard = () => {
    if (!isPro) {
      upgrade('文字朗讀是專業版功能，升級後可以把文字變成中文配音。');
      return false;
    }
    return true;
  };

  const tts = (segments: string[]) => {
    setProgress(null);
    return runTts(projectId, { segments, voice, rate }, setProgress);
  };

  const listen = async () => {
    if (!guard() || !text.trim()) return;
    preview?.pause();
    setBusy('preview');
    try {
      // AI 人聲較慢，試聽只念第一句
      const sentences = splitSentences(text).map((s) => s.speak);
      const { url } = await tts(isAI ? sentences.slice(0, 1) : sentences);
      const a = new Audio(url);
      a.onended = () => setPreview(null);
      a.play();
      setPreview(a);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const addVoice = async () => {
    if (!guard() || !text.trim()) return;
    if (!ensureUnlocked('audio-voice', ...(withCaptions ? (['caption'] as const) : []))) return;
    setBusy('add');
    try {
      const sentences = splitSentences(text);
      // 逐句合成並拿回每句的時間，字幕才會和聲音對齊
      const { url, segments } = await tts(sentences.map((s) => s.speak));
      const m = await toMedia(url, text);
      const { time, commit, data } = useEditor.getState();
      const style = data.captions[0]?.style;
      const captions = withCaptions ? segments.map((seg, i) => newCaption(time + seg.start, time + seg.end, sentences[i].display, style)) : [];
      commit((d) => ({
        ...d,
        media: [...d.media, m],
        audio: [...d.audio, { id: uid(), mediaId: m.id, start: time, in: 0, out: m.duration, volume: 1 }],
        captions: [...d.captions, ...captions],
      }));
      toast(captions.length ? `已加入配音和 ${captions.length} 句字幕` : '已加入音訊軌', 'success');
      setText('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  // 所有字幕一次送出合成成一個檔案，再依每句的時間切成片段，各自對齊字幕開頭
  const captionsToVoice = async () => {
    if (!guard() || !ensureUnlocked('audio-voice')) return;
    const captions = [...useEditor.getState().data.captions].filter((c) => c.text.trim()).sort((a, b) => a.start - b.start);
    setBusy('captions');
    try {
      const { url, segments } = await tts(captions.map((c) => c.text));
      const m = await toMedia(url, '字幕配音');
      useEditor.getState().commit((d) => ({
        ...d,
        media: [...d.media, m],
        audio: [...d.audio, ...segments.map((seg, i) => ({ id: uid(), mediaId: m.id, start: captions[i].start, in: seg.start, out: seg.end, volume: 1 }))],
      }));
      toast(`已產生 ${segments.length} 段配音`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeVoice = async (v: Voice) => {
    if (!confirm(`刪除「${v.name}」這個聲音？`)) return;
    await api.deleteVoice(v.id);
    toast('已刪除聲音');
    loadVoices();
  };

  const customVoices = voices.filter((v) => v.custom);
  const busyLabel = isAI ? progressLabel(progress) : '產生中…';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">文字朗讀</h2>
        {!isPro && <ProBadge />}
      </div>
      <p className="mt-1 text-xs text-ink-mute">輸入文字，選一個聲音，產生中文配音放進音訊軌。</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例如：大家好，今天要帶你們去一間超好吃的拉麵店！"
        maxLength={2000}
        className="mt-3 h-28 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-brand"
      />
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">聲音</span>
          <select className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={voice} onChange={(e) => setVoice(e.target.value)}>
            {voices.length === 0 && <option>載入中…</option>}
            {grouped.map(([key, vs]) => (
              <optgroup key={key} label={key === 'breezy' ? '台灣腔 AI 人聲（最自然）' : LOCALE[key] ?? key}>
                {vs.map((v) => (
                  <option key={v.id} value={v.id}>
                    {voiceLabel(v)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {isAI ? (
          <p className="flex gap-2 rounded-xl bg-brand-soft/60 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <span>台灣腔 AI 人聲由 BreezyVoice 在這台電腦上產生，聲音最自然，但每句約需 30–60 秒，第一次使用要先載入模型。</span>
          </p>
        ) : (
          <Slider label="語速" value={rate} min={110} max={300} step={10} format={(v) => (v < 160 ? '慢' : v > 220 ? '快' : '正常')} onChange={setRate} />
        )}
        <label className="flex items-center gap-2 text-xs font-semibold text-ink">
          <input type="checkbox" className="accent-brand" checked={withCaptions} onChange={(e) => setWithCaptions(e.target.checked)} />
          同時加上字幕（依句子自動對齊配音）
        </label>
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" onClick={preview ? () => (preview.pause(), setPreview(null)) : listen} disabled={!!busy || !text.trim()}>
          {busy === 'preview' ? <Loader2 className="size-4 animate-spin" /> : preview ? <Square className="size-4" /> : <Play className="size-4" />}
          試聽
        </Button>
        <Button onClick={addVoice} disabled={!!busy || !text.trim()}>
          {busy === 'add' ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
          {busy === 'add' ? busyLabel : '加到時間軸'}
        </Button>
      </div>
      {busy === 'preview' && isAI && <p className="mt-2 text-center text-[11px] text-ink-mute">{busyLabel}（試聽只念第一句）</p>}

      {breezy && (
        <div className="mt-6 rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold">我的聲音</div>
            <span className="text-[11px] text-ink-mute">{customVoices.length}/10</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">錄一段 10 秒左右的朗讀，就能做出新的台灣腔 AI 人聲。</p>
          {customVoices.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {customVoices.map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded-lg bg-sunken/60 px-2.5 py-1.5 text-xs font-semibold">
                  <Mic className="size-3.5 text-brand" />
                  <span className="flex-1 truncate">{v.name}</span>
                  <button onClick={() => removeVoice(v)} className="rounded p-1 text-ink-mute hover:bg-red-50 hover:text-red-600" aria-label={`刪除 ${v.name}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => (guard() ? setCloning(true) : null)} disabled={customVoices.length >= 10}>
            <Mic className="size-3.5" /> 建立新的聲音
          </Button>
        </div>
      )}

      <RecordCaption isPro={isPro} guard={guard} />

      <div className="mt-4 rounded-2xl bg-sunken/70 p-4">
        <div className="text-sm font-extrabold">字幕轉語音</div>
        <p className="mt-1 text-xs text-ink-soft">把每一句字幕各自產生配音，對齊字幕的開始時間。</p>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={captionsToVoice} disabled={!!busy || captionCount === 0}>
          {busy === 'captions' ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> {busyLabel}
            </>
          ) : (
            `用目前聲音朗讀 ${captionCount} 句字幕`
          )}
        </Button>
      </div>

      {cloning && (
        <VoiceCloneDialog
          onClose={() => setCloning(false)}
          onCreated={(v) => {
            setCloning(false);
            toast(`已建立「${v.name}」`, 'success');
            loadVoices(v.id);
          }}
        />
      )}
    </div>
  );
}

// AI 人聲排最前面，其次台灣國語
const rank = (v: Voice) => (v.engine === 'breezy' ? (v.custom ? 1 : 0) : v.locale === 'zh_TW' ? 2 : 3);

/** 錄一段口白：直接加到音訊軌，還能自動辨識成字幕（辨識在瀏覽器裡執行，和 AI 自動字幕共用同一套模型） */
function RecordCaption({ isPro, guard }: { isPro: boolean; guard: () => boolean }) {
  const toast = useToast();
  const [model, setModel] = useState<string>(ASR_MODELS[0].id);
  const [withCaptions, setWithCaptions] = useState(true);
  const [denoise, setDenoise] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>(0);

  useEffect(
    () => () => {
      clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const start = async () => {
    if (!guard()) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setClip((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          const blob = new Blob(chunks, { type: rec.mimeType });
          return { blob, url: URL.createObjectURL(blob) };
        });
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setElapsed(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setElapsed(s);
        if (s >= 600) stop(); // 最長錄 10 分鐘，避免錄太久忘記停
      }, 200);
    } catch {
      toast('無法使用麥克風，請確認瀏覽器已允許錄音', 'error');
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  };

  const discard = () => {
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const add = async () => {
    if (!clip || !ensureUnlocked('audio-voice', ...(withCaptions ? (['caption'] as const) : []))) return;
    setBusy('add');
    try {
      const id = uid();
      let blob = clip.blob;
      let ext = clip.blob.type.includes('ogg') ? '.ogg' : clip.blob.type.includes('mp4') ? '.m4a' : '.webm';
      if (denoise) {
        setStatus('降噪處理中…');
        blob = await denoiseRecording(blob);
        ext = '.wav';
      }
      const [{ duration }, peaks, saved] = await Promise.all([probe(clip.url, 'audio'), audioPeaks(blob), saveLocalFile(id, blob, '錄音' + ext)]);
      const m: MediaItem = { id, name: '錄音', kind: 'audio', url: saved.url, duration, origin: 'record', peaks, local: saved.local };
      const { time, data } = useEditor.getState();
      let captions: Caption[] = [];
      if (withCaptions) {
        setStatus('讀取錄音');
        const buffer = await decodeAudio(saved.url);
        const samples = await sliceMono(buffer, 0, duration, 16000);
        const segs = await transcribe(
          samples,
          model,
          (p) => setStatus(p.phase === 'download' ? `下載語音模型 ${Math.round(p.progress ?? 0)}%（只有第一次）` : '辨識中…'),
          { words: true },
        );
        const style = data.captions.find((c) => c.role !== 'flower')?.style;
        captions = segs
          .filter((s) => s.text.trim())
          .map((s) =>
            s.words?.length
              ? captionFromWords(
                  time + s.words[0].start,
                  time + s.words[s.words.length - 1].end,
                  s.text,
                  style,
                  s.words.map((w) => ({ ...w, start: time + w.start, end: time + w.end })),
                )
              : newCaption(time + s.start, time + s.end, s.text, style),
          );
      }
      useEditor.getState().commit((d) => ({
        ...d,
        media: [...d.media, m],
        audio: [...d.audio, { id: uid(), mediaId: m.id, start: time, in: 0, out: duration, volume: 1 }],
        captions: [...d.captions, ...captions],
      }));
      toast(captions.length ? `已加入錄音和 ${captions.length} 句字幕` : '已加入錄音', 'success');
      discard();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
      setStatus(null);
    }
  };

  return (
    <div className="mt-4 rounded-2xl bg-sunken/70 p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-extrabold">錄音上字幕</div>
        {!isPro && <ProBadge />}
      </div>
      <p className="mt-1 text-xs text-ink-soft">直接用麥克風錄一段口白，加到音訊軌，還能自動辨識成字幕。</p>

      <div className="mt-3 rounded-xl bg-surface p-3">
        {recording ? (
          <div className="flex items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-coral" />
            </span>
            <span className="flex-1 text-sm font-bold tabular-nums">錄音中 {elapsed.toFixed(1)} 秒</span>
            <Button variant="coral" size="sm" onClick={stop}>
              <Square className="size-3.5" fill="currentColor" /> 停止
            </Button>
          </div>
        ) : clip ? (
          <div>
            <audio src={clip.url} controls className="w-full" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={discard} disabled={!!busy}>
                重新錄音
              </Button>
              <Button size="sm" onClick={add} disabled={!!busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />}
                {status ?? '加到時間軸'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={start}>
            <Mic className="size-4" /> 開始錄音
          </Button>
        )}
      </div>

      {!recording && !clip && (
        <>
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" className="accent-brand" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />
            降噪（濾掉雜訊，人聲更清楚）
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" className="accent-brand" checked={withCaptions} onChange={(e) => setWithCaptions(e.target.checked)} />
            同時辨識成字幕
          </label>
          {withCaptions && (
            <div className="mt-2">
              <div className="mb-1.5 text-xs font-semibold text-ink-soft">辨識模型</div>
              <Chips options={ASR_MODELS.map((m) => ({ id: m.id, label: m.label }))} value={model} onChange={setModel} />
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-ink-mute">語音辨識在你的瀏覽器裡執行，錄音不會傳到外部服務。</p>
    </div>
  );
}
