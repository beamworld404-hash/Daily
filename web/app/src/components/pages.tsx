import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Report } from "@/lib/types";
import { reports } from "@/lib/reports";
import { anchorId, href } from "@/lib/route";
import { activeAnchor, homeEntries, resolveTarget, tocItems } from "@/lib/toc";
import { zhDay, zhWeekday } from "@/lib/format";
import { Rich } from "@/lib/rich";
import { chaptersOf, issueTitle } from "@/components/chapters";
import { Mark, Pill, ThemeToggle } from "@/components/ui";

/** 「11 月 12 日早报」 */
const shortTitle = (r: Report) => `${Number(r.date.slice(5, 7))} 月 ${Number(r.date.slice(8, 10))} 日${r.edition}`;

/** 目录行：标题 + 一句说明，右侧可带胶囊标签（参考站的书目列表） */
function Row({ to, title, desc, pill }: { to: string; title: string; desc: string; pill?: string }) {
  return (
    <li>
      <a className="row" href={to}>
        <span className="row-text">
          <span className="row-title">{title}</span>
          <span className="row-desc">{desc}</span>
        </span>
        {pill ? <Pill>{pill}</Pill> : null}
      </a>
    </li>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <Mark />
      <ThemeToggle />
    </header>
  );
}

/** 阅读线：标题顶端越过视口顶下方这么多像素，就算进入该章 / 节 */
const READ_LINE = 120;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 一期的全文页：期首大标题与导语，下面依次完整展开全部章节与小节，往下滚即可读完。
 * 左侧固定整期目录（章 + 节），点击在本页内滚动，并高亮当前阅读位置。
 * 分章 hash（#/日期/章/节）落在这一页的对应位置。
 */
