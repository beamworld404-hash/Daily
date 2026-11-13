import { useEffect } from "react";
import { reports } from "@/lib/reports";
import { useRoute } from "@/lib/route";
import { zhDay } from "@/lib/format";
import { HomePage, IssuePage, NotFound } from "@/components/pages";

export function App() {
  const route = useRoute();
  const report = route.kind === "issue" ? reports.find((r) => r.date === route.date) : undefined;

  useEffect(() => {
    document.title = report ? `${zhDay(report.date)} ${report.edition} · 关注清单日报` : "关注清单日报";
  }, [report]);

  // 主页按日期列出各期；全文页左上的「← 全部日报」回到这里
  if (route.kind === "home") return <HomePage />;
  if (!report) return <NotFound what={`没有 ${route.date} 这一期。`} />;
  // 一期只有一个全文页；分章 hash（#/日期/章/节）只决定打开后滚到哪里
  return <IssuePage report={report} chapterId={route.chapter} sectionId={route.section} />;
}
