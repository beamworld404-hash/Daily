import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Report } from "@/lib/types";
import { reports } from "@/lib/reports";
import { anchorId, href } from "@/lib/route";
import { activeAnchor, homeEntries, resolveTarget, tocItems } from "@/lib/toc";
import { zhDay, zhWeekday } from "@/lib/format";
import { Rich } from "@/lib/rich";
import { chaptersOf, issueTitle } from "@/components/chapters";
import { ThemeToggle } from "@/components/ui";

/** 「11 月 12 日早报」 */
const shortTitle = (r: Report) => `${Number(r.date.slice(5, 7))} 月 ${Number(r.date.slice(8, 10))} 日${r.edition}`;

/** 「2026.11.12 · 星期四」：列表右侧与期首的日期元信息（只用浅灰，不着色） */
const dotDay = (date: string) => `${date.replaceAll("-", ".")} · ${zhWeekday(date)}`;

/** 第几期：按日期从早到晚数，只数仓库里真实存在的期次 */
const issueNo = (date: string) => {
  const older = reports.filter((r) => r.date <= date).length;
  return older > 0 ? older : null;
};

/** 纯文字列表行：左标题、右日期（参考作品集首页的分组列表） */
function Row({ to, title, meta }: { to: string; title: string; meta?: string }) {
  return (
    <li>
      <a className="row" href={to}>
        <span className="row-title">{title}</span>
        {meta ? <span className="row-meta">{meta}</span> : null}
      </a>
    </li>
  );
}

/** 一组列表：浅灰组名 + 细分隔线，组间大留白 */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const id = `group-${label}`;
  return (
    <section className="group" aria-labelledby={id}>
      <h2 className="group-label" id={id}>
        {label}
      </h2>
      {children}
    </section>
  );
}

/** 右上角只留深浅色切换，没有页头 */
function Corner() {
  return (
    <div className="corner">
      <ThemeToggle />
    </div>
  );
}

/** 阅读线：标题顶端越过视口顶下方这么多像素，就算进入该章 / 节 */
const READ_LINE = 120;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 一期的全文页：期首标题、期数日期与导语，下面依次完整展开全部章节与小节，往下滚即可读完，不折叠。
 * 桌面：左侧固定「← 全部日报」与章节目录（当前章展开它的小节），点击在本页内滚动并高亮阅读位置。
 * 窄屏：目录变成顶部吸附、可横向滚动的一行章节导航。
 * 分章 hash（#/日期/章/节）落在这一页的对应位置。
 */
export function IssuePage({ report, chapterId, sectionId }: { report: Report; chapterId: string | null; sectionId: string | null }) {
  const chapters = useMemo(() => chaptersOf(report), [report]);
  const items = useMemo(() => tocItems(chapters, anchorId), [chapters]);
  const anchors = useMemo(() => items.map((t) => t.id), [items]);
  const [active, setActive] = useState<string | null>(null);
  const firstScroll = useRef(true);
  const tocNavRef = useRef<HTMLElement>(null);

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

  const activeItem = items.find((t) => t.id === active);
  const activeChapter = activeItem?.chapter ?? null;

  // 让高亮项保持在目录可视范围内：桌面纵向、窄屏横向；只滚目录，不动页面
  useEffect(() => {
    const nav = tocNavRef.current;
    if (!nav) return;
    const target = activeItem ? (activeItem.level === 2 && nav.scrollWidth > nav.clientWidth ? activeItem.chapter : activeItem.id) : null;
    const item = target ? nav.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(target)}"]`) : null;
    if (!item) {
      nav.scrollLeft = 0;
      return;
    }
    const n = nav.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (nav.scrollWidth > nav.clientWidth) {
      if (r.left < n.left + 16) nav.scrollLeft += r.left - n.left - 16;
      else if (r.right > n.right - 16) nav.scrollLeft += r.right - n.right + 16;
    } else if (r.top < n.top + 24) nav.scrollTop += r.top - n.top - 24;
    else if (r.bottom > n.bottom - 24) nav.scrollTop += r.bottom - n.bottom + 24;
  }, [activeItem]);

  /** 目录链接：正常改 hash（可分享、可后退）；hash 未变（重复点同一项）时手动滚动 */
  const onTocClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string | null) => {
    if (e.currentTarget.hash === location.hash) {
      e.preventDefault();
      scrollToAnchor(id, true);
    }
  };

  const idx = reports.findIndex((r) => r.date === report.date);
  const newer = idx > 0 ? reports[idx - 1] : undefined;
  const older = idx >= 0 ? reports[idx + 1] : undefined;
  const no = issueNo(report.date);

  return (
    <div className="page page-issue">
      <Corner />

      <aside className="toc" aria-label="本期目录">
        <a className="toc-back" href={href.home()} aria-label="返回全部日报">
          <span className="toc-back-arrow" aria-hidden="true">
            ←
          </span>
          <span className="toc-back-text">全部日报</span>
        </a>
        <nav aria-label={`${shortTitle(report)}目录`} ref={tocNavRef}>
          <ol className="toc-list">
            {items.map((t) =>
              t.level === 1 ? (
                <li key={t.id} className="toc-item-chapter">
                  <a
                    className="toc-chapter"
                    href={href.chapter(report.date, t.chapter)}
                    data-anchor={t.id}
                    data-open={activeChapter === t.chapter ? "" : undefined}
                    aria-current={active === t.id ? "location" : undefined}
                    onClick={(e) => onTocClick(e, t.id)}
                  >
                    {t.title}
                  </a>
                </li>
              ) : (
                <li key={t.id} className="toc-item-section" hidden={activeChapter !== t.chapter || undefined}>
                  <a
                    className="toc-section"
                    href={href.chapter(report.date, t.chapter, t.section ?? undefined)}
                    data-anchor={t.id}
                    aria-current={active === t.id ? "location" : undefined}
                    onClick={(e) => onTocClick(e, t.id)}
                  >
                    {t.title}
                  </a>
                </li>
              ),
            )}
          </ol>
        </nav>
      </aside>

      <main className="column issue" id="main">
        <header className="issue-head">
          <h1 className="issue-title">{shortTitle(report)}</h1>
          <p className="issue-meta">
            {no ? `第 ${no} 期 · ` : ""}
            {zhDay(report.date)} · {zhWeekday(report.date)}
          </p>
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
              <span className="pager-label">上一期</span>
              <span>{issueTitle(older)}</span>
            </a>
          ) : (
            <span />
          )}
          {newer ? (
            <a className="pager-next" href={href.issue(newer.date)}>
              <span className="pager-label">下一期</span>
              <span>{issueTitle(newer)}</span>
            </a>
          ) : (
            <a className="pager-next" href={href.home()}>
              <span className="pager-label">已是最新一期</span>
              <span>全部日报</span>
            </a>
          )}
        </nav>
      </main>
    </div>
  );
}

