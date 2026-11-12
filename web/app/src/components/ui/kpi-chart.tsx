"use client";

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/*
 * KPI Chart – a metric card with a multi-line chart and a hover tooltip, in a single self-contained file.
 * The styles are injected below, so no extra files are needed.
 */

export type KpiSeries = {
  label: string;
  /** Line color, any CSS color */
  color: string;
  /** One value per label, same length as `labels` */
  values: number[];
};

export type KpiChartProps = {
  title: string;
  /** Headline value, already formatted, e.g. "$96.4k" */
  value: string;
  /** Change against the previous period – positive is green, negative red */
  delta?: number;
  /** Short labels along the x-axis, e.g. "Mar 4" */
  labels: string[];
  /** Longer labels for the tooltip header, e.g. "Tue, Mar 4" – falls back to `labels` */
  tooltipLabels?: string[];
  series: KpiSeries[];
  /** Formats the axis, tooltip and delta values */
  format?: (n: number) => string;
  /** Line under the chart */
  footer?: string;
  /** Point that stays highlighted while nobody hovers – leave empty to hide the tooltip at rest */
  defaultIndex?: number;
  /** Quiet text in the plot when there is nothing to draw */
  emptyText?: string;
  className?: string;
};

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
/** The value of 100% when the formatter writes percentages – 100 for (n) => `${n}%`, 1 for fractions – else 0 */
const percentScale = (format: (n: number) => string) => {
  try {
    const one = String(format(1));
    if (!/%\s*$/.test(one) || !/%\s*$/.test(String(format(50)))) return 0;
    return Math.abs(parseFloat(one.replace(/[^\d.]/g, "")) - 100) < 1e-6 ? 1 : 100;
  } catch {
    return 0;
  }
};
/** 0.0004 → "0.0004", 4200 → "4.2k", 12,345,678 → "12M" */
const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1000) return `${+(n / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  if (a > 0 && a < 1) return `${+n.toPrecision(2)}`;
  return `${Math.round(n)}`;
};

/** Rounds the top of the axis up to a value that halves cleanly: 30 → 15 → 0, $8k → $4k → $0 */
function niceMax(max: number) {
  if (!finite(max) || max < 0) max = 0;
  const half = max / 2 || 1;
  const pow = 10 ** Math.floor(Math.log10(half));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= half) ?? 10;
  return step * pow * 2;
}

export function KpiChart({
  title,
  value,
  delta,
  labels = [],
  tooltipLabels,
  series = [],
  format = compact,
  footer,
  defaultIndex,
  emptyText = "No data yet",
  className,
}: KpiChartProps) {
  const count = labels.length;
  // A point that exists – anything else (out of range, NaN) shows no point
  const clamp = (i: number | null | undefined) =>
    i == null || !finite(i) || count === 0 ? null : Math.min(count - 1, Math.max(0, Math.round(i)));
  const [hover, setHover] = useState<number | null>(null);
  // One value per label – NaN, Infinity and values past the last label are left out
  const vals = useMemo(() => series.map((s) => (s.values ?? []).slice(0, count).map((v) => (finite(v) ? v : null))), [series, count]);
  const all = vals.flat().filter(finite);
  const percent = percentScale(format);
  // Nothing to draw: no points, no values, or only zeros – except 0% on a percent axis, which is a reading
  const empty = all.length === 0 || (!percent && all.every((v) => v === 0));
  const active = empty ? null : (hover ?? clamp(defaultIndex));
  // The tooltip keeps its last content while it fades out
  const [shown, setShown] = useState(active ?? 0);
  if (active !== null && active !== shown) setShown(active);
  const cur = Math.min(shown, Math.max(0, count - 1));
  // Percent axes get a sensible span: all 0% reads 0–100%, small rates at least 0–10%
  const top = Math.max(0, ...all);
  const max = !percent ? niceMax(top) : top === 0 ? percent : niceMax(Math.max(top, percent / 10));
  // Negative values get room below zero, mirrored to a round step
  const low = Math.min(0, ...all);
  const min = low < 0 ? -niceMax(-low) : 0;
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * 100 : 50);
  const y = (v: number) => ((max - v) / (max - min)) * 100;
  // A gap where a value is missing, instead of a line through NaN
  const paths = useMemo(
    () =>
      vals.map((vs) => {
        let d = "";
        vs.forEach((v, i) => {
          if (v === null) return;
          d += `${d && vs[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`;
        });
        return d;
      }),
    [vals, max, min, count], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A point with no neighbour draws no line (one version, or a value between gaps) – it gets a dot
  const lone = vals.flatMap((vs, k) =>
    vs.flatMap((v, i) => (v !== null && (vs[i - 1] ?? null) === null && (vs[i + 1] ?? null) === null ? [{ k, i, v }] : [])),
  );

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    return clamp(ratio * (count - 1));
  };

  const onKey = (e: KeyboardEvent) => {
    if (count === 0 || empty) return;
    const from = active ?? (e.key === "ArrowLeft" ? count : -1);
    if (e.key === "ArrowRight") setHover(Math.min(count - 1, from + 1));
    else if (e.key === "ArrowLeft") setHover(Math.max(0, from - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const rows = series
    .map((s, k) => ({ ...s, key: k, value: vals[k][cur] ?? null }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const flip = x(cur) > 50;

  // The tooltip stays inside the card: it slides back in when its side has too little room
  const rootRef = useRef<HTMLElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const plot = plotRef.current;
    const tip = tipRef.current;
    if (!root || !plot || !tip) return;
    const card = root.getBoundingClientRect();
    const box = plot.getBoundingClientRect();
    const w = tip.offsetWidth;
    const anchor = box.left + (x(cur) / 100) * box.width;
    const left = flip ? anchor - 14 - w : anchor + 14;
    const lo = card.left + 8;
    const hi = card.right - 8 - w;
    setNudge(Math.round(left < lo ? lo - left : left > hi ? Math.max(lo, hi) - left : 0));
  });
  const axis = [0, Math.round(count / 2 - 0.5), count - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <>
      <style href="ui-kpi-chart" precedence="default">
        {css}
      </style>
      <section className={["ui-kpi", className].filter(Boolean).join(" ")} ref={rootRef}>
        <h3 className="ui-kpi__title" title={title} dir="auto">{title}</h3>
        <p className="ui-kpi__value">
          <span className="ui-kpi__amount">{value}</span>
          {finite(delta) && delta !== 0 && (
            <span className="ui-kpi__delta" data-trend={delta > 0 ? "up" : "down"}>
              {delta > 0 ? "+" : "−"}
              {format(Math.abs(delta))}
            </span>
          )}
        </p>

        <div className="ui-kpi__chart">
          <div className="ui-kpi__yaxis" aria-hidden="true">
            {!empty && (
              <>
                <span>{format(max)}</span>
                <span>{format((max + min) / 2)}</span>
                <span>{format(min)}</span>
              </>
            )}
          </div>

          <div
            className="ui-kpi__plot"
            tabIndex={empty ? undefined : 0}
            role="group"
            aria-label={empty ? `${title} chart – ${emptyText}` : `${title} chart – use the arrow keys to read the values per day`}
            data-empty={empty || undefined}
            ref={plotRef}
              onPointerMove={(e) => setHover(indexAt(e))}
            onPointerDown={(e) => setHover(indexAt(e))}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={onKey}
          >
            <span className="ui-kpi__grid" style={{ top: "0%" }} />
            <span className="ui-kpi__grid" style={{ top: "50%" }} />
            <span className="ui-kpi__grid" style={{ top: "100%" }} />

            {empty && <p className="ui-kpi__empty" title={emptyText}>{emptyText}</p>}

            <svg className="ui-kpi__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {series.map((s, k) => (
                <path
                  key={k}
                  d={paths[k]}
                  stroke={s.color}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {lone.map((p) => (
              <span
                key={`${p.k}-${p.i}`}
                className="ui-kpi__point"
                style={{ left: `${x(p.i)}%`, top: `${y(p.v)}%`, background: series[p.k].color }}
                aria-hidden="true"
              />
            ))}

            <div className="ui-kpi__marker" data-open={active !== null || undefined} aria-hidden="true">
              <span className="ui-kpi__guide" style={{ left: `${x(cur)}%` }} />
              {series.map((s, k) =>
                vals[k][cur] === null ? null : (
                  <span
                    key={k}
                    className="ui-kpi__dot"
                    style={{ left: `${x(cur)}%`, top: `${y(vals[k][cur] ?? 0)}%`, background: s.color }}
                  />
              ),
              )}
            </div>

            <div
              className="ui-kpi__tooltip"
              data-open={active !== null || undefined}
              data-side={flip ? "left" : "right"}
              ref={tipRef}
              style={{ left: `${x(cur)}%`, ["--ui-kpi-nudge" as string]: `${nudge}px` }}
              role="status"
              aria-live="polite"
            >
              <p className="ui-kpi__date">{(tooltipLabels ?? labels)[cur]}</p>
              <ul>
                {rows.map((r) => (
                  <li key={r.key}>
                    <span className="ui-kpi__swatch" style={{ background: r.color }} />
                    <span className="ui-kpi__label" dir="auto">{r.label}</span>
                    <span className="ui-kpi__num">{r.value === null ? "—" : format(r.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="ui-kpi__xaxis" aria-hidden="true">
            {axis.map((i) => (
              <span key={i} style={{ left: `${x(i)}%` }} data-edge={i === 0 ? "start" : i === count - 1 ? "end" : undefined}>
                {labels[i]}
              </span>
            ))}
          </div>
        </div>

        {footer && (
          <p className="ui-kpi__footer" dir="auto">
            {footer}
          </p>
        )}
      </section>
    </>
  );
}

const css = /* css */ `
.ui-kpi {
  --ui-kpi-card: var(--aui-surface, #ffffff);
  --ui-kpi-line: var(--aui-border, #ebebeb);
  --ui-kpi-grid: #f0f0f0;
  --ui-kpi-ink: var(--aui-ink, #171717);
  --ui-kpi-muted: var(--aui-muted, #8f8f8f);
  --ui-kpi-up: var(--aui-success, #1e8a4f);
  --ui-kpi-down: var(--aui-red, #f04438);
  --ui-kpi-guide: #d9d9d9;
  --ui-kpi-label: var(--aui-muted, #525252);
  --ui-kpi-focus: var(--aui-focus, rgba(0, 96, 226, 0.7));
  --ui-kpi-shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 8px 24px rgba(0, 0, 0, 0.035);
  --ui-kpi-tip-shadow: var(--aui-shadow-popover, 0 8px 24px -6px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04));
  --ui-kpi-ease: var(--aui-ease, cubic-bezier(0.22, 1, 0.36, 1));
  box-sizing: border-box;
  container-type: inline-size;
  width: 100%;
  max-width: 460px;
  padding: 20px 20px 18px;
  background: var(--ui-kpi-card);
  border: 1px solid var(--ui-kpi-line);
  border-radius: calc(var(--aui-radius-lg, 16px) + 4px);
  box-shadow: var(--ui-kpi-shadow);
  font-family: var(--aui-font, "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--ui-kpi-ink);
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
.ui-kpi *, .ui-kpi *::before, .ui-kpi *::after { box-sizing: border-box; }

.ui-kpi__title {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  color: var(--ui-kpi-muted);
}
.ui-kpi__value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin: 8px 0 0;
  font-size: 28px;
  font-weight: 500;
  line-height: 34px;
  letter-spacing: -0.02em;
}
.ui-kpi__delta {
  flex: none;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 450;
  letter-spacing: 0;
}
.ui-kpi__amount { min-width: 0; overflow-wrap: anywhere; }
.ui-kpi__delta[data-trend="up"] { color: var(--ui-kpi-up); }
.ui-kpi__delta[data-trend="down"] { color: var(--ui-kpi-down); }

/* Chart: y labels on the left, plot on the right, x labels below */
.ui-kpi__chart {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 116px 20px;
  column-gap: 12px;
  row-gap: 8px;
  margin-top: 24px;
}
.ui-kpi__yaxis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin: -9px 0;
  font-size: 12px;
  line-height: 18px;
  text-align: right;
  color: var(--ui-kpi-muted);
}
.ui-kpi__plot {
  position: relative;
  touch-action: pan-y;
  border-radius: 4px;
  outline: none;
  cursor: crosshair;
}
.ui-kpi__plot:focus-visible {
  outline: 2px solid var(--ui-kpi-focus);
  outline-offset: 2px;
}
.ui-kpi__grid {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ui-kpi-grid);
}
.ui-kpi__lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: ui-kpi-draw 1100ms var(--ui-kpi-ease) both;
}
.ui-kpi__lines path {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Hover marker: thin guide and one dot per line */
.ui-kpi__marker {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
}
.ui-kpi__marker[data-open] { opacity: 1; }
.ui-kpi__guide,
.ui-kpi__dot {
  position: absolute;
  transition: left 220ms var(--ui-kpi-ease), top 220ms var(--ui-kpi-ease);
}
.ui-kpi__guide {
  top: -4px;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: var(--ui-kpi-guide);
}
.ui-kpi__dot {
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--ui-kpi-card);
}

/* A point without neighbours (one version, or a value between gaps) draws no line – it gets a dot */
.ui-kpi__point {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--ui-kpi-card);
  pointer-events: none;
  animation: ui-kpi-pop 400ms var(--ui-kpi-ease) both;
}

/* Nothing to draw: the grid stays, a quiet line sits on the middle one */
.ui-kpi__plot[data-empty] { cursor: default; }
.ui-kpi__plot[data-empty] > :not(.ui-kpi__grid, .ui-kpi__empty) { display: none; }
.ui-kpi__empty {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: 100%;
  margin: 0;
  padding: 0 10px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--ui-kpi-card);
  transform: translate(-50%, -50%);
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  color: var(--ui-kpi-muted);
}

/* Tooltip: sits beside the guide, flips to the left on the right half */
.ui-kpi__tooltip {
  position: absolute;
  top: -12px;
  z-index: 2;
  min-width: 176px;
  max-width: calc(100cqw - 16px);
  padding: 10px 12px 12px;
  background: var(--aui-overlay, var(--ui-kpi-card));
  border: 1px solid var(--ui-kpi-line);
  border-radius: calc(var(--aui-radius-lg, 16px) - 4px);
  box-shadow: var(--ui-kpi-tip-shadow);
  pointer-events: none;
  opacity: 0;
  transform: translateX(calc(var(--ui-kpi-shift) + var(--ui-kpi-nudge, 0px))) scale(0.97);
  transition:
    left 220ms var(--ui-kpi-ease),
    opacity 160ms ease,
    transform 220ms var(--ui-kpi-ease);
}
.ui-kpi__tooltip[data-side="right"] { --ui-kpi-shift: 14px; transform-origin: left top; }
.ui-kpi__tooltip[data-side="left"] { --ui-kpi-shift: calc(-100% - 14px); transform-origin: right top; }
.ui-kpi__tooltip[data-open] {
  opacity: 1;
  transform: translateX(calc(var(--ui-kpi-shift) + var(--ui-kpi-nudge, 0px)));
}
.ui-kpi__date {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--ui-kpi-muted);
}
.ui-kpi__tooltip ul {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-kpi__tooltip li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 20px;
}
.ui-kpi__swatch {
  flex: none;
  width: 10px;
  height: 2px;
  border-radius: 1px;
}
.ui-kpi__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-kpi-label);
}
.ui-kpi__num {
  flex: none;
  padding-left: 16px;
  font-weight: 500;
}

.ui-kpi__xaxis {
  position: relative;
  grid-column: 2;
  font-size: 12px;
  line-height: 20px;
  color: var(--ui-kpi-muted);
}
.ui-kpi__xaxis span {
  position: absolute;
  top: 0;
  max-width: 34%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(-50%);
}
.ui-kpi__xaxis span[data-edge="start"] { transform: none; }
.ui-kpi__xaxis span[data-edge="end"] { transform: translateX(-100%); }

.ui-kpi__footer {
  overflow-wrap: anywhere;
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--ui-kpi-muted);
}

