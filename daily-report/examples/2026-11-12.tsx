// 关注清单日报 · 2026-11-12 —— 新版排版示例
// 数据全部来自 2026-11-12 正式早报原稿，只重排、不新增事实。
// 规范见 ../GUIDE.md；空白骨架见 ../template.tsx。

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

// ───────────────────────── 数据（原稿取值） ─────────────────────────

const FNG = { latest: 28, prev: 29, label: "恐惧", date: "UTC 11-12" };

const FOMO = { latest: 300012, prev: 288990.01, revisedFrom: 85167.01, ath: 1844534, athDate: "2026-09-04" };
const GMGN = { latest: 172487, prev: 179035, ath: 5737132, athDate: "2025-10-08" };

const TRENCH = { latest: 37, prev: 36, label: "cold", date: "11-10" };

const recentDays = [
  "10-28", "10-29", "10-30", "10-31", "11-01", "11-02", "11-03",
  "11-04", "11-05", "11-06", "11-07", "11-08", "11-09", "11-10",
];
const gmgnRecent = [
  237695, 187262, 199668, 138176, 127341, 93445, 158385, 150084, 173678,
  162335, 127465, 145697, 179035, 172487,
];
const fomoRecent = [
  305435.01, 482949.03, 374169, 208556, 189674, 267409, 292890, 369525,
  308572, 270335, 215908.02, 244925, 288990.01, 300012,
];
const trenchRecent = [
  { label: "11-06", value: 30, display: "30" },
  { label: "11-07", value: 28, display: "28" },
  { label: "11-08", value: 26, display: "26" },
  { label: "11-09", value: 36, display: "36" },
  { label: "11-10", value: 37, display: "37" },
];

const definedHref = (address: string) => `https://www.defined.fi/token/sol/${address}`;

// ───────────────────────── 页面 ─────────────────────────