export function IssuePage({ report, chapterId, sectionId }: { report: Report; chapterId: string | null; sectionId: string | null }) {
  const chapters = useMemo(() => chaptersOf(report), [report]);
  const items = useMemo(() => tocItems(chapters, anchorId), [chapters]);
  const anchors = useMemo(() => items.map((t) => t.id), [items]);
  const [active, setActive] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const firstScroll = useRef(true);
  const tocRef = useRef<HTMLElement>(null);
  const tocNavRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const scrollToAnchor = useCallback((id: string | null, smooth: boolean) => {
    const behavior: ScrollBehavior = smooth && !reducedMotion() ? "smooth" : "auto";
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ block: "start", behavior });
    else window.scrollTo({ top: 0, behavior });
  }, []);

  // 打开 / hash 变化时滚到对应章节；首次打开直接跳，之后平滑滚动
  useLayoutEffect(() => {
    const target = resolveTarget(chapters, chapterId, sectionId, anchorId);
    scrollToAnchor(target, !firstScroll.current);
    firstScroll.current = false;
  }, [chapters, chapterId, sectionId, scrollToAnchor]);

  // 滚动时计算当前所在章 / 节
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const tops = anchors.flatMap((id) => {
        const el = document.getElementById(id);
        return el ? [{ id, top: el.getBoundingClientRect().top }] : [];
      });
      const doc = document.documentElement;
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      setActive(activeAnchor(tops, READ_LINE, atBottom));
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchors]);

  // 目录本身较长：让高亮项保持在目录可视范围内（只滚目录，不动页面）
  useEffect(() => {
    const nav = tocNavRef.current;
    if (!nav || !active) return;
    const item = nav.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(active)}"]`);
    if (!item) return;
    const n = nav.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top < n.top + 24) nav.scrollTop += r.top - n.top - 24;
    else if (r.bottom > n.bottom - 24) nav.scrollTop += r.bottom - n.bottom + 24;
  }, [active]);

  // 窄屏目录抽屉：Esc 关闭并把焦点还给按钮
  useEffect(() => {
    if (!tocOpen) return;
    tocRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTocOpen(false);
        toggleRef.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [tocOpen]);

  /** 目录链接：正常改 hash（可分享、可后退）；hash 未变（重复点同一项）时手动滚动 */
  const onTocClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string | null) => {
    setTocOpen(false);
    if (e.currentTarget.hash === location.hash) {
      e.preventDefault();
      scrollToAnchor(id, true);
    }
  };

  const idx = reports.findIndex((r) => r.date === report.date);
  const newer = idx > 0 ? reports[idx - 1] : undefined;
  const older = idx >= 0 ? reports[idx + 1] : undefined;

  return (
    <div className={`page page-issue${tocOpen ? " toc-open" : ""}`}>
      <header className="topbar">
        <Mark />
        <div className="topbar-tools">
          <button
            ref={toggleRef}
            type="button"
            className="toc-toggle"
            aria-expanded={tocOpen}
            aria-controls="issue-toc"
            onClick={() => setTocOpen((v) => !v)}
          >
            目录
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="toc-backdrop" aria-hidden="true" onClick={() => setTocOpen(false)} />
      <aside className="toc" id="issue-toc" ref={tocRef} aria-label="本期目录">
        <a className="toc-back" href={href.home()} onClick={() => setTocOpen(false)}>
          <span className="toc-back-arrow" aria-hidden="true">
            ←
          </span>
          全部日报
        </a>
        <nav aria-label={`${shortTitle(report)}目录`} ref={tocNavRef}>
          <ol className="toc-list">
            {items.map((t) => (
              <li key={t.id}>
                <a
                  className={t.level === 1 ? "toc-chapter" : "toc-section"}
                  href={href.chapter(report.date, t.chapter, t.section ?? undefined)}
                  data-anchor={t.id}
                  aria-current={active === t.id ? "location" : undefined}
                  onClick={(e) => onTocClick(e, t.id)}
                >
                  {t.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <main className="issue" id="main">
        <a className="issue-back" href={href.home()}>
          <span className="toc-back-arrow" aria-hidden="true">
            ←
          </span>
          全部日报
        </a>
        <header className="issue-head">
          <p className="issue-date">
            {zhDay(report.date)} · {zhWeekday(report.date)}
          </p>
          <h1 className="display">{shortTitle(report)}</h1>
          <p className="lead">
            <Rich text={report.summary} />
          </p>
        </header>

        {chapters.map((c) => (
          <section key={c.id} className="issue-chapter" aria-labelledby={anchorId(c.id)}>
            <h2 className="chapter-title" id={anchorId(c.id)}>
              {c.title}
            </h2>
            <div className="prose">
              {c.lead}
              {c.sections.map((s) => (
                <section key={s.id} aria-labelledby={anchorId(c.id, s.id)}>
                  <h3 id={anchorId(c.id, s.id)}>{s.title}</h3>
                  {s.body}
                </section>
              ))}
            </div>
          </section>
        ))}

        <nav className="pager" aria-label="其他期">
          {older ? (
            <a className="pager-prev" href={href.issue(older.date)}>
              <span className="arrow" aria-hidden="true">
                ←
              </span>
              <span>{issueTitle(older)}</span>
            </a>
          ) : (
            <span />
          )}
          {newer ? (
            <a className="pager-next" href={href.issue(newer.date)}>
              <span>{issueTitle(newer)}</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </a>
          ) : (
            <a className="pager-next" href={href.home()}>
              <span>全部日报</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </a>
          )}
        </nav>
      </main>
    </div>
  );
}

/**
 * 主页：按日期倒序列出已有的每一期，点日期进入那一期的全文页。
 * 只列 web/content/reports/ 里真实存在的期次。
 */
export function HomePage() {
  const entries = homeEntries(reports);
  // 从全文页中段点「← 全部日报」回来时，主页从顶部开始。
  // 必须用花括号、不返回值：新版 Chromium 的 scrollTo 返回 Promise，若被当作 effect
  // 返回值，React 会在主页卸载（点进某期）时把它当清理函数调用而抛错，整页白屏。
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="page page-index">
      <TopBar />
      <main className="index" id="main">
        <h1 className="display">关注清单日报</h1>
        <p className="lead">
          {entries.length ? `共 ${entries.length} 期，按日期倒序。点日期打开当期全文；每期的数据在出报时取得，之后不再改动。` : "还没有日报。"}
        </p>
        <ul className="rows" aria-label="各期日报">
          {entries.map((r) => (
            <Row
              key={r.date}
              to={href.issue(r.date)}
              title={`${zhDay(r.date)} · ${zhWeekday(r.date)}`}
              desc={`${r.edition} · ${r.summary}`}
              pill={r.latest ? "最新" : undefined}
            />
          ))}
        </ul>
      </main>
      <BookCards />
    </div>
  );
}

/** 书卡配色：底色 / 字色，大号标题字对比度 ≥ 3:1 */
const CARD_COLORS: [string, string][] = [
  ["#e54f10", "#ffffc2"],
  ["#f6ebd9", "#524733"],
  ["#0a90d2", "#ffffff"],
  ["#53f399", "#004d00"],
  ["#211f1e", "#f6ebd9"],
  ["#ffd102", "#994000"],
];

/**
 * 主页底部扇形排开的书卡：最近几期。固定在视口底部只露出上沿，
 * 悬停或键盘聚焦时抬起。数量少时同样居中对称。
 */
function BookCards() {
  const cards = reports.slice(0, 5).map((r) => ({
    key: r.date,
    to: href.issue(r.date),
    label: `${Number(r.date.slice(5, 7))} 月 ${Number(r.date.slice(8, 10))} 日\n${r.edition}`,
    name: issueTitle(r),
  }));
  const mid = (cards.length - 1) / 2;
  return (
    <nav className="books" aria-label="往期书架">
      {cards.map((c, i) => {
        const k = i - mid;
        const [bg, fg] = CARD_COLORS[i % CARD_COLORS.length];
        const size = 200 + Math.abs(k) * 16;
        return (
          <a
            key={c.key}
            className="book"
            href={c.to}
            aria-label={c.name}
            style={{
              ["--x" as string]: `${k * 64}px`,
              ["--r" as string]: `${k * 4}deg`,
              ["--w" as string]: `${size}px`,
              ["--h" as string]: `${size * 1.25}px`,
              ["--drop" as string]: `${Math.abs(k) * 6}px`,
              zIndex: 10 - Math.round(Math.abs(k)),
              background: bg,
              color: fg,
            }}
          >
            <span className="book-title">{c.label}</span>
            <span className="book-lines" aria-hidden="true" />
          </a>
        );
      })}
    </nav>
  );
}

export function NotFound({ what, back = "#/" }: { what: string; back?: string }) {
  return (
    <div className="page page-index">
      <TopBar />
      <main className="index" id="main">
        <h1 className="display">找不到这一页</h1>
        <p className="lead">{what}</p>
        <ul className="rows">
          <Row to={back} title="全部日报" desc="回到主页，按日期选一期" />
        </ul>
      </main>
    </div>
  );
}
