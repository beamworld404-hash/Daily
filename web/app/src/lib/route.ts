import { useEffect, useState } from "react";

/**
 * hash 路由（静态托管在任意子路径都能用）：
 *   #/                        主页：按日期列出各期日报
 *   #/2026-11-12              某一期全文
 *   #/2026-11-12/onchain      同一页全文，滚动到「情绪与收入」一章
 *   #/2026-11-12/onchain/fng  同一页全文，滚动到该章的某一节
 *   #/archive                 旧的「往期」地址，现与主页相同
 *
 * 一期只有一个页面：分章 hash 不再打开只含一章的页面，只决定滚动位置。
 */
export type Route = { kind: "home" } | { kind: "issue"; date: string; chapter: string | null; section: string | null };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(safeDecode);
  if (!parts.length || parts[0] === "archive") return { kind: "home" };
  return { kind: "issue", date: parts[0], chapter: parts[1] ?? null, section: parts[2] ?? null };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const href = {
  home: () => "#/",
  issue: (date: string) => `#/${date}`,
  chapter: (date: string, chapter: string, section?: string) =>
    `#/${date}/${encodeURIComponent(chapter)}${section ? `/${encodeURIComponent(section)}` : ""}`,
};

/**
 * 全文页里章、节的 DOM id。不同章可能有同名小节（或小节与章同名，如 trench/trench），
 * 所以小节 id 带上章 id 前缀。
 */
export const anchorId = (chapter: string, section?: string | null) =>
  section ? `${chapter}--${section}` : chapter;

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}