@keyframes ui-kpi-draw {
  from { clip-path: inset(-10% 100% -10% 0); }
  to { clip-path: inset(-10% -2% -10% 0); }
}
@keyframes ui-kpi-pop {
  from { opacity: 0; transform: scale(0.4); }
}

@media (prefers-reduced-motion: reduce) {
  .ui-kpi__lines, .ui-kpi__point { animation: none; }
  .ui-kpi__marker, .ui-kpi__guide, .ui-kpi__dot, .ui-kpi__tooltip { transition: none; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-kpi {
  --ui-kpi-card: var(--aui-surface, #232326);
  --ui-kpi-line: var(--aui-border, rgba(255, 255, 255, 0.08));
  --ui-kpi-grid: rgba(255, 255, 255, 0.06);
  --ui-kpi-ink: var(--aui-ink, #ededed);
  --ui-kpi-muted: var(--aui-muted, #8f8f8f);
  --ui-kpi-up: var(--aui-green, #5fc88a);
  --ui-kpi-down: var(--aui-red, #ff6b5f);
  --ui-kpi-guide: rgba(255, 255, 255, 0.2);
  --ui-kpi-label: var(--aui-muted, #c4c4c4);
  --ui-kpi-focus: var(--aui-focus, rgba(77, 141, 255, 0.8));
  --ui-kpi-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35);
  --ui-kpi-tip-shadow: var(--aui-shadow-popover, 0 8px 24px -6px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(255, 255, 255, 0.04));
}
:where(.dark, [data-theme="dark"]) .ui-kpi__tooltip {
  background: var(--aui-overlay, #2a2a2d);
  border-color: var(--aui-border, rgba(255, 255, 255, 0.1));
}
`;
