import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { Tone } from "@/lib/tone";

/** 描边胶囊标签（对应参考站列表右侧的 NEW） */
export function Pill({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** 正文里的「名称 — 说明」条目，名称加重 */
export function Term({ name, children }: { name: ReactNode; children?: ReactNode }) {
  return (
    <li>
      <span className="term">{name}</span>
      {children ? <> — {children}</> : null}
    </li>
  );
}

export type Column<T> = {
  label: string;
  cell: (row: T) => ReactNode;
  num?: boolean;
};

/** 数据表：窄屏横向滚动，数字列右对齐等宽 */
export function Table<T>({ rows, columns, caption }: { rows: T[]; columns: Column<T>[]; caption?: string }) {
  return (
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} scope="col" className={c.num ? "num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.label} className={c.num ? "num" : undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 小提示框：修订、口径冲突等 */
export function Note({ title, tone = "info", children }: { title?: string; tone?: "info" | "warning" | "danger"; children: ReactNode }) {
  return (
    <aside className={`note note-${tone}`}>
      {title ? <p className="note-title">{title}</p> : null}
      <div className="note-body">{children}</div>
    </aside>
  );
}

/**
 * 单序列柱状图：柱宽 ≤ 20px、顶端 4px 圆角，只标注最后一根（最新）的数值；
 * 完整数值在下方可展开的表格里，读屏用户直接读表。
 */
export function Columns({
  points,
  format,
  label,
  tone,
}: {
  points: { key: string; tick: string; value: number }[];
  format: (v: number) => string;
  label: string;
  /** 最新一根柱与数值的语义色（涨跌、冷热）；不给则用强调色 */
  tone?: Tone;
}) {
  const max = Math.max(...points.map((p) => p.value), 0) || 1;
  const last = points.length - 1;
  return (
    <figure className={`chart${tone ? ` chart-tone-${tone}` : ""}`}>
      <div className="chart-plot" aria-hidden="true">
        {points.map((p, i) => (
          <div className="chart-slot" key={p.key} title={`${p.tick}　${format(p.value)}`}>
            {i === last ? <span className="chart-value">{format(p.value)}</span> : null}
            <span className={`chart-bar${i === last ? " is-latest" : ""}`} style={{ height: `${(p.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="chart-axis" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.key}>{i === last || (i % 3 === 0 && last - i >= 2) ? p.tick : ""}</span>
        ))}
      </div>
      <details className="chart-table">
        <summary>{label}：逐日数值</summary>
        <Table
          caption={label}
          rows={points}
          columns={[
            { label: "日期", cell: (p) => p.key },
            { label: "数值", cell: (p) => format(p.value), num: true },
          ]}
        />
      </details>
    </figure>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? "切换到浅色" : "切换到深色"} title={dark ? "浅色" : "深色"}>
      {dark ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2Z" />
        </svg>
      )}
    </button>
  );
}

/** 站点标记：左上角 32px，点回首页 */
export function Mark() {
  return (
    <a className="mark" href="#/" aria-label="关注清单日报首页">
      <span aria-hidden="true">报</span>
    </a>
  );
}
