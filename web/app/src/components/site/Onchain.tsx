import { useState } from "react";
import { KpiChart } from "@/components/ui/kpi-chart";
import { CompactBreakdown, type BreakdownItem } from "@/components/ui/compact-breakdown";
import { DataTable, DateColumnIcon, NumberColumnIcon, TextColumnIcon } from "@/components/ui/data-table";
import { mmdd, moved, num, usd } from "@/lib/format";
import type { Report } from "@/lib/types";
import { Callout, Card, Note, Section, Tag } from "./parts";

type Tehc = NonNullable<Report["tehc"]>;

/** 份额卡最多 7 段：前 6 名 + 「其他 N 项」合并，避免颜色和图例过多 */
function topN(rows: { name: string; value: number }[], n = 6): BreakdownItem[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= n + 1) return sorted.map((r) => ({ label: r.name, value: r.value }));
  const rest = sorted.slice(n);
  return [
    ...sorted.slice(0, n).map((r) => ({ label: r.name, value: r.value })),
    { id: "__other", label: `其他 ${rest.length} 项`, value: rest.reduce((s, r) => s + r.value, 0), color: "var(--ui-cb-other, #a3a3a3)" },
  ];
}

export function Onchain({ tehc }: { tehc: Tehc }) {
  return (
    <div className="stack">
      <Section id="onchain" kicker={tehc.source ?? "TehcScreener"} title="链上活动 · TehcScreener" caption={tehc.caption}>
        {tehc.trench && <Trench tr={tehc.trench} />}
      </Section>
      {tehc.launchpads && <Launchpads lp={tehc.launchpads} />}
      {tehc.bots && <Bots bots={tehc.bots} />}
      {tehc.chains && <Chains ch={tehc.chains} />}
    </div>
  );
}

function Trench({ tr }: { tr: NonNullable<Tehc["trench"]> }) {
  const hist = tr.history ?? [];
  const label = tr.label_zh ? `${tr.label_zh} · ${tr.label}` : tr.label;
  const prev = hist.length >= 2 ? hist.at(-2)! : null;
  return (
    <div className="pair">
      {hist.length > 0 ? (
        <KpiChart
          title={`Trench 分数 · ${tr.date}`}
          value={`${tr.score}  ${label}`}
          labels={hist.map((h) => mmdd(h.date))}
          tooltipLabels={hist.map((h) => h.date)}
          series={[{ label: "Trench", color: "#14b8a6", values: hist.map((h) => h.score) }]}
          format={(n) => `${Math.round(n)}`}
          footer={prev ? `近 ${hist.length} 个已评分日 · 较 ${mmdd(prev.date)} 的 ${prev.score} ${moved(tr.score - prev.score, "分")}` : `近 ${hist.length} 个已评分日`}
        />
      ) : (
        <Card title={`Trench · ${tr.date}`}>
          <p className="big-num">
            {tr.score} <Tag tone="info">{label}</Tag>
          </p>
        </Card>
      )}
      <Card title={`分项 · ${mmdd(tr.date)}`} meta="分位 0–100">
        <ul className="pctl">
          {tr.components?.map((c) => (
            <li key={c.name}>
              <span className="pctl__name">{c.name}</span>
              <span className="pctl__val">{c.usd !== undefined ? usd(c.usd) : num(c.count ?? 0)}</span>
              <span className="pctl__bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, c.percentile)}%` }} />
              </span>
              <span className="pctl__p">第 {c.percentile} 分位</span>
            </li>
          ))}
        </ul>
        {tr.note && <Note text={tr.note} />}
        {tr.components_note && <Note text={tr.components_note} />}
      </Card>
    </div>
  );
}

