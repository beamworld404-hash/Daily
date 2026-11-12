// 关注清单日报 · 模板
// 用法：复制本文件 → 只替换 「«…»」 占位和数据常量 → 按 GUIDE.md 的出报检查清单自查。
// 页面骨架（顺序固定）：
//   ① 看板 Metrics（4 个固定 KPI）
//   ② 修订/异常 Callout（仅在有修订、缺项、口径变化时出现，否则整块删掉）
//   ③ 今日要点 Rows（3–5 条）
//   ④ 数据截至 Table（每个数据源一行）
//   ⑤ 目录 + 模块区（收入 → Trench 与链上活动 → Defined 新池 → 社区与代码 → X 关注摘要）
//   ⑥ 取数与来源
// 完整填写示例见 examples/2026-11-12.tsx。

import {
  Page,
  Section,
  Text,
  Callout,
  Table,
  Rows,
  Metrics,
  ColumnSeries,
  Columns,
  LinkCards,
  Properties,
  Checklist,
  TableOfContents,
} from "cursor/pages";

// ───────────────────────── 格式工具（全报统一，勿改） ─────────────────────────

function formatUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  const two = (x: number) =>
    (Math.round((x + Number.EPSILON) * 100) / 100).toFixed(2);
  if (n < 1000) return `${sign}$${n.toFixed(2)}`;
  if (n < 1_000_000) return `${sign}$${two(n / 1_000)}K`;
  if (n < 1_000_000_000) return `${sign}$${two(n / 1_000_000)}M`;
  return `${sign}$${two(n / 1_000_000_000)}B`;
}

/** 百分比变化，返回 Table 单元格：↑ 绿 / ↓ 橙；|Δ| ≥ 20% 时 ↓ 用红。 */
function pctCell(latest: number, prev: number) {
  const pct = ((latest - prev) / prev) * 100;
  const text = `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(2)}%`;
  const tone = pct >= 0 ? "success" : pct <= -20 ? "danger" : "warning";
  return { text, tone } as const;
}

function athShare(latest: number, ath: number): string {
  return `${((latest / ath) * 100).toFixed(2)}%`;
}

const definedHref = (address: string) => `https://www.defined.fi/token/sol/${address}`;

// ───────────────────────── 数据：只填接口原值，不手算、不估算 ─────────────────────────

const REPORT_DATE = "«YYYY-MM-DD»";

const FNG = { latest: 0, prev: 0, label: "«恐惧/贪婪/中性…»", date: "UTC «MM-DD»" };
const FOMO = { latest: 0, prev: 0, ath: 1844534, athDate: "2026-09-04" };
const GMGN = { latest: 0, prev: 0, ath: 5737132, athDate: "2025-10-08" };
const TRENCH = { latest: 0, prev: 0, label: "«cold/warm/hot»", date: "«MM-DD»" };

const recentDays: string[] = [/* 近 14 个 UTC 完整日，«MM-DD» */];
const gmgnRecent: number[] = [/* 与 recentDays 一一对应 */];
const fomoRecent: number[] = [/* 与 recentDays 一一对应；被修订的日用修订后数值 */];
const trenchRecent: { label: string; value: number; display: string }[] = [
  /* 近 5 个已评分日 { label: "«MM-DD»", value: 0, display: "0" } */
];

// ───────────────────────── 页面 ─────────────────────────

