import { useEffect, useMemo, useRef, useState } from "react";
import type { Report } from "@/lib/types";
import { reports } from "@/lib/reports";
import { href } from "@/lib/route";
import { zhDay } from "@/lib/format";
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

/** 一期的目录页：大标题 + 导语 + 章节列表；底部是往期书卡 */
export function IssuePage({ report }: { report: Report }) {
  const chapters = useMemo(() => chaptersOf(report), [report]);
  return (
    <div className="page page-index">
      <TopBar />
      <main className="index" id="main">
        <h1 className="display">{shortTitle(report)}</h1>
        <p className="lead">{report.summary}</p>
        <ul className="rows" aria-label="本期章节">
          {chapters.map((c) => (
            <Row key={c.id} to={href.chapter(report.date, c.id)} title={c.title} desc={c.desc} pill={c.pill} />
          ))}
        </ul>
      </main>
      <BookCards current={report.date} />
    </div>
  );
}

export function ArchivePage() {
  return (
    <div className="page page-index">
      <TopBar />
      <main className="index" id="main">
        <h1 className="display">往期</h1>
        <p className="lead">共 {reports.length} 期，按日期倒序。每期的数据在出报时取得，之后不再改动。</p>
        <ul className="rows" aria-label="往期日报">
          {reports.map((r, i) => (
            <Row key={r.date} to={href.issue(r.date)} title={issueTitle(r)} desc={r.summary} pill={i === 0 ? "最新" : undefined} />
          ))}
        </ul>
      </main>
      <BookCards current="archive" />
    </div>
  );
}

/** 书卡配色：底色 / 字色，大号衬线字对比度 ≥ 3:1 */
const CARD_COLORS: [string, string][] = [
  ["#e54f10", "#ffffc2"],
  ["#f6ebd9", "#524733"],
  ["#0a90d2", "#ffffff"],
  ["#53f399", "#004d00"],
  ["#211f1e", "#f6ebd9"],
  ["#ffd102", "#994000"],
];

/**
 * 页面底部扇形排开的书卡：最近几期 + 往期。固定在视口底部只露出上沿，
 * 悬停或键盘聚焦时抬起。数量少时同样居中对称。
 */
function BookCards({ current }: { current: string }) {
  const cards = [
    ...reports.slice(0, 5).map((r) => ({ key: r.date, to: href.issue(r.date), label: `${Number(r.date.slice(5, 7))} 月 ${Number(r.date.slice(8, 10))} 日\n${r.edition}`, name: issueTitle(r) })),
    { key: "archive", to: href.archive(), label: "往期\n归档", name: "往期" },
  ];
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
            aria-current={c.key === current ? "page" : undefined}
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

/** 章节详情：左侧固定目录、居中正文、底部上一章 / 下一章 */
export function ChapterPage({ report, chapterId, sectionId }: { report: Report; chapterId: string; sectionId: string | null }) {
  const chapters = useMemo(() => chaptersOf(report), [report]);
  const index = chapters.findIndex((c) => c.id === chapterId);
  const chapter = chapters[index];
  const [active, setActive] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement>(null);

  // 打开时滚到指定小节，否则回到顶部
  useEffect(() => {
    const el = sectionId ? document.getElementById(sectionId) : null;
    if (el) el.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [chapterId, sectionId]);

  // 左侧目录高亮当前阅读的小节
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const heads = [...root.querySelectorAll<HTMLElement>("h2[id]")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [chapter]);

  if (!chapter) return <NotFound what={`这一期没有「${chapterId}」这一章。`} back={href.issue(report.date)} />;
  const prev = chapters[index - 1];
  const next = chapters[index + 1];
  const issueHref = href.issue(report.date);

  return (
    <div className="page page-chapter">
      <aside className="toc">
        <a className="back" href={issueHref}>
          <span className="arrow" aria-hidden="true">
            ←
          </span>
          {zhDay(report.date)}
        </a>
        <nav aria-label="本章小节">
          {chapter.sections.map((s) => (
            <a
              key={s.id}
              href={href.chapter(report.date, chapter.id, s.id)}
              aria-current={(active ?? chapter.sections[0]?.id) === s.id ? "location" : undefined}
            >
              {s.title}
            </a>
          ))}
        </nav>
      </aside>
      <main className="chapter" id="main">
        <a className="back back-inline" href={issueHref}>
          <span className="arrow" aria-hidden="true">
            ←
          </span>
          {zhDay(report.date)}
        </a>
        <header className="chapter-head">
          <h1>{chapter.title}</h1>
          <div className="chapter-tools">
            <ThemeToggle />
          </div>
        </header>
        <article className="prose" ref={articleRef}>
          {chapter.lead}
          {chapter.sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id}>
              <h2 id={s.id}>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
        <nav className="pager" aria-label="上一章与下一章">
          {prev ? (
            <a className="pager-prev" href={href.chapter(report.date, prev.id)}>
              <span className="arrow" aria-hidden="true">
                ←
              </span>
              <span>{prev.title}</span>
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a className="pager-next" href={href.chapter(report.date, next.id)}>
              <span>{next.title}</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </a>
          ) : (
            <a className="pager-next" href={issueHref}>
              <span>回到本期目录</span>
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

export function NotFound({ what, back = "#/" }: { what: string; back?: string }) {
  return (
    <div className="page page-index">
      <TopBar />
      <main className="index" id="main">
        <h1 className="display">找不到这一页</h1>
        <p className="lead">{what}</p>
        <ul className="rows">
          <Row to={back} title="返回" desc="回到上一级目录" />
          <Row to={href.archive()} title="往期" desc="查看全部日报" />
        </ul>
      </main>
    </div>
  );
}
