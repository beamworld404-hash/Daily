import { useEffect, useState } from "react";

/**
 * hash 路由（静态托管在任意子路径都能用）：
 *   #/                      最新一期目录
 *   #/2026-11-12            某一期目录
 *   #/2026-11-12/onchain    某一期的某一章
 *   #/2026-11-12/onchain/fng 某一章并滚动到某一节
 *   #/archive               往期
 */
export type Route =
  | { kind: "issue"; date: string | null }
  | { kind: "chapter"; date: string; chapter: string; section: string | null }
  | { kind: "archive" };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "archive") return { kind: "archive" };
  if (!parts[0]) return { kind: "issue", date: null };
  if (!parts[1]) return { kind: "issue", date: parts[0] };
  return { kind: "chapter", date: parts[0], chapter: parts[1], section: parts[2] ?? null };
}

export const href = {
  issue: (date: string) => `#/${date}`,
  chapter: (date: string, chapter: string, section?: string) =>
    `#/${date}/${chapter}${section ? `/${section}` : ""}`,
  archive: () => "#/archive",
};

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}