export default function DailyWatchlistReport() {
  return (
    <Page
      title="关注清单日报 · 2026-11-12"
      lang="zh-Hans"
      width="column"
      summary="FOMO 收入 $300.01K、GMGN $172.49K（UTC 11-10）；FOMO 的 11-09 数字被数据源修订。恐惧贪婪 28，Trench 37（cold）。Defined 新池榜 5 席换了 4 席；r/Monad 3 篇新帖；rarefriends 无更新。X 摘要仅约 75 分钟抽样。"
    >
      {/* ① 看板：四个固定 KPI，顺序永远不变 */}
      <Metrics
        metrics={[
          {
            value: `${FNG.latest}`,
            label: `恐惧贪婪 · ${FNG.label}`,
            detail: `${FNG.date} · 较上一日 ${FNG.prev} 降 1 点`,
          },
          {
            value: formatUsd(FOMO.latest),
            label: "FOMO 日收入",
            detail: "UTC 11-10 · ↑ 3.81%",
          },
          {
            value: formatUsd(GMGN.latest),
            label: "GMGN 日收入",
            detail: "UTC 11-10 · ↓ 3.66%",
          },
          {
            value: `${TRENCH.latest}`,
            label: `Trench · ${TRENCH.label}`,
            detail: `${TRENCH.date} · 较 11-09 的 ${TRENCH.prev} 升 1 分`,
          },
        ]}
      />

      {/* ② 修订 / 异常：只在有修订、缺项、口径变化时出现 */}
      <Callout lead="数据修订" tone="warning">
        DefiLlama 把 FOMO 的 UTC 11-09 收入从昨早报道的 {formatUsd(FOMO.revisedFrom)} 修订为{" "}
        {formatUsd(FOMO.prev)}。11-10 的 ↑ 3.81% 是相对修订后数字，不是相对旧数字的大幅跳升。
      </Callout>

      {/* ③ 今日要点：3–5 条，每条一句话 + 来源 */}
      <Section id="highlights" heading="今日要点">
        <Rows
          rows={[
            {
              title: "收入一涨一跌，都远离历史高点",
              detail: `FOMO ${formatUsd(FOMO.latest)}，为 ATH 的 ${athShare(FOMO.latest, FOMO.ath)}；GMGN ${formatUsd(GMGN.latest)}，为 ATH 的 ${athShare(GMGN.latest, GMGN.ath)}。UTC 11-11 尚未公布。`,
              meta: "DefiLlama · UTC 11-10",
            },
            {
              title: "Defined 新池榜 5 席换 4 席",
              detail: "新上 Max、vibeshift、CHICK、HUNG；mihao 由第 1 降至第 3；HOLD、ORVIX、VEYL、PayCat 掉出。",
              meta: "Codex 4h 热度 · 08:34 快照",
            },
            {
              title: "r/Monad：GroupPot 演示、Fling 团队表态",
              detail: "3 篇新帖，其中 2 篇介绍 GroupPot 集体储蓄工具，1 篇转述 Fling 团队称项目不会停。",
              meta: "Reddit 新帖 RSS",
            },
            {
              title: "X：MSCI 剔除 Strategy 被两个账号提到",
              detail: "吴说与链研社都写到 MSCI 将把 Strategy 移出指数；另有英伟达 CEO 相关传闻在时间线流传，本报未核实。",
              meta: "X 抽样 07:18–08:33",
            },
          ]}
        />
      </Section>

      {/* ④ 数据截至：所有日期、新鲜度、缺项集中在这一张表 */}
      <Section id="freshness" heading="数据截至">
        <Table
          columns={["数据源", "数据日 / 窗口", "状态"]}
          align={["start", "start", "end"]}
          rows={[
            ["恐惧贪婪（Alternative.me）", "UTC 2026-11-12", { text: "新抓", tone: "success" }],
            ["收入（DefiLlama）", "UTC 2026-11-10，11-11 未出", { text: "新抓 · 有修订", tone: "warning" }],
            ["TehcScreener", "2026-11-10（Elysium 至 11-11）", { text: "新抓", tone: "success" }],
            ["Defined / Codex", "11-12 08:34:02 快照，回滚 24h", { text: "新抓", tone: "success" }],
            ["r/Monad", "自 11-11 08:50 起", { text: "新帖已抓 · 评论未抓", tone: "warning" }],
            ["rarefriends", "自 11-11 08:50 起", { text: "新抓 · 无更新", tone: "success" }],
            ["X 关注时间线", "11-12 07:18:35–08:33:18", { text: "部分覆盖 · 约 75 分钟", tone: "warning" }],
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

      {/* ⑤ 模块区 */}

      <Section id="revenue" heading="收入 · GMGN / FOMO" caption="DefiLlama dailyRevenue，UTC 完整日，不是实时行情。">
        <Table
          columns={["项目", "UTC 11-10", "较 11-09", "占 ATH", "ATH"]}
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
        <Text>近 14 个完整日（UTC 10-28 至 11-10）。11-09 的 FOMO 柱为修订后数值；GMGN 11-09 与昨早一致。</Text>
      </Section>

      <Section
        id="onchain"
        heading="Trench 与链上活动"
        caption="TehcScreener，数据日 2026-11-10；synced_at 2026-11-11 23:33:05（北京时间）。底层 Allium。"
      >
        <Columns points={trenchRecent} emphasis={4} />
        <Table
          columns={["Trench 分项 · 11-10", "数值", "分位"]}
          align={["start", "end", "end"]}
          rows={[
            ["发射台成交额", formatUsd(1050352557.4107416), "29"],
            ["新发射", "76,257", "73"],
            ["机器人成交额", formatUsd(174080930.4203473), "32"],
            ["机器人手续费", formatUsd(1181347.8717953796), "20"],
          ]}
        />

        <Text>发射台 · 合计成交额 {formatUsd(313625991.960529)}，新发射 41,964</Text>
        <Table
          columns={["发射台", "成交额", "新发射"]}
          align={["start", "end", "end"]}
          rows={[
            ["solana / pumpfun", formatUsd(275899695.3909415), "40,607"],
            ["robinhood / ponsfamily", formatUsd(17850161.68641012), "727"],
            ["solana / stonk", formatUsd(13137009.529210163), "336"],
            ["robinhood / long", formatUsd(3092009.877771891), "178"],
            ["solana / letsbonk", formatUsd(2131102.999238023), "16"],
            ["solana / Rise", formatUsd(908461.0601080958), "44"],
            ["arc / argus", formatUsd(366645.01374759054), "8"],
            ["base / The Stonks Exchange", formatUsd(173240.5418148143), "11"],
            ["robinhood / flap", formatUsd(67665.86128683932), "37"],
          ]}
        />

        <Text>机器人 · 合计成交额 {formatUsd(173473519.71)}，手续费 {formatUsd(1178116.97)}</Text>
        <Table
          columns={["机器人", "成交额", "手续费"]}
          align={["start", "end", "end"]}
          rows={[
            ["Axiom", formatUsd(50777340.61), formatUsd(425778.38)],
            ["fomo", formatUsd(44362150.63), formatUsd(184969.64)],
            ["pumpfun app", formatUsd(29589123.39), formatUsd(80835.5)],
            ["GMGN", formatUsd(26341130.92), formatUsd(273726.61)],
            ["Terminal", formatUsd(11225318.56), formatUsd(139416.87)],
            ["Basedbot", formatUsd(8408893.86), formatUsd(44221.79)],
            ["Trojan", formatUsd(1232540.19), formatUsd(13427.9)],
            ["Maestro", formatUsd(680735.17), formatUsd(5034.14)],
            ["Bonkbot", formatUsd(443703.17), formatUsd(6463.78)],
            ["Photon", formatUsd(412583.21), formatUsd(4242.36)],
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
            ["Solana", formatUsd(2950838862.0193076), "839,142"],
            ["Base", formatUsd(1142830565.8522437), "68,110"],
            ["Robinhood", formatUsd(1046640325.4189118), "66,659"],
            ["HyperEVM", formatUsd(91974826.57953906), "3,913"],
            ["Elysium（至 11-11）", formatUsd(62261823.89482434), "45,980"],
            ["Arc", formatUsd(24052914.388952482), "3,907"],
          ]}
        />
      </Section>

      <Section
        id="defined"
        heading="Defined 新池 · 4 小时热度前 5"
        caption="≤24h 新池观察榜，不一定是新发行代币；按 Codex trendingScore4 排序，不等同 DexScreener Trending。非交易建议。"
      >
        <Table
          columns={["#", "代币", "流动性", "24h 交易量", "较昨午榜", "叙事"]}
          align={["end", "start", "end", "end", "start", "start"]}
          emphasis={1}
          rows={[
            ["1", <a href={definedHref("5qaP7oKUqKffwwo5DaEqDoTtsBLMpdbQTxEkCDaTpump")}>Max</a>, formatUsd(146234), formatUsd(46446066), "新上", "—"],
            ["2", <a href={definedHref("8xMxrxPTCYJRwumZEpMfkRjNry4UJoRy75J4B96eJTkM")}>vibeshift</a>, formatUsd(9150), formatUsd(1158604), "新上", "—"],
            ["3", <a href={definedHref("4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump")}>mihao</a>, formatUsd(6921), formatUsd(845855), "1 → 3", "「你好猫」迷因系列"],
            ["4", <a href={definedHref("55TB1G3TedWG1kdeZeBjTpGUq7C1Kk917j4cdmaDpump")}>CHICK</a>, formatUsd(5715), formatUsd(382380), "新上", "—"],
            ["5", <a href={definedHref("4xgqefa5WcdHWKXzqvM9MRJqWYGaHVEUnpUL4Vq5pump")}>HUNG</a>, formatUsd(24462), formatUsd(113755), "新上", "—"],
          ]}
        />
        <Text>掉出：HOLD、ORVIX、VEYL、PayCat。</Text>
        <Text>
          mihao：官方网站 <a href="https://mihao.fun/">mihao.fun</a> 自称「你好猫」迷因系列，并公示了与本榜相同的合约。今日上榜的是 mihao/USDC 池，不是昨午榜上的 mihao/SOL 池。其余 4 个未找到可核对合约的公开项目资料，叙事记为「—」。
        </Text>
      </Section>

      <Section id="community" heading="社区与代码">
        <Text>r/Monad · 自 11-11 08:50 以来 3 篇新帖</Text>
        <Rows
          rows={[
            {
              title: "GroupPot：让集体储蓄圈更透明（2 篇）",
              detail: "作者两次介绍 GroupPot，称要让 Ajo、Susu 等传统集体储蓄圈更透明、可问责，附演示，并称移动应用即将推出。",
              meta: "/u/Life-Atmosphere-8337",
            },
            {
              title: "Fling 团队称不会停",
              detail: "转述 Fling 团队发文：项目不会停、从未被盗、没有外部融资；并问当前市场里小型 Monad 团队近况。",
              meta: "/u/Holywizy",
            },
          ]}
        />
        <Text>
          原帖：
          <a href="https://www.reddit.com/r/Monad/comments/1xtos26/we_built_grouppot_to_make_ajo_and_group_savings/">GroupPot ①</a>
          {" · "}
          <a href="https://www.reddit.com/r/Monad/comments/1xteuxv/we_built_grouppot_to_make_ajo_susu_and/">GroupPot ②</a>
          {" · "}
          <a href="https://www.reddit.com/r/Monad/comments/1xtfelf/flings_team_posted_today_that_theyre_not_going/">Fling</a>
          。摘要依据标题与正文摘要；评论 RSS 本次未抓。
        </Text>

        <Text>
          <a href="https://github.com/rarefriends">rarefriends</a> · 公开仓库与 PR 无新更新。
        </Text>
      </Section>

      <Section
        id="x-digest"
        heading="X 关注摘要"
        caption="抽样 2026-11-12 07:18:35–08:33:18（北京时间），2 页 197 条，约 75 分钟，非全量。11-11 08:42 至 11-12 07:18 未覆盖。"
      >
        <Callout lead="主线" tone="info">
          行业侧是 MSCI 剔除 Strategy、以色列银行开放加密买卖、SEC 支持个股永续；AI 侧是 Anthropic 在 AMD GPU 上跑 Claude 与代理身份讨论；安全侧是 Telegram 新版消息内应用缺少沙盒。英伟达 CEO 相关传闻大量出现，本报未核实。
        </Callout>
        <Text>标签：转述＝转引他人或媒体；截断＝接口返回不全，只依据已返回文字；未核实＝本报未核对原始来源。</Text>

        <Text>行业与监管</Text>
        <Rows
          rows={[
            {
              title: "MSCI 将剔除 Strategy 等公司",
              detail: "吴说引路透社：MSCI 按新的非经营性公司筛选方法，剔除 Strategy、Metaplanet、Yellow Cake，12 月 1 日生效。链研社写法：Strategy 移出 MSCI USA，连带 World 与 ACWI，11 月 30 日收盘生效，市场几乎没反应，因 Strategy 两周前已写进季报。",
              meta: "@wublockchain12 · @lianyanshe · 转述 · 截断",
            },
            {
              title: "以色列 Discount Bank 将开放比特币、以太坊买卖",
              detail: "11 月 26 日起客户可直接在手机银行买卖，无需外部交易所账户或自管钱包，有望成为以色列首家。",
              meta: "@wublockchain12 · 转述",
            },
            {
              title: "SEC 支持 CFTC 批准个股永续期货",
              detail: "SEC 向法院提交法庭之友意见书支持 CFTC；此前 Cboe、Citadel Securities 等所在的 Capital Markets Alliance 起诉，认为应由 SEC 监管。",
              meta: "@wublockchain12 · 转述 · 截断",
            },
            {
              title: "Ledger CEO：没有绝对的安全",
              detail: "Pascal Gauthier 接受 Bloomberg Television 采访时表示世上没有绝对的安全；标题写的是「每个人迟早都会遭到黑客攻击」。",
              meta: "@wublockchain12 · 转述 · 截断",
            },
            {
              title: "RUM Group 2026 Q3 财报",
              detail: `营收 ${formatUsd(96600000)}，同比 +290%、环比 +139%；调整后 EBITDA 首次转正至 ${formatUsd(4410000)}；净亏损扩大至 ${formatUsd(89850000)}。AI 基础设施业务 Quake AI 贡献 ${formatUsd(68200000)}，占营收逾 70%。`,
              meta: "@wublockchain12 · 转述 · 截断",
            },
          ]}
        />
        <Text>
          原帖：
          <a href="https://x.com/wublockchain12/status/2120658772159082875">MSCI（吴说）</a>
          {" · "}
          <a href="https://x.com/lianyanshe/status/2120675767805682153">MSCI（链研社）</a>
          {" · "}
          <a href="https://x.com/wublockchain12/status/2120674097357283573">Discount Bank</a>
          {" · "}
          <a href="https://x.com/wublockchain12/status/2120657698618593640">SEC / CFTC</a>
          {" · "}
          <a href="https://x.com/wublockchain12/status/2120667899002286093">Ledger</a>
          {" · "}
          <a href="https://x.com/wublockchain12/status/2120665805285363920">RUM</a>
        </Text>

        <Text>市场与链上</Text>
        <Rows
          rows={[
            {
              title: "Hyperliquid 上 VBVIT 回补部分 BTC 空单",
              detail: "昨晚 23:46 起分批回补，凌晨 4–6 点最集中；BTC 空仓从 1,245 枚降到 999 枚，方向仍为空。",
              meta: "@lianyanshe · 转述 · 截断",
            },
            {
              title: "英伟达 CEO 相关传闻",
              detail: "引用行情帖称「华尔街日报称，英伟达准备罢免 CEO 黄仁勋」，并写盘后跌幅扩大至 8%。",
              meta: "@oran_ge · 转述 · 未核实",
            },
          ]}
        />
        <Text>
          原帖：
          <a href="https://x.com/lianyanshe/status/2120674875883090390">VBVIT</a>
          {" · "}
          <a href="https://x.com/oran_ge/status/2120661560129655116">英伟达传闻</a>
        </Text>

        <Text>AI 与产品</Text>
        <Rows
          rows={[
            {
              title: "Anthropic 路演：已在 AMD GPU 上运行 Claude",
              detail: "引用路演转写：今年首次使用 AMD GPU；过去接入新芯片需数十名工程师数月，这次用 Mythos 三天写出在 AMD 上运行 Claude 的内核。",
              meta: "@oran_ge · 转述 · 截断",
            },
            {
              title: "美国科技岗位增长几乎不在软件岗",
              detail: "引用就业观察：科技公司空缺超 281,000 个、同比 +17%，产品、工程与设计职位仅 +2%。他认为软件业基本停滞，AI 数据中心相关实体岗位大增。",
              meta: "@oran_ge · 转述 · 截断",
            },
            {
              title: "a16z 的 B2A 经济",
              detail: "转述 Olivia Moore 与 Justine Moore 的文章：生意要考虑 Business to Agent；引 HUMAN Security 称 8–10 月 AI 智能体浏览流量涨 8 倍。",
              meta: "@sleepy0x13 · 转述 · 截断",
            },
            {
              title: "AI 圈把未来说得过近的激励",
              detail: "他认为技术进步不假，但行业里几乎所有人都有动力把未来说得离现实更近一点。",
              meta: "@sleepy0x13 · 截断",
            },
            {
              title: "代理访问服务时的身份证明",
              detail: "带钱包的代理能访问任何服务，但服务不愿被任意代理访问；他赞同 MPP 扩展身份原语，认为流程会很像传统授权。",
              meta: "@gakonst",
            },
            {
              title: "Standard Agents 走出隐身期",
              detail: "转发 Justin 的发布说明：面向代理的开放标准加 harness 运行时，安装到兼容运行时后行为应一致。Gajesh 表示期待试用。",
              meta: "@gajesh · 转述",
            },
            {
              title: "ZKsync：用生产部署衡量 Prividium",
              detail: "官方引用 Alex Gluchowski 在 The Rollup 的说法：试点不再算数，客户部署才是唯一真正的成功指标。",
              meta: "@zksync · 官方 · 转述",
            },
          ]}
        />
        <Text>
          原帖：
          <a href="https://x.com/oran_ge/status/2120669369013555248">AMD / Claude</a>
          {" · "}
          <a href="https://x.com/oran_ge/status/2120662791829008806">科技就业</a>
          {" · "}
          <a href="https://x.com/sleepy0x13/status/2120670236240412773">B2A</a>
          {" · "}
          <a href="https://x.com/sleepy0x13/status/2120664080881156127">叙事激励</a>
          {" · "}
          <a href="https://x.com/gakonst/status/2120657845003972745">代理身份</a>
          {" · "}
          <a href="https://x.com/gajesh/status/2120663652101730413">Standard Agents</a>
          {" · "}
          <a href="https://x.com/zksync/status/2120675805290496011">ZKsync</a>
          {" · "}
          <a href="https://x.com/zksync/status/2120675808033538410">完整采访</a>
        </Text>

        <Text>安全</Text>
        <Rows
          rows={[
            {
              title: "提醒暂缓更新 Telegram",
              detail: "新版 Telegram 支持消息内「应用」，但所谓沙盒是进程内 QuickJS 解释器，没有 fork、isolatedProcess 或 seccomp；一旦 QuickJS 有漏洞，可能获得与客户端相同的权限。建议先不更新。",
              meta: "@evilcos · 转述",
            },
          ]}
        />
        <Text>
          原帖：<a href="https://x.com/evilcos/status/2120665611466633246">Telegram 沙盒</a>。本报未独立复现，不是官方安全通告。
        </Text>

        <Text>工具</Text>
        <Rows
          rows={[
            { title: "tatami", detail: "gakonst 用 Zig 写的 macOS 平铺窗口管理器；他称用过 i3、yabai、AeroSpace 后终于找到合适的。", meta: "@gakonst" },
            { title: "Nanocode", detail: "自称面向 Frontier Embedded Agents 的 SDK。", meta: "@gakonst 转发" },
            { title: "个人工具与 GitHub PR 界面", detail: "他还说个人工具上的不满现在几乎都能一次性解决，并称新 GitHub PR 界面「绝对糟糕」。", meta: "@gakonst" },
          ]}
        />
        <Text>
          链接：
          <a href="https://github.com/gakonst/tatami">tatami</a>
          {" · "}
          <a href="https://x.com/gakonst/status/2120675007563182449">tatami 原帖</a>
          {" · "}
          <a href="https://nanocode.xyz">nanocode.xyz</a>
          {" · "}
          <a href="https://x.com/gakonst/status/2120676274507259919">Nanocode 转发</a>
          {" · "}
          <a href="https://x.com/gakonst/status/2120666138120208452">个人工具</a>
          {" · "}
          <a href="https://x.com/gakonst/status/2120672028378448169">GitHub PR</a>
        </Text>
      </Section>

      {/* ⑥ 取数与来源：审计用，读者通常不看 */}
      <Section
        id="methods"
        heading="取数与来源"
        caption="覆盖窗口：上次正式早报 2026-11-11 08:50:22 至今，含上一自然日 11-11（北京时间）。"
      >
        <Checklist
          items={[
            { text: "恐惧贪婪指数", done: true, meta: "1 次 · 200" },
            { text: "GMGN / FOMO dailyRevenue", done: true, meta: "2 次 · 200 · FOMO 11-09 被修订" },
            { text: "TehcScreener", done: true, meta: "status 已变，业务接口全部重抓" },
            { text: "Defined / Codex 新池", done: true, meta: "filterPairs 1 次 · 4.368 CU" },
            { text: "r/Monad 新帖 RSS", done: true, meta: "1 次 · 200" },
            { text: "r/Monad 评论 RSS", done: false, meta: "本次未请求，评论数记为 --" },
            { text: "rarefriends 仓库与 PR", done: true, meta: "3 次 · 均 200" },
            { text: "关注账号 X 摘要", done: true, meta: "部分覆盖：2 页 197 条，约 75 分钟" },
          ]}
        />
        <Properties
          items={[
            { label: "取数时间", value: "2026-11-12 08:33:11–08:34:02（北京时间）；X 随后读取" },
            { label: "请求", value: "公开 HTTP 13 次均 200；Defined 1 次；X 连接器 2 页" },
            { label: "Codex 额度", value: "apiUsage remaining 9992 / 10000（管道异步，不一定含本次 4.368 CU）" },
            { label: "缓存目录", value: "run-20261112-083226 · defined-codex/20261112-083402 · defined-codex/token-images/20261112-083402" },
          ]}
        />
        <Rows
          rows={[
            { title: "DefiLlama", detail: "summary/fees/{gmgn,fomo}，dataType=dailyRevenue。UTC 完整日，不是实时行情。" },
            { title: "TehcScreener", detail: "仅官方 /api/v1：status、trench、launchpads、bots、chains；RWA 照常缓存，页面不展示。" },
            { title: "Defined / Codex", detail: "GraphQL filterPairs，全部受支持主网回滚 24h；流动性、24h 成交额 ≥ $1.00K，交易 ≥ 10 笔；按 trendingScore4 取 40 条，去掉双边主流资产池（本次 3 个），按合约+链去重取前 5。" },
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
