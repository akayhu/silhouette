// 配樂推薦：規則式比對字幕內容猜氣氛、用語速猜節奏，純前端算，不用任何付費 AI API
import { mainDuration } from './timeline';
import type { Caption, LibraryTrack, ProjectData } from './types';

// 關鍵字 → 配樂庫既有的 mood 標籤；比對到越多關鍵字，代表這支影片越像那種調性
const MOOD_KEYWORDS: Record<string, string[]> = {
  輕快: ['旅行', '出去玩', '出遊', '散步', '踏青', '戶外', '早晨', '陽光', '海邊', '夏天'],
  Vlog: ['日常', '生活', '紀錄', 'vlog', 'Vlog', '開箱', '逛街', '咖啡廳', '下午茶'],
  'Lo-fi': ['讀書', '放鬆', '慢活', '工作', '專注'],
  動感: ['運動', '健身', '比賽', '衝刺', '穿搭', '跑步'],
  溫馨: ['家人', '家庭', '寵物', '回憶', '紀念', '感動', '謝謝', '愛你'],
  勵志: ['加油', '堅持', '夢想', '努力', '畢業', '里程碑', '目標', '成長'],
  感傷: ['離別', '再見', '想念', '難過', '失去', '告別'],
  歡慶: ['生日', '慶祝', '派對', '節日', '驚喜', '恭喜'],
  懸疑: ['揭密', '解謎', '秘密', '真相', '緊張'],
  電子: ['科技', '夜景', '城市夜晚', '產品'],
  可愛: ['貓', '狗', '小孩', '萌', '可愛', '寶寶'],
  史詩: ['冒險', '挑戰', '征服', '突破', '登頂'],
  爵士: ['美食', '餐廳', '品嚐', '優雅', '晚餐'],
  氛圍: ['安靜', '冥想', '放鬆', '專注', '讀書'],
};

/** 從字幕文字猜這支影片的氣氛，回傳每個 mood 命中的關鍵字數，由高到低排序 */
function scoreMoods(text: string): Map<string, number> {
  const scores = new Map<string, number>();
  for (const [mood, words] of Object.entries(MOOD_KEYWORDS)) {
    const n = words.filter((w) => text.includes(w)).length;
    if (n > 0) scores.set(mood, n);
  }
  return scores;
}

/** 從字幕的語速猜合適的配樂節奏：講得快、句子密 → 配快一點的 bpm；講得慢、留白多 → 配慢一點的 bpm */
function preferredBpmRange(captions: Caption[], totalDuration: number): [number, number] {
  const lines = captions.filter((c) => c.role !== 'flower' && c.text.trim());
  if (!lines.length || !totalDuration) return [80, 120]; // 沒有字幕可以參考時，給一個最通用的範圍
  const totalChars = lines.reduce((n, c) => n + [...c.text].length, 0);
  const speechSpan = lines.reduce((s, c) => s + (c.end - c.start), 0);
  const charsPerSec = speechSpan > 0 ? totalChars / speechSpan : 0;
  if (charsPerSec > 5.5) return [100, 140];
  if (charsPerSec > 0 && charsPerSec < 3) return [60, 90];
  return [80, 120];
}

export interface MusicRecommendation {
  track: LibraryTrack;
  reason: string;
}

/** 推薦最適合這支影片的配樂：先用字幕內容猜氣氛，再用語速猜節奏；規則式比對，不呼叫任何 AI API */
export function recommendMusic(data: Pick<ProjectData, 'captions' | 'clips'>, library: LibraryTrack[], count = 3): MusicRecommendation[] {
  const tracks = library.filter((t) => t.category === 'music');
  if (!tracks.length) return [];
  const text = data.captions.filter((c) => c.role !== 'flower').map((c) => c.text).join('');
  const moodScores = scoreMoods(text);
  const [bpmMin, bpmMax] = preferredBpmRange(data.captions, mainDuration(data.clips));
  const bpmMid = (bpmMin + bpmMax) / 2;

  const scored = tracks.map((t) => {
    const moodScore = moodScores.get(t.mood) ?? 0;
    const bpm = t.bpm ?? bpmMid;
    const bpmScore = bpm >= bpmMin && bpm <= bpmMax ? 1 : Math.max(0, 1 - Math.abs(bpm - bpmMid) / 80);
    return { track: t, score: moodScore * 3 + bpmScore, matchedMood: moodScore > 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(({ track, matchedMood }) => ({
    track,
    reason: matchedMood ? `內容偏「${track.mood}」風格` : '節奏跟口白速度搭',
  }));
}
