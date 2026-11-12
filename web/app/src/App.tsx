import { useEffect } from "react";
import { reports } from "@/lib/reports";
import { useRoute } from "@/lib/route";
import { zhDay } from "@/lib/format";
import { ArchivePage, IssuePage, NotFound } from "@/components/pages";

export function App() {
  const route = useRoute();
  const date = route.kind === "archive" ? null : route.date ?? reports[0]?.date ?? null;
  const report = date ? reports.find((r) => r.date === date) : undefined;

  useEffect(() => {
    document.title =
      route.kind === "archive" ? "往期 · 关注清单日报" : report ? `${zhDay(report.date)} ${report.edition} · 关注清单日报` : "关注清单日报";
  }, [route.kind, report]);

  if (route.kind === "archive") return <ArchivePage />;
  if (!reports.length) return <NotFound what="还没有日报。新增 web/content/reports/YYYY-MM-DD.json 后重新构建。" />;
  if (!report) return <NotFound what={`没有 ${date} 这一期。`} />;
  // 一期只有一个全文页；分章 hash（#/日期/章/节）只决定打开后滚到哪里
  return <IssuePage report={report} chapterId={route.chapter} sectionId={route.section} />;
}
