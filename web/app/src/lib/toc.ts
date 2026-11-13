/**
 * 全文页左侧目录与主页列表的纯逻辑（不依赖 DOM，便于单测）。
 */

export type TocChapter = { id: string; title?: string; sections: { id: string; title?: string }[] };

export type TocItem = { id: string; chapter: string; section: string | null; level: 1 | 2; title: string };

/**
 * 目录项按页面顺序展开成一列：章（level 1）后面紧跟它的各小节（level 2）。
 * 小节 id 带章前缀，见 route.anchorId。目录据此渲染，覆盖本期全部章与节。
 */
export function tocItems(chapters: TocChapter[], anchorId: (c: string, s?: string) => string): TocItem[] {
  return chapters.flatMap((c) => [
    { id: anchorId(c.id), chapter: c.id, section: null, level: 1 as const, title: c.title ?? c.id },
    ...c.sections.map((s) => ({ id: anchorId(c.id, s.id), chapter: c.id, section: s.id, level: 2 as const, title: s.title ?? s.id })),
  ]);
}

/** 目录项（章、节）按页面顺序的锚点 id 列表 */
export function anchorsOf(chapters: TocChapter[], anchorId: (c: string, s?: string) => string): string[] {
  return tocItems(chapters, anchorId).map((t) => t.id);
}

/**
 * 当前阅读位置：标题顶端已经越过阅读线（距视口顶 line px）的最后一项。
 * 一项都没越过时返回 null（还在期首导语处）。到达页底时返回最后一项，
 * 保证最后几节很短、滚不到阅读线时也能被高亮。
 */
export function activeAnchor(tops: { id: string; top: number }[], line: number, atBottom = false): string | null {
  if (!tops.length) return null;
  if (atBottom) return tops[tops.length - 1].id;
  let hit: string | null = null;
  for (const t of tops) {
    if (t.top <= line) hit = t.id;
    else break;
  }
  return hit;
}

/** 深链接要滚到的位置：节存在用节，否则章存在用章，否则 null（回到顶部） */
export function resolveTarget(
  chapters: TocChapter[],
  chapter: string | null,
  section: string | null,
  anchorId: (c: string, s?: string) => string,
): string | null {
  const c = chapter ? chapters.find((x) => x.id === chapter) : undefined;
  if (!c) return null;
  if (section && c.sections.some((s) => s.id === section)) return anchorId(c.id, section);
  return anchorId(c.id);
}

/** 主页列表：只按已有数据逐期列出，按日期倒序，最新一期标「最新」 */
export function homeEntries<R extends { date: string }>(reports: R[]): (R & { latest: boolean })[] {
  return [...reports].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r, i) => ({ ...r, latest: i === 0 }));
}
