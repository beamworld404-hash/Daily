import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { GridBackground } from "@/components/ui/grid-background";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented-control";
import { mmdd, zhDay, zhWeekday } from "@/lib/format";
import { neighbours, reports } from "@/lib/reports";
import { Rich } from "@/lib/rich";
import type { Report } from "@/lib/types";
import { Community, Defined, Methods, XDigest } from "./components/site/Feeds";
import { Onchain } from "./components/site/Onchain";
import { Overview } from "./components/site/Overview";
import { Tag } from "./components/site/parts";

/* ---------------- 路由：hash，静态托管和任意子路径都能用 ----------------
   #/                    最新一期
   #/2026-11-12          某一期（概览）
   #/2026-11-12/onchain  某一期的某个分区
   #/archive             往期                                               */

type Route = { view: "archive" } | { view: "report"; date: string | null; tab: string | null };

function parse(hash: string): Route {
  const [a, b] = hash.replace(/^#\/?/, "").split("/");
  if (a === "archive") return { view: "archive" };
  return { view: "report", date: /^\d{4}-\d{2}-\d{2}$/.test(a ?? "") ? a : null, tab: b || null };
}
const subscribe = (cb: () => void) => (window.addEventListener("hashchange", cb), () => window.removeEventListener("hashchange", cb));
const useHash = () => useSyncExternalStore(subscribe, () => window.location.hash);
const go = (path: string) => {
  window.location.hash = path;
};

/* ---------------- 深浅色：跟随系统 / 浅 / 深，记在本机 ---------------- */

type Theme = "system" | "light" | "dark";
const KEY = "daily-theme";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || "system");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return [theme, setTheme] as const;
}

const Icon = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const THEMES: SegmentOption<Theme>[] = [
  { value: "system", ariaLabel: "跟随系统", icon: <Icon d="M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3" /> },
  { value: "light", ariaLabel: "浅色", icon: <Icon d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /> },
  { value: "dark", ariaLabel: "深色", icon: <Icon d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" /> },
];

/* ---------------- 页面 ---------------- */

export function App() {
  const route = parse(useHash());
  const [theme, setTheme] = useTheme();
  const report = route.view === "report" ? (route.date ? reports.find((r) => r.date === route.date) : reports[0]) : undefined;

  useEffect(() => {
    document.title = report ? `关注清单日报 · ${report.date} ${report.edition}` : "关注清单日报 · 往期";
  }, [report]);

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
        跳到正文
      </a>
      <header className="topbar">
        <div className="topbar__in">
          <a className="brand" href="#/">
            <span className="brand__mark" aria-hidden="true">
              日
            </span>
            <span className="brand__text">关注清单日报</span>
          </a>
          <nav className="topbar__nav" aria-label="期数导航">
            {report && (
              <span className="topbar__issue">
                <IssueNav date={report.date} />
              </span>
            )}
            <Button variant={route.view === "archive" ? "secondary" : "ghost"} size="sm" onClick={() => go("/archive")}>
              往期
            </Button>
          </nav>
          <SegmentedControl aria-label="外观" size="sm" options={THEMES} value={theme} onChange={setTheme} />
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {route.view === "archive" ? (
          <Archive />
        ) : report ? (
          <ReportView key={report.date} report={report} tab={route.tab} />
        ) : (
          <NotFound date={route.date} />
        )}
      </main>

      <footer className="foot">
        <p>关注清单日报 · 私有资料，请勿公开转发。数据与口径以各节说明为准，非交易建议。</p>
      </footer>
    </>
  );
}

function IssueNav({ date }: { date: string }) {
  const { newer, older } = neighbours(date);
  return (
    <>
      <Button variant="ghost" size="sm" disabled={!older} onClick={() => older && go(`/${older}`)} aria-label={older ? `前一期 ${older}` : "没有更早的一期"}>
        ← {older ? mmdd(older) : "前一期"}
      </Button>
      <Button variant="ghost" size="sm" disabled={!newer} onClick={() => newer && go(`/${newer}`)} aria-label={newer ? `后一期 ${newer}` : "已是最新一期"}>
        {newer ? mmdd(newer) : "后一期"} →
      </Button>
    </>
  );
}

