const MAX_CHARS = 16;

export interface Sentence {
  /** 送去朗讀的文字（保留標點，語氣比較自然） */
  speak: string;
  /** 字幕顯示的文字（去掉句尾標點） */
  display: string;
}

/** 依標點把文字切成適合當字幕的短句，太長的句子再依字數切開 */
export function splitSentences(text: string): Sentence[] {
  return text
    .split(/(?<=[，。！？、,.!?；;：:…])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      const chars = [...s];
      if (chars.length <= MAX_CHARS + 2) return [s];
      const out: string[] = [];
      for (let i = 0; i < chars.length; i += MAX_CHARS) out.push(chars.slice(i, i + MAX_CHARS).join(''));
      return out;
    })
    .map((speak) => ({ speak, display: speak.replace(/[，。、,.；;：:…]+$/, '') }))
    .filter((s) => s.display.replace(/[！？!?]/g, '').trim());
}
