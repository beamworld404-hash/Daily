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
  // 一期只有一个全文页；分章 hash（#/日期/章/节）只决定打开后滚到哪里。
  // 按日期换 key：从一期换到另一期是重新打开（直接跳到落点），不沿用上一期的滚动与高亮状态
  return <IssuePage key={report.date} report={report} chapterId={route.chapter} sectionId={route.section} />;
}