/**
 * 主页：一段简介，下面是纯文字分组列表——「最新」一期与「往期」，左标题右日期。
 * 只列 web/content/reports/ 里真实存在的期次。
 */
export function HomePage() {
  const entries = homeEntries(reports);
  const [latest, ...past] = entries;
  // 从全文页中段点「← 全部日报」回来时，主页从顶部开始。
  // 必须用花括号、不返回值：新版 Chromium 的 scrollTo 返回 Promise，若被当作 effect
  // 返回值，React 会在主页卸载（点进某期）时把它当清理函数调用而抛错，整页白屏。
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="page page-index">
      <Corner />
      <main className="column index" id="main">
        <header className="intro">
          <h1 className="intro-title">关注清单日报</h1>
          <p className="intro-sub">每天早上一期 · 链上与社区</p>
          <p>汇总关注清单里的链上情绪、协议收入、Trench 热度、新代币榜单与社区动向，每期一页，从上往下读完。</p>
          <p>数据在出报时取得，之后不再改动；每期末尾列出取数清单、覆盖窗口与来源链接，缺失的数据会写明原因。</p>
        </header>

        {latest ? (
          <Group label="最新">
            <ul className="rows" aria-label="最新一期">
              <Row to={href.issue(latest.date)} title={shortTitle(latest)} meta={dotDay(latest.date)} />
            </ul>
            <p className="group-note">
              <Rich text={latest.summary} />
            </p>
          </Group>
        ) : (
          <Group label="最新">
            <p className="group-note">还没有日报。</p>
          </Group>
        )}

        {past.length ? (
          <Group label="往期">
            <ul className="rows" aria-label="往期日报">
              {past.map((r) => (
                <Row key={r.date} to={href.issue(r.date)} title={shortTitle(r)} meta={dotDay(r.date)} />
              ))}
            </ul>
          </Group>
        ) : null}

        <Group label="关于">
          <p className="group-note">共 {entries.length} 期，按日期倒序。每期的章节目录在详情页左侧，手机上在页面顶部。</p>
        </Group>
      </main>
    </div>
  );
}

export function NotFound({ what, back = "#/" }: { what: string; back?: string }) {
  return (
    <div className="page page-index">
      <Corner />
      <main className="column index" id="main">
        <header className="intro">
          <h1 className="intro-title">找不到这一页</h1>
          <p className="intro-sub">{what}</p>
          <p>
            <a className="inline-link" href={back}>
              回到全部日报
            </a>
            ，按日期选一期。
          </p>
        </header>
        {reports.length ? (
          <Group label="现有各期">
            <ul className="rows" aria-label="现有各期">
              {reports.map((r) => (
                <Row key={r.date} to={href.issue(r.date)} title={shortTitle(r)} meta={dotDay(r.date)} />
              ))}
            </ul>
          </Group>
        ) : null}
      </main>
    </div>
  );
}