function Launchpads({ lp }: { lp: NonNullable<Tehc["launchpads"]> }) {
  const [measure, setMeasure] = useState("volume");
  const byVolume = measure === "volume";
  const items = topN(lp.rows.map((r) => ({ name: r.name, value: byVolume ? r.volume_usd : r.launches })));
  return (
    <Section id="launchpads" kicker="TehcScreener /launchpads" title="发射台" caption={lp.caption}>
      <div className="pair pair--narrow">
        <CompactBreakdown
          title="发射台份额"
          periods={[
            { id: "volume", label: "成交额" },
            { id: "launches", label: "新发射" },
          ]}
          period={measure}
          onPeriodChange={setMeasure}
          items={items}
          format={byVolume ? usd : num}
          totalLabel={byVolume ? `成交额合计 · ${lp.rows.length} 个发射台` : `新发射合计 · ${lp.rows.length} 个发射台`}
          footer={lp.total ? `接口汇总：成交额 ${usd(lp.total.volume_usd)} · 新发射 ${num(lp.total.launches)}` : undefined}
        />
        <DataTable
          title="发射台明细"
          editable={false}
          columns={[
            { key: "name", label: "发射台", type: "title", icon: <TextColumnIcon />, width: "240px" },
            { key: "volume", label: "成交额", type: "number", icon: <NumberColumnIcon />, format: usd },
            { key: "launches", label: "新发射", type: "number", icon: <NumberColumnIcon /> },
          ]}
          rows={lp.rows.map((r) => ({ id: r.name, name: r.name, volume: r.volume_usd, launches: r.launches }))}
        />
      </div>
    </Section>
  );
}

function Bots({ bots }: { bots: NonNullable<Tehc["bots"]> }) {
  const [measure, setMeasure] = useState("volume");
  const byVolume = measure === "volume";
  const items = topN(bots.rows.map((r) => ({ name: r.name, value: byVolume ? r.volume_usd : r.fees_usd })));
  return (
    <Section id="bots" kicker="TehcScreener /bots" title="交易机器人" caption={bots.caption}>
      <div className="pair pair--narrow">
        <CompactBreakdown
          title="机器人份额"
          periods={[
            { id: "volume", label: "成交额" },
            { id: "fees", label: "手续费" },
          ]}
          period={measure}
          onPeriodChange={setMeasure}
          items={items}
          format={usd}
          totalLabel={byVolume ? `成交额合计 · ${bots.rows.length} 个机器人` : `手续费合计 · ${bots.rows.length} 个机器人`}
          footer={bots.total ? `接口汇总：成交额 ${usd(bots.total.volume_usd)} · 手续费 ${usd(bots.total.fees_usd)}` : undefined}
        />
        <DataTable
          title="机器人明细"
          editable={false}
          columns={[
            { key: "name", label: "机器人", type: "title", icon: <TextColumnIcon />, width: "200px" },
            { key: "volume", label: "成交额", type: "number", icon: <NumberColumnIcon />, format: usd },
            { key: "fees", label: "手续费", type: "number", icon: <NumberColumnIcon />, format: usd },
          ]}
          rows={bots.rows.map((r) => ({ id: r.name, name: r.name, volume: r.volume_usd, fees: r.fees_usd }))}
        />
      </div>
      {bots.warning && <Callout tone="warning" title="手续费 ≠ dailyRevenue" text={bots.warning} />}
    </Section>
  );
}

function Chains({ ch }: { ch: NonNullable<Tehc["chains"]> }) {
  // 多数链共用的数据日；与之不同的链单独标注
  const counts = new Map<string, number>();
  for (const r of ch.rows) if (r.date) counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (
    <Section id="chains" kicker="TehcScreener /chains" title="公链" caption={ch.caption}>
      <DataTable
        title="公链 DEX 成交与钱包"
        editable={false}
        tagTones={Object.fromEntries(ch.rows.filter((r) => r.date).map((r) => [`截至 ${mmdd(r.date!)}`, r.date === main ? "gray" : "amber"]))}
        columns={[
          { key: "name", label: "链", type: "title", icon: <TextColumnIcon />, width: "180px" },
          { key: "volume", label: "DEX 成交额", type: "number", icon: <NumberColumnIcon />, format: usd },
          { key: "wallets", label: "钱包", type: "number", icon: <NumberColumnIcon /> },
          { key: "date", label: "数据日", type: "tag", icon: <DateColumnIcon />, width: "140px" },
        ]}
        rows={ch.rows.map((r) => ({ id: r.name, name: r.name, volume: r.dex_volume_usd, wallets: r.wallets, date: r.date ? `截至 ${mmdd(r.date)}` : "" }))}
      />
    </Section>
  );
}