const TABS = ["overview", "onchain", "defined", "community", "x", "methods"] as const;
type Tab = (typeof TABS)[number];

function tabsOf(r: Report): SegmentOption<Tab>[] {
  const xCount = r.x_digest?.accounts?.reduce((s, a) => s + a.items.length, 0) ?? 0;
  const partial = r.methods.checklist.filter((c) => c.status !== "ok").length;
  const opts: (SegmentOption<Tab> | false)[] = [
    { value: "overview", label: "概览" },
    !!r.tehc && { value: "onchain", label: "链上" },
    !!r.defined && { value: "defined", label: "新池", count: r.defined.tokens.length },
    !!(r.reddit || r.github) && { value: "community", label: "社区", count: r.reddit?.posts.length },
    !!r.x_digest && { value: "x", label: "X 摘要", count: xCount || undefined },
    { value: "methods", label: "来源", count: partial ? `${partial} 项未完成` : undefined },
  ];
  return opts.filter((o): o is SegmentOption<Tab> => !!o).map((o) => ({ ...o, controls: `panel-${o.value}` }));
}

function ReportView({ report: r, tab }: { report: Report; tab: string | null }) {
  const options = tabsOf(r);
  const active: Tab = options.some((o) => o.value === tab) ? (tab as Tab) : "overview";
  const select = (t: Tab) => {
    window.history.replaceState(null, "", `#/${r.date}${t === "overview" ? "" : `/${t}`}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <>
      <GridBackground className="hero" size={44} speed={6} fade={80}>
        <div className="hero__in">
          <p className="hero__eyebrow">
            <Tag tone="info">{r.edition}</Tag>
            <span>出报 {r.issued_at}（北京时间）</span>
          </p>
          <h1>
            {zhDay(r.date)}
            <span className="hero__wd">{zhWeekday(r.date)}</span>
          </h1>
          <p className="hero__lede">
            <Rich text={r.summary} />
          </p>
          <p className="hero__cov">覆盖窗口：{r.coverage}</p>
        </div>
      </GridBackground>

      <div className="tabs">
        <div className="tabs__in">
          <SegmentedControl aria-label="本期分区" kind="tabs" variant="underline" options={options} value={active} onChange={select} />
        </div>
      </div>

      <div className="panel" role="tabpanel" id={`panel-${active}`} aria-label={options.find((o) => o.value === active)?.label as string}>
        {active === "overview" && <Overview report={r} />}
        {active === "onchain" && r.tehc && <Onchain tehc={r.tehc} />}
        {active === "defined" && r.defined && <Defined d={r.defined} />}
        {active === "community" && <Community rd={r.reddit} gh={r.github} />}
        {active === "x" && r.x_digest && <XDigest x={r.x_digest} />}
        {active === "methods" && <Methods m={r.methods} coverage={r.coverage} />}
      </div>
    </>
  );
}

function Archive() {
  const byMonth = new Map<string, Report[]>();
  for (const r of reports) byMonth.set(r.date.slice(0, 7), [...(byMonth.get(r.date.slice(0, 7)) ?? []), r]);
  return (
    <div className="archive">
      <h1>往期日报</h1>
      <p className="muted">共 {reports.length} 期，按日期倒序。</p>
      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} aria-labelledby={`m-${month}`}>
          <h2 id={`m-${month}`}>
            {month.slice(0, 4)} 年 {Number(month.slice(5))} 月
          </h2>
          <ul className="issues">
            {list.map((r, i) => (
              <li key={r.date}>
                <a className="tray issue" href={`#/${r.date}`}>
                  <span className="tray__card">
                    <span className="issue__head">
                      <strong>
                        {zhDay(r.date)} · {zhWeekday(r.date)}
                      </strong>
                      <Tag tone="info">{r.edition}</Tag>
                      {r === reports[0] && i === 0 && <Tag tone="good">最新</Tag>}
                    </span>
                    <span className="issue__sum">{r.summary.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotFound({ date }: { date: string | null }) {
  return (
    <div className="archive">
      <h1>{date ? `没有 ${date} 这一期` : "还没有日报"}</h1>
      <p className="muted">请从往期列表里选择。</p>
      <Button onClick={() => go("/archive")}>查看往期</Button>
    </div>
  );
}
