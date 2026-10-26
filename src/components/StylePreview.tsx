import type { CaptionStyle } from '../lib/types';

/** 卡片上的字樣預覽：用模板的字幕／花字樣式畫一小段字 */
export function StylePreview({ style, text, size }: { style: Omit<CaptionStyle, 'animation'>; text: string; size: number }) {
  const sh = style.shadow;
  const shadow = sh ? `${Math.cos((sh.angle * Math.PI) / 180) * sh.distance * 0.12}px ${Math.sin((sh.angle * Math.PI) / 180) * sh.distance * 0.12}px ${sh.blur * 0.12}px ${sh.color}` : undefined;
  return (
    <span
      className="inline-block leading-tight font-black whitespace-nowrap"
      style={{
        fontFamily: `"${style.font}", "Noto Sans TC", sans-serif`,
        fontSize: size,
        color: style.color,
        background: style.background ?? undefined,
        padding: style.background ? '1px 6px' : undefined,
        borderRadius: style.background ? 4 : undefined,
        WebkitTextStroke: style.background ? undefined : `${Math.max(2, size / 7)}px ${style.stroke}`,
        paintOrder: 'stroke',
        textShadow: shadow,
      }}
    >
      {text}
    </span>
  );
}
