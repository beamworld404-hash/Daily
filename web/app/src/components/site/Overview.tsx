import { ChangeSummary, type MetricChange } from "@/components/ui/change-summary";
import { KpiChart } from "@/components/ui/kpi-chart";
import { DataTable, DateColumnIcon, NumberColumnIcon } from "@/components/ui/data-table";
import { arrow, changePct, mmdd, moved, pct, usd } from "@/lib/format";
import { Ext, Rich } from "@/lib/rich";
import type { Report } from "@/lib/types";
import { Callout, Card, Note, Section } from "./parts";

/** 协议颜色按出现顺序固定（第 1、2 个协议），与 affectUI 示例配色一致 */
export const SERIES_COLORS = ["#2f6bff", "#ec4899", "#14b8a6", "#f59e0b"];

/**
 * 「较上一期」：由模块数据计算，不另存。
 * 只有收入用升绿降红；恐惧贪婪和 Trench 的点数升降不代表好坏，保持中性。
 */
export function changesOf(r: Report): MetricChange[] {
  const out: MetricChange[] = [];
  if (r.fng) {
    const { latest: lt, previous: pv } = r.fng;
    const tail = pv ? `，较上一日 ${pv.value} ${moved(lt.value - pv.value, "点")}` : "";
    out.push({
      label: "恐惧贪婪指数",
      change: `${lt.value}（${lt.class_zh}）${tail}`,
      tone: "neutral",
    });
  }
  if (r.revenue) {
    const last = mmdd(r.revenue.dates.at(-1)!);
    for (const p of r.revenue.protocols) {
      const [prev, cur] = p.values.slice(-2);
      const c = prev ? changePct(cur, prev) : 0;
      out.push({
        label: `${p.name} 收入`,
        change: `${usd(cur)}（UTC ${last}），较前一日 ${usd(prev)} ${arrow(c)} ${pct(Math.abs(c))}`,
        tone: c > 0 ? "good" : c < 0 ? "bad" : "neutral",
      });
    }
  }
  const tr = r.tehc?.trench;
  if (tr) {
    const h = tr.history ?? [];
    const tail = h.length >= 2 ? `，较 ${mmdd(h.at(-2)!.date)} 的 ${h.at(-2)!.score} ${moved(h.at(-1)!.score - h.at(-2)!.score, "分")}` : "";
    out.push({ label: "Trench", change: `${tr.score}（${tr.label_zh ?? tr.label}，${mmdd(tr.date)}）${tail}`, tone: "neutral" });
  }
  return out;
}

export function Overview({ report: r }: { report: Report }) {
  const changes = changesOf(r);
  return (
    <div className="stack">
      {r.notices?.map((n, i) => <Callout key={i} {...n} />)}

      <div className="split">
        {changes.length > 0 && <ChangeSummary className="split__changes" title="较上一期" period={`出报 ${r.issued_at.slice(5)}`} changes={changes} />}
        <Card title="今日要点" meta={`${r.highlights.length} 条`} className="split__main">
          <ol className="highlights">
            {r.highlights.map((h, i) => (
              <li key={i}>
                <Rich text={h} />
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {r.revenue && <Revenue rev={r.revenue} />}
      {r.fng && <Fng fng={r.fng} />}
    </div>
  );
}

function Revenue({ rev }: { rev: NonNullable<Report["revenue"]> }) {
  const labels = rev.dates.map(mmdd);
  const tooltipLabels = rev.dates.map((d) => `UTC ${d}`);
  const last = rev.dates.length - 1;
  const rows = rev.dates
    .map((d, i) => ({ id: d, date: `UTC ${d}`, ...Object.fromEntries(rev.protocols.map((p, j) => [`p${j}`, p.values[i]])) }))
    .reverse();
  return (
    <Section
      id="revenue"
      kicker={rev.source}
      title="GMGN 与 FOMO 收入"
      caption={rev.caption}
      aside={
        <span className="sec__aside">
          近 {rev.dates.length} 个完整日 · UTC {mmdd(rev.dates[0])} 至 {mmdd(rev.dates[last])}
        </span>
      }
    >
      <div className="kpi-grid">
        {rev.protocols.map((p, i) => {
          const [prev, cur] = p.values.slice(-2);
          const share = p.ath ? `占历史最高 ${pct((cur / p.ath.usd) * 100)} · ATH ${usd(p.ath.usd)}（${p.ath.date}）` : undefined;
          return (
            <KpiChart
              key={p.name}
              title={`${p.name} 收入 · UTC ${labels[last]}`}
              value={usd(cur)}
              delta={cur - prev}
              format={usd}
              labels={labels}
              tooltipLabels={tooltipLabels}
              series={[{ label: p.name, color: SERIES_COLORS[i % SERIES_COLORS.length], values: p.values }]}
              footer={share}
            />
          );
        })}
      </div>
      <p className="links-inline">
        {rev.protocols
          .filter((p) => p.url)
          .map((p) => (
            <Ext key={p.name} href={p.url!}>
              {p.name} · DefiLlama ↗
            </Ext>
          ))}
      </p>
      {rev.notes?.map((n, i) => <Note key={i} text={n} />)}
      <details className="disclosure">
        <summary>查看逐日数据表</summary>
        <DataTable
          title="逐日收入（美元）"
          editable={false}
          columns={[
            { key: "date", label: "日期", type: "title", icon: <DateColumnIcon />, width: "180px" },
            ...rev.protocols.map((p, j) => ({ key: `p${j}`, label: p.name, type: "number" as const, icon: <NumberColumnIcon />, format: usd })),
          ]}
          rows={rows}
        />
      </details>
    </Section>
  );
}

function Fng({ fng }: { fng: NonNullable<Report["fng"]> }) {
  const { latest: lt, previous: pv } = fng;
  return (
    <Section id="market" kicker={fng.source} title="市场情绪 · 恐惧贪婪指数" caption={`数据日 UTC ${lt.date}。`}>
      <Card>
        <div className="fng">
          <div className="fng__big">
            <span className="fng__num">{lt.value}</span>
            <span className="fng__cls">
              {lt.class_zh}
              {lt.class_en && <small>{lt.class_en}</small>}
            </span>
          </div>
          <div className="fng__scale" role="img" aria-label={`0 到 100 的刻度上，最新 ${lt.value}${pv ? `，上一日 ${pv.value}` : ""}`}>
            <div className="fng__bar" />
            {pv && <span className="fng__mark fng__mark--prev" style={{ left: `${pv.value}%` }} title={`上一日 ${pv.value}`} />}
            <span className="fng__mark" style={{ left: `${lt.value}%` }} />
            <div className="fng__ticks" aria-hidden="true">
              <span>0 极度恐惧</span>
              <span>50 中性</span>
              <span>100 极度贪婪</span>
            </div>
          </div>
          {pv && (
            <dl className="fng__rows">
              <div>
                <dt>最新 · UTC {lt.date}</dt>
                <dd>
                  {lt.value} · {lt.class_zh}
                </dd>
              </div>
              <div>
                <dt>上一日 · UTC {pv.date}</dt>
                <dd>
                  {pv.value} · {pv.class_zh}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </Card>
    </Section>
  );
}
