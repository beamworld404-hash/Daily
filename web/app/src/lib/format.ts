/**
 * 数字与日期格式化。usd() 与旧版日报 formatUsd、web/dailysite/fmt.py 口径一致：
 * $ + 两位小数 + K/M/B；K 以上先 Math.round((x + EPSILON) * 100) / 100 再 toFixed(2)。
 */

export type UsdParts = { sign: "" | "-"; amount: number; text: string; unit: "" | "K" | "M" | "B" };

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function usdParts(value: number): UsdParts {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n < 1_000) return { sign, amount: n, text: n.toFixed(2), unit: "" };
  const [div, unit]: [number, UsdParts["unit"]] = n < 1e6 ? [1e3, "K"] : n < 1e9 ? [1e6, "M"] : [1e9, "B"];
  const amount = round2(n / div);
  return { sign, amount, text: amount.toFixed(2), unit };
}

export function usd(value: number): string {
  const p = usdParts(value);
  return `${p.sign}$${p.text}${p.unit}`;
}

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/** 千分位整数 */
export const num = (value: number) => grouped.format(value);
export const pct = (value: number) => `${value.toFixed(2)}%`;
export const changePct = (latest: number, previous: number) => (latest / previous - 1) * 100;
export const arrow = (d: number) => (d > 0 ? "↑" : d < 0 ? "↓" : "→");
/** '2026-11-10' → '11-10' */
export const mmdd = (date: string) => (date.length === 10 ? date.slice(5) : date);

const WEEKDAYS = "日一二三四五六";
function ymd(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
export const zhDay = (date: string) => {
  const { y, m, d } = ymd(date);
  return `${y} 年 ${m} 月 ${d} 日`;
};
export const zhWeekday = (date: string) => `星期${WEEKDAYS[ymd(date).wd]}`;
/** 升 / 降 / 持平 + 绝对值 + 单位，如「降 1 点」 */
export const moved = (d: number, unit: string) =>
  d > 0 ? `升 ${Math.abs(d)} ${unit}` : d < 0 ? `降 ${Math.abs(d)} ${unit}` : "持平";
