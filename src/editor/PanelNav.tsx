/** 中文標籤兩個字一行：不靠瀏覽器自動斷行（寬度、字距不一定每個字都剛好斷在兩字之間），自己切好更穩定 */
function TwoCharLines({ label }: { label: string }) {
  const chars = [...label];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += 2) lines.push(chars.slice(i, i + 2).join(''));
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </>
  );
}

/**
 * 工具面板共用的左側子導航：上面是工具分頁（素材／智能剪輯／字幕…），
 * 點進某個分頁後，裡面不同功能用這個窄欄切換，右邊只顯示選到的那一塊內容，
 * 不用把所有功能都擠在同一條長長的捲動清單裡（跟剪映同一套版面邏輯）。
 */
export function PanelNav<T extends string>({
  sections,
  value,
  onChange,
}: {
  sections: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav className="flex w-16 shrink-0 flex-col gap-1 border-r border-line bg-sunken/40 p-1.5" aria-label="功能分類">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          aria-pressed={value === s.id}
          className={`rounded-lg px-1 py-2 text-center text-[11px] leading-[1.5] font-bold whitespace-nowrap transition ${value === s.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
        >
          <TwoCharLines label={s.label} />
        </button>
      ))}
    </nav>
  );
}

/** 面板外層：左邊 PanelNav、右邊可捲動的內容區；面板本身要是 h-full 才會正確撐滿工具區高度 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full">{children}</div>;
}

export const panelContentClass = 'min-h-0 min-w-0 flex-1 overflow-y-auto p-4';
