import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { toPromptWav } from '../../lib/tts';
import type { Voice } from '../../lib/types';
import { Button, Field, Modal, inputClass, useToast } from '../../components/ui';

const SCRIPT = '今天天氣很好，我想帶大家去吃一間很好吃的牛肉麵，吃完再去附近的老街走走。';
const MIN_SECONDS = 4;

/** 建立自己的聲音：錄音或上傳一段朗讀，BreezyVoice 會模仿這個聲音說話 */
export function VoiceCloneDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (v: Voice) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [text, setText] = useState(SCRIPT);
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const useBlob = async (blob: Blob) => {
    try {
      const { wav, seconds } = await toPromptWav(blob);
      if (seconds < MIN_SECONDS) return toast(`錄音太短了，至少需要 ${MIN_SECONDS} 秒`, 'error');
      if (clip) URL.revokeObjectURL(clip.url);
      setClip({ blob: wav, url: URL.createObjectURL(wav), seconds });
    } catch {
      toast('無法讀取這個音檔', 'error');
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        useBlob(new Blob(chunks, { type: rec.mimeType }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setElapsed(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => {
        const s = (Date.now() - t0) / 1000;
        setElapsed(s);
        if (s >= 15) stop();
      }, 200);
    } catch {
      toast('無法使用麥克風，請確認瀏覽器已允許錄音，或改用上傳音檔', 'error');
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  };

  const save = async () => {
    if (!clip) return;
    setSaving(true);
    try {
      const { voice } = await api.createVoice(clip.blob, name.trim(), text.trim());
      onCreated(voice);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width="max-w-lg">
      <h2 className="text-xl font-extrabold">建立我的聲音</h2>
      <p className="mt-1 text-sm text-ink-soft">用自然的語氣念出下面這段話（約 10 秒），AI 會學習這個聲音的音色和口音。</p>

      <div className="mt-5 space-y-4">
        <Field label="聲音名稱">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的聲音、阿明" maxLength={20} />
        </Field>
        <Field label="請朗讀這段文字" hint="如果上傳的是其他內容的錄音，請把這裡改成錄音裡實際說的話，越準確效果越好。">
          <textarea className={`${inputClass} h-20 resize-none py-2.5 leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
        </Field>

        <div className="rounded-2xl bg-sunken/70 p-4">
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
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={start}>
                <Mic className="size-4" /> {clip ? '重新錄音' : '開始錄音'}
              </Button>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" /> 上傳音檔
              </Button>
            </div>
          )}
          <input ref={fileInput} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && useBlob(e.target.files[0])} />
          {clip && !recording && (
            <div className="mt-3">
              <audio src={clip.url} controls className="w-full" />
              <p className="mt-1 text-xs text-ink-mute">長度 {clip.seconds.toFixed(1)} 秒（超過 15 秒的部分會被截掉）</p>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">建議在安靜的地方錄，不要有背景音樂，距離麥克風約一個手掌。</p>
        </div>

        <label className="flex items-start gap-2 text-xs leading-relaxed text-ink">
          <input type="checkbox" className="mt-0.5 accent-brand" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          我確認這是我本人的聲音，或已取得聲音主人的同意。我不會用它冒充他人或製作不實內容。
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button onClick={save} disabled={!clip || !name.trim() || !text.trim() || !consent || saving || recording}>
          {saving && <Loader2 className="size-4 animate-spin" />} 建立聲音
        </Button>
      </div>
    </Modal>
  );
}
