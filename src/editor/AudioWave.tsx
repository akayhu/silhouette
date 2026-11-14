import { useEffect, useMemo, useState } from 'react';
import { barsFor, displayHeight, PEAKS_PER_SECOND, peaksFromSamples } from '../lib/wavePeaks';
import type { AudioClip, MediaItem } from '../lib/types';

/** 太長的音訊不在時間軸上解碼（記憶體吃太多），改用素材附帶的粗略波形 */
const MAX_DECODE_SECONDS = 600;

const done = new Map<string, number[] | null>();
const pending = new Map<string, Promise<number[] | null>>();
let running = 0;
const queue: (() => void)[] = [];

/** 同時最多解碼 2 個，避免一打開專案就一堆音訊同時解碼卡住畫面 */
function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++;
      job().then(resolve, reject).finally(() => {
        running--;
        queue.shift()?.();
      });
    };
    running < 2 ? run() : queue.push(run);
  });
}

function loadPeaks(url: string): Promise<number[] | null> {
  let p = pending.get(url);
  if (!p) {
    p = schedule(async () => {
      try {
        const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch(url)).arrayBuffer());
        return peaksFromSamples(buf.getChannelData(0), buf.sampleRate);
      } catch {
        return null;
      }
    }).then((r) => {
      done.set(url, r);
      return r;
    });
    pending.set(url, p);
  }
  return p;
}

/** 音訊檔的精細波形（每秒 20 個峰值）；還沒算好或算不出來是 null */
function useWavePeaks(url: string | undefined, duration: number) {
  const ok = !!url && duration > 0 && duration <= MAX_DECODE_SECONDS;
  const [peaks, setPeaks] = useState<number[] | null>(() => (ok ? done.get(url!) ?? null : null));
  useEffect(() => {
    if (!ok) return setPeaks(null);
    let alive = true;
    if (done.has(url!)) setPeaks(done.get(url!) ?? null);
    else void loadPeaks(url!).then((r) => alive && setPeaks(r));
    return () => {
      alive = false;
    };
  }, [ok, url]);
  return peaks;
}

/** 時間軸音訊片段的波形：畫的是這個片段實際用到的範圍，音量調小波形也跟著變矮 */
export function AudioWave({ media, clip, width }: { media: MediaItem | undefined; clip: AudioClip; width: number }) {
  const fine = useWavePeaks(media?.url, media?.duration ?? 0);
  const count = Math.max(8, Math.min(800, Math.floor(width / 3)));
  const bars = useMemo(() => {
    if (fine) return barsFor(fine, PEAKS_PER_SECOND, clip.in, clip.out, count);
    if (media?.peaks?.length && media.duration) return barsFor(media.peaks, media.peaks.length / media.duration, clip.in, clip.out, count);
    return [];
  }, [fine, media?.peaks, media?.duration, clip.in, clip.out, count]);
  if (!bars.length) return null;
  const H = 32;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${count} ${H}`} aria-hidden data-testid="audio-wave">
      {bars.map((b, i) => {
        const h = Math.max(1.2, displayHeight(b, clip.volume) * (H - 6));
        return <rect key={i} x={i + 0.15} y={(H - h) / 2} width={0.7} height={h} rx={0.3} fill="#0d9b75" opacity={0.75} />;
      })}
    </svg>
  );
}
