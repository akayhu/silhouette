/**
 * 降噪：讓主影片的人聲更接近錄音室效果。用一般的訊號處理（不是 AI 語音辨識）：
 * - 高通濾波：濾掉手機收音常見的低頻悶響、電流聲
 * - 雜訊閘：講話停頓的地方自動壓低背景雜訊（風扇、冷氣、室內迴音），講話時維持原音量
 * - 人聲增豔：中高頻微微提升讓咬字更清楚
 *
 * 老實說：如果背景雜訊整段都跟講話疊在一起（不只是停頓時才有），雜訊閘沒辦法把雜訊從
 * 人聲裡「分離」出來，效果會比單純空拍時降噪有限——這是訊號處理方法本身的限制，不是哪裡沒做好。
 *
 * 用標準 Web Audio 節點組成，AudioContext（預覽）、OfflineAudioContext（匯出）都能用同一套。
 * 註：這裡沒有用 DynamicsCompressorNode 做輕壓縮——瀏覽器的壓縮器會自動加一段「補償增益」，
 * 對已經被雜訊閘壓低的安靜段落來說，補償增益會把壓低的音量幾乎整個加回來，等於白做了，
 * 所以乾脆不用，避免看起來有效果、量出來卻沒有的狀況。
 */
import type { ClipDenoise } from './types';

export const DEFAULT_CLIP_DENOISE: ClipDenoise = { strength: 60 };

// threshold、strength 用 AudioParam（不是 postMessage）：postMessage 是非同步的，
// OfflineAudioContext 算圖時可能在訊息送達前就跑完，強度會悄悄沒生效；AudioParam 才能保證生效。
const WORKLET_SRC = `
class NoiseGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'strength', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    const threshold = parameters.threshold[0];
    const strength = parameters.strength[0];
    const attack = Math.exp(-1 / (sampleRate * 0.004));
    const release = Math.exp(-1 / (sampleRate * 0.25));
    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      if (!inCh) continue;
      for (let i = 0; i < inCh.length; i++) {
        const x = inCh[i];
        const rect = Math.abs(x);
        this.env = rect > this.env ? attack * this.env + (1 - attack) * rect : release * this.env + (1 - release) * rect;
        let g = 1;
        if (strength > 0 && threshold > 0 && this.env < threshold) {
          const under = 1 - this.env / threshold;
          g = 1 - under * strength;
        }
        outCh[i] = x * g;
      }
    }
    return true;
  }
}
registerProcessor('noise-gate', NoiseGate);
`;

let workletURL: string | null = null;
const workletReady = new WeakSet<BaseAudioContext>();

async function ensureWorklet(ctx: BaseAudioContext) {
  if (workletReady.has(ctx)) return;
  if (!workletURL) workletURL = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(workletURL);
  workletReady.add(ctx);
}

export interface DenoiseChain {
  input: AudioNode;
  output: AudioNode;
  /** strength 0–100；0 時所有節點都設成接近不處理（維持圖的連接，不用重新接線） */
  setStrength: (strength: number) => void;
}

/** 建一條降噪處理鏈：接在聲音來源和下一個節點（例如音量）中間。strength 可以隨時改變，不用重建。 */
export async function createDenoiseChain(ctx: BaseAudioContext): Promise<DenoiseChain> {
  await ensureWorklet(ctx);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 20; // 0 強度時幾乎不濾到任何聲音內容

  const gate = new AudioWorkletNode(ctx, 'noise-gate');

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1;
  presence.gain.value = 0;

  highpass.connect(gate).connect(presence);

  const gateThreshold = gate.parameters.get('threshold')!;
  const gateStrength = gate.parameters.get('strength')!;
  const setStrength = (strength: number) => {
    const k = Math.min(1, Math.max(0, strength / 100));
    highpass.frequency.setTargetAtTime(20 + k * 80, ctx.currentTime, 0.05);
    presence.gain.setTargetAtTime(k * 3, ctx.currentTime, 0.05);
    gateThreshold.setValueAtTime(k > 0 ? 0.008 + k * 0.03 : 0, ctx.currentTime);
    gateStrength.setValueAtTime(k, ctx.currentTime);
  };

  return { input: highpass, output: presence, setStrength };
}
