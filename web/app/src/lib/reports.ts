import type { Report } from "./types";

// 构建时把 web/content/reports/*.json 全部打包进页面；数据校验由 `npm run check`（validate.py）负责。
const modules = import.meta.glob<Report>("../../../content/reports/*.json", { eager: true, import: "default" });

/** 按日期倒序：[0] 是最新一期 */
export const reports: Report[] = Object.values(modules).sort((a, b) => (a.date < b.date ? 1 : -1));

export function neighbours(date: string) {
  const i = reports.findIndex((r) => r.date === date);
  return {
    newer: i > 0 ? reports[i - 1].date : null,
    older: i >= 0 && i + 1 < reports.length ? reports[i + 1].date : null,
  };
}
