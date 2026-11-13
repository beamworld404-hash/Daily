import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "daily-theme"; // 与 index.html 首屏脚本同一个 key

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* 隐私模式下不记忆 */
      }
      return next;
    });
  return { theme, toggle };
}
