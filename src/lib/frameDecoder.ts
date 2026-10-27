import { ALL_FORMATS, BlobSource, CanvasSink, Input, UrlSource, type WrappedCanvas } from 'mediabunny';
import { blobForUrl } from './localMedia';

/**
 * 逐格匯出用的影片解碼：每個片段要取的時間點事先排好，交給解碼器一路往前解，
 * 每個封包只解一次，不必像 <video> 每格都跳轉（每次跳轉都要從前一個關鍵格重新解碼，非常慢）。
 * 格式不支援或解碼失敗就回傳 null，由引擎改用 <video> 跳轉。
 */

export interface DecodedFrame {
  el: CanvasImageSource;
  size: [number, number];
}

export type DecodeSchedule = Map<string, { url: string; times: number[] }>;

interface Cursor {
  iterator: AsyncGenerator<WrappedCanvas | null, void, unknown> | null;
  times: number[];
  next: number;
}

export class FrameDecoder {
  private inputs = new Map<string, Promise<Input | null>>();
  private cursors = new Map<string, Promise<Cursor>>();
  /** 解碼失敗過的素材直接改用 <video>，不再重試 */
  private broken = new Set<string>();

  constructor(private schedule: DecodeSchedule) {}

  private open(url: string) {
    let entry = this.inputs.get(url);
    if (!entry) {
      entry = (async () => {
        // 本機素材直接讀檔案；伺服器上的舊素材用網址
        const blob = blobForUrl(url);
        const input = new Input({ source: blob ? new BlobSource(blob) : new UrlSource(url), formats: ALL_FORMATS });
        try {
          const track = await input.getPrimaryVideoTrack();
          if (!track || !(await track.canDecode())) throw new Error('無法解碼');
          return input;
        } catch {
          input.dispose();
          return null;
        }
      })();
      this.inputs.set(url, entry);
    }
    return entry;
  }

  private cursor(key: string, url: string, times: number[]) {
    let entry = this.cursors.get(key);
    if (!entry) {
      entry = (async () => {
        const input = await this.open(url);
        const track = input && (await input.getPrimaryVideoTrack());
        // 每個片段各自一個 sink（各自的畫布池），同一支影片同時出現兩次也不會互相蓋掉
        const iterator = track ? new CanvasSink(track, { poolSize: 2 }).canvasesAtTimestamps(times) : null;
        return { iterator, times, next: 0 };
      })();
      this.cursors.set(key, entry);
    }
    return entry;
  }

  /** key：片段（c:id／o:id）；time：素材內的秒數，必須照排好的順序要 */
  async frameAt(key: string, url: string, time: number): Promise<DecodedFrame | null> {
    const planned = this.schedule.get(key);
    if (!planned || this.broken.has(url)) return null;
    try {
      const cursor = await this.cursor(key, url, planned.times);
      if (!cursor.iterator || Math.abs(cursor.times[cursor.next] - time) > 1e-6) return null;
      cursor.next++;
      const { value, done } = await cursor.iterator.next();
      if (cursor.next >= cursor.times.length) this.close(key);
      if (done || !value) return null;
      return { el: value.canvas as CanvasImageSource, size: [value.canvas.width, value.canvas.height] };
    } catch (error) {
      console.warn('影片解碼失敗，改用播放器跳轉', error);
      this.broken.add(url);
      return null;
    }
  }

  /** 片段最後一格取完就關掉，釋放解碼器（畫布要留到這一格畫完，所以只結束迭代） */
  private close(key: string) {
    const entry = this.cursors.get(key);
    if (entry) void entry.then((c) => queueMicrotask(() => void c.iterator?.return(undefined).catch(() => {})));
  }

  dispose() {
    for (const entry of this.cursors.values()) void entry.then((c) => c.iterator?.return(undefined).catch(() => {}));
    this.cursors.clear();
    for (const entry of this.inputs.values()) void entry.then((input) => input?.dispose());
    this.inputs.clear();
  }
}