export default function DailyWatchlistReport() {
  return (
    <Page
      title={`关注清单日报 · ${REPORT_DATE}`}
      lang="zh-Hans"
      width="column"
      // summary：≤ 120 字，3 句以内。句 1 收入；句 2 情绪 + Trench；句 3 其他有变化的模块 + 覆盖缺口。
      summary="«FOMO 收入 $…、GMGN $…（UTC MM-DD）。恐惧贪婪 …，Trench …。……»"
    >
      {/* ① 看板：顺序固定 恐惧贪婪 → FOMO → GMGN → Trench；不加 tone */}
      <Metrics
        metrics={[
          { value: `${FNG.latest}`, label: `恐惧贪婪 · ${FNG.label}`, detail: `${FNG.date} · 较上一日 ${FNG.prev} «升/降» N 点` },
          { value: formatUsd(FOMO.latest), label: "FOMO 日收入", detail: `UTC «MM-DD» · «↑/↓ x.xx%»` },
          { value: formatUsd(GMGN.latest), label: "GMGN 日收入", detail: `UTC «MM-DD» · «↑/↓ x.xx%»` },
          { value: `${TRENCH.latest}`, label: `Trench · ${TRENCH.label}`, detail: `${TRENCH.date} · 较 «MM-DD» 的 ${TRENCH.prev} «升/降» N 分` },
        ]}
      />

      {/* ② 修订 / 异常：没有就删掉整个 Callout，不要写「今日无异常」 */}
      <Callout lead="«数据修订 / 数据缺项 / 口径变化»" tone="warning">
        «一到两句：哪个数、从多少改成多少、对今天的读数有什么影响。»
      </Callout>

      {/* ③ 今日要点：3–5 条。title ≤ 20 字，是结论；detail 一句话给数；meta = 来源 · 数据日 */}
      <Section id="highlights" heading="今日要点">
        <Rows
          rows={[
            { title: "«结论式标题»", detail: "«一句话，带数字»", meta: "«来源 · 数据日»" },
          ]}
        />
      </Section>

      {/* ④ 数据截至：每个数据源一行。状态只用：新抓 / 复用 HH:MM 缓存 / 部分覆盖 / 未抓 / 无更新，可加「· 有修订」 */}
      <Section id="freshness" heading="数据截至">
        <Table
          columns={["数据源", "数据日 / 窗口", "状态"]}
          align={["start", "start", "end"]}
          rows={[
            ["恐惧贪婪（Alternative.me）", "UTC «YYYY-MM-DD»", { text: "新抓", tone: "success" }],
            ["收入（DefiLlama）", "UTC «YYYY-MM-DD»", { text: "新抓", tone: "success" }],
            ["TehcScreener", "«YYYY-MM-DD»", { text: "新抓", tone: "success" }],
            ["Defined / Codex", "«MM-DD HH:MM:SS» 快照，回滚 24h", { text: "新抓", tone: "success" }],
            ["r/Monad", "自 «上次正式早报时间» 起", { text: "新抓", tone: "success" }],
            ["rarefriends", "自 «上次正式早报时间» 起", { text: "新抓 · 无更新", tone: "success" }],
            ["X 关注时间线", "«HH:MM:SS–HH:MM:SS»", { text: "部分覆盖 · 约 N 分钟", tone: "warning" }],
          ]}
        />
      </Section>

      <TableOfContents
        title="目录"
        items={[
          { label: "收入", id: "revenue" },
          { label: "Trench 与链上活动", id: "onchain" },
          { label: "Defined 新池", id: "defined" },
          { label: "社区与代码", id: "community" },
          { label: "X 关注摘要", id: "x-digest" },
          { label: "取数与来源", id: "methods" },
        ]}
      />

      {/* ⑤ 模块区。caption 只写一句口径，不写取数过程 */}

      <Section id="revenue" heading="收入 · GMGN / FOMO" caption="DefiLlama dailyRevenue，UTC 完整日，不是实时行情。">
        <Table
          columns={["项目", "UTC «MM-DD»", "较 «MM-DD»", "占 ATH", "ATH"]}
          align={["start", "end", "end", "end", "end"]}
          emphasis={0}
          rows={[
            ["FOMO", formatUsd(FOMO.latest), pctCell(FOMO.latest, FOMO.prev), athShare(FOMO.latest, FOMO.ath), `${formatUsd(FOMO.ath)}（${FOMO.athDate}）`],
            ["GMGN", formatUsd(GMGN.latest), pctCell(GMGN.latest, GMGN.prev), athShare(GMGN.latest, GMGN.ath), `${formatUsd(GMGN.ath)}（${GMGN.athDate}）`],
          ]}
        />
        <ColumnSeries
          labels={recentDays}
          series={[
            { name: "GMGN", values: gmgnRecent },
            { name: "FOMO", values: fomoRecent },
          ]}
          ceiling={500000}
          format={formatUsd}
        />
        <Text>近 14 个完整日（UTC «MM-DD» 至 «MM-DD»）。«如有修订柱，在此注明»</Text>
      </Section>

      <Section id="onchain" heading="Trench 与链上活动" caption="TehcScreener，数据日 «YYYY-MM-DD»；synced_at «…»（北京时间）。底层 Allium。">
        <Columns points={trenchRecent} emphasis={trenchRecent.length - 1} />
        <Table
          columns={["Trench 分项 · «MM-DD»", "数值", "分位"]}
          align={["start", "end", "end"]}
          rows={[
            ["发射台成交额", formatUsd(0), "«分位»"],
            ["新发射", "«N»", "«分位»"],
            ["机器人成交额", formatUsd(0), "«分位»"],
            ["机器人手续费", formatUsd(0), "«分位»"],
          ]}
        />

        <Text>发射台 · 合计成交额 {formatUsd(0)}，新发射 «N»</Text>
        <Table
          columns={["发射台", "成交额", "新发射"]}
          align={["start", "end", "end"]}
          rows={[
            /* 按成交额降序：["«chain / venue»", formatUsd(0), "«N»"] */
          ]}
        />

        <Text>机器人 · 合计成交额 {formatUsd(0)}，手续费 {formatUsd(0)}</Text>
        <Table
          columns={["机器人", "成交额", "手续费"]}
          align={["start", "end", "end"]}
          rows={[
            /* 按成交额降序：["«name»", formatUsd(0), formatUsd(0)] */
          ]}
        />
        <Text>
          口径：这里的「手续费」不等于上方 DefiLlama 的 dailyRevenue，GMGN、fomo 两行不可与收入表直接对照。Trench 分项与发射台、机器人合计来自不同接口，不必相等。
        </Text>

        <Text>公链 · DEX 成交额</Text>
        <Table
          columns={["链", "DEX 成交额", "钱包"]}
          align={["start", "end", "end"]}
          rows={[
            /* 数据日与主数据日不同的链，在链名后加「（至 MM-DD）」 */
          ]}
        />
      </Section>

      <Section
        id="defined"
        heading="Defined 新池 · 4 小时热度前 5"
        caption="≤24h 新池观察榜，不一定是新发行代币；按 Codex trendingScore4 排序，不等同 DexScreener Trending。非交易建议。"
      >
        <Table
          columns={["#", "代币", "流动性", "24h 交易量", "较上一榜", "叙事"]}
          align={["end", "start", "end", "end", "start", "start"]}
          emphasis={1}
          rows={[
            // 较上一榜：新上 / 不变 / «旧名次» → «新名次»；首次出榜写「基线」
            // 叙事：只写能核对合约的官方资料，≤ 12 字；没有就写「—」
            ["1", <a href={definedHref("«address»")}>«symbol»</a>, formatUsd(0), formatUsd(0), "«新上»", "—"],
          ]}
        />
        <Text>掉出：«symbol、symbol»。</Text>
        <Text>«有叙事的代币逐个一句话说明并附官方链接；其余写「未找到可核对合约的公开项目资料」。»</Text>
      </Section>

      <Section id="community" heading="社区与代码">
        <Text>r/Monad · 自 «上次正式早报时间» 以来 «N» 篇新帖</Text>
        <Rows
          rows={[
            // 同一作者同一主题的多帖合并成一条，标题后注「（N 篇）」
            { title: "«中文结论式标题»", detail: "«一到两句中文摘要»", meta: "/u/«author»" },
          ]}
        />
        <Text>
          原帖：<a href="«url»">«短名»</a>。«摘要依据说明；评论是否抓取»
        </Text>

        <Text>
          <a href="https://github.com/rarefriends">rarefriends</a> · «公开仓库与 PR 无新更新。/ 列出新推送、新 PR»
        </Text>
      </Section>

      <Section
        id="x-digest"
        heading="X 关注摘要"
        caption="抽样 «YYYY-MM-DD HH:MM:SS–HH:MM:SS»（北京时间），N 页 N 条，约 N 分钟，非全量。«未覆盖时段»未覆盖。"
      >
        <Callout lead="主线" tone="info">
          «≤ 3 句：按 行业 / AI / 安全 等主题各一句。未核实的传闻必须标「本报未核实」。»
        </Callout>
        <Text>标签：转述＝转引他人或媒体；截断＝接口返回不全，只依据已返回文字；未核实＝本报未核对原始来源。</Text>

        {/* 按主题分组，组顺序：行业与监管 → 市场与链上 → AI 与产品 → 安全 → 工具；空组整组删掉 */}
        <Text>行业与监管</Text>
        <Rows
          rows={[
            { title: "«事件式标题»", detail: "«≤ 2 句，保留原文数字»", meta: "@«handle» · «转述 · 截断 · 未核实»" },
          ]}
        />
        <Text>
          原帖：<a href="«url»">«短名»</a>
        </Text>
      </Section>

      {/* ⑥ 取数与来源：审计用 */}
      <Section id="methods" heading="取数与来源" caption="覆盖窗口：上次正式早报 «YYYY-MM-DD HH:MM:SS» 至今，含上一自然日 «MM-DD»（北京时间）。">
        <Checklist
          items={[
            { text: "恐惧贪婪指数", done: true, meta: "«N 次 · 200»" },
            { text: "GMGN / FOMO dailyRevenue", done: true, meta: "«N 次 · 200»" },
            { text: "TehcScreener", done: true, meta: "«status 已变，全部重抓 / 未变，复用»" },
            { text: "Defined / Codex 新池", done: true, meta: "«filterPairs N 次 · x.xxx CU»" },
            { text: "r/Monad 新帖 RSS", done: true, meta: "«N 次 · 200»" },
            { text: "r/Monad 评论 RSS", done: false, meta: "«未请求 / 429 / 成功»" },
            { text: "rarefriends 仓库与 PR", done: true, meta: "«N 次 · 均 200»" },
            { text: "关注账号 X 摘要", done: true, meta: "«部分覆盖：N 页 N 条，约 N 分钟»" },
          ]}
        />
        <Properties
          items={[
            { label: "取数时间", value: "«YYYY-MM-DD HH:MM:SS–HH:MM:SS»（北京时间）" },
            { label: "请求", value: "«公开 HTTP N 次均 200；Defined N 次；X 连接器 N 页»" },
            { label: "Codex 额度", value: "«remaining N / limit»" },
            { label: "缓存目录", value: "«run-… · defined-codex/…»" },
          ]}
        />
        <Rows
          rows={[
            { title: "DefiLlama", detail: "summary/fees/{gmgn,fomo}，dataType=dailyRevenue。UTC 完整日，不是实时行情。" },
            { title: "TehcScreener", detail: "仅官方 /api/v1：status、trench、launchpads、bots、chains；RWA 照常缓存，页面不展示。" },
            { title: "Defined / Codex", detail: "GraphQL filterPairs，全部受支持主网回滚 24h；流动性、24h 成交额 ≥ $1.00K，交易 ≥ 10 笔；按 trendingScore4 取 40 条，去掉双边主流资产池（本次 N 个），按合约+链去重取前 5。" },
            { title: "Reddit", detail: "官方新帖 Atom RSS，按条目更新时间筛选。无新帖不等于无讨论。" },
            { title: "GitHub", detail: "未登录公开 REST：组织仓库 + 各库 PR，仅公开仓库。" },
            { title: "X", detail: "官方 X API，beam 的 user-X 连接器读个人关注时间线；去重基准为上次正式早报的帖子 ID。未读 DM。" },
          ]}
        />
        <LinkCards
          links={[
            { title: "GMGN", site: "DefiLlama", href: "https://defillama.com/protocol/gmgn" },
            { title: "FOMO", site: "DefiLlama", href: "https://defillama.com/protocol/fomo" },
            { title: "TehcScreener", site: "tehcscreener.com", href: "https://tehcscreener.com/" },
            { title: "Fear & Greed Index", site: "Alternative.me", href: "https://alternative.me/crypto/fear-and-greed-index/" },
            { title: "Defined Tokens", site: "defined.fi", href: "https://www.defined.fi/tokens" },
            { title: "r/Monad", site: "Reddit", href: "https://www.reddit.com/r/Monad/" },
            { title: "rarefriends", site: "GitHub", href: "https://github.com/rarefriends" },
          ]}
        />
      </Section>
    </Page>
  );
}
