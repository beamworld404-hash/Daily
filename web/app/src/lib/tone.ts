/**
 * 关键数字的语义着色。颜色只表达含义，不做装饰：
 * - 恐惧与贪婪：按 Alternative.me 的五档区间（0–24 极度恐惧 / 25–46 恐惧 / 47–54 中性 / 55–75 贪婪 / 76–100 极度贪婪）
 * - 涨跌：升为绿、降为红、持平为灰
 * - 冷热（Trench 分数、历史分位、占历史最高的比例）：低为蓝（冷）、中段不着色、高为橙（热）
 * 对应的 CSS 类在 styles.css 的「关键数字着色」一节，浅色 / 深色各有一套。
 */

export type FngTone = "xfear" | "fear" | "neutral" | "greed" | "xgreed";
export type DirTone = "up" | "down" | "flat";
export type HeatTone = "cold" | "mild" | "hot";
export type Tone = FngTone | DirTone | HeatTone;

export function fngTone(value: number): FngTone {
  if (value <= 24) return "xfear";
  if (value <= 46) return "fear";
  if (value <= 54) return "neutral";
  if (value <= 75) return "greed";
  return "xgreed";
}

export const dirTone = (delta: number): DirTone => (delta > 0 ? "up" : delta < 0 ? "down" : "flat");

/** 0–100 的冷热刻度：< 40 冷，≥ 60 热，中间不着色 */
export const heatTone = (score: number): HeatTone => (score < 40 ? "cold" : score >= 60 ? "hot" : "mild");

/** Trench 优先按数据给的标签（cold / hot …），没有可识别的标签再按分数 */
export function trenchTone(score: number, label?: string): HeatTone {
  const l = (label ?? "").toLowerCase();
  if (/cold|cool|冷/.test(l)) return "cold";
  if (/hot|warm|热/.test(l)) return "hot";
  if (/neutral|mild|温|中/.test(l)) return "mild";
  return heatTone(score);
}

export const toneClass = (t: Tone) => `tone tone-${t}`;

export type Segment = { text: string; tone?: Tone };

/**
 * 把一段纯文本里的关键数字切出来并标上语义色调，供正文（要点、导语、提示）使用。
 * 只识别有明确含义的写法，其余原样保留：
 *   「恐惧贪婪指数 28（恐惧）」「恐惧与贪婪 28」→ 恐惧/贪婪区间色
 *   「Trench 37（冷）」「Trench 11-10 为 37（冷）」→ 冷热色
 *   「升 1 分」「下降 1 点」「降 2.5%」→ 涨跌色
 *   「占 3.01%」「占历史最高 16.26%」→ 冷热色（离历史最高越远越冷）
 */
const PATTERNS: { re: RegExp; tone: (m: RegExpExecArray) => Tone; group: number }[] = [
  {
    re: /恐惧(?:与)?贪婪(?:指数)?\s*(?:为\s*)?(\d{1,3}(?:（[^）]{1,6}）)?)/g,
    tone: (m) => fngTone(parseInt(m[1], 10)),
    group: 1,
  },
  {
    re: /Trench\s*(?:\d{2}-\d{2}\s*)?(?:为\s*)?(\d{1,3}(?:（([^）]{1,6})）)?)/g,
    tone: (m) => trenchTone(parseInt(m[1], 10), m[2]),
    group: 1,
  },
  {
    re: /((?:上升|下降|升|降)\s*\d+(?:\.\d+)?\s*(?:个百分点|点|分|%)?)/g,
    tone: (m) => (/升/.test(m[1]) ? "up" : "down"),
    group: 1,
  },
  {
    re: /占(?:历史最高(?:的)?)?\s*(\d+(?:\.\d+)?%)/g,
    tone: (m) => heatTone(parseFloat(m[1])),
    group: 1,
  },
];

export function toneSegments(text: string): Segment[] {
  type Hit = { start: number; end: number; tone: Tone };
  const hits: Hit[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
      const g = m[p.group];
      const start = m.index + m[0].lastIndexOf(g);
      hits.push({ start, end: start + g.length, tone: p.tone(m) });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Segment[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.start < at) continue; // 重叠时保留先出现、更长的一段
    if (h.start > at) out.push({ text: text.slice(at, h.start) });
    out.push({ text: text.slice(h.start, h.end), tone: h.tone });
    at = h.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
