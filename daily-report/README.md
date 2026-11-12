# daily-report 新版排版

Daily bot 每日「关注清单日报」Page 的新版排版。只改呈现，不改监控项、数据源或数据。

| 文件 | 内容 |
|---|---|
| [`GUIDE.md`](GUIDE.md) | 出报规范：结构、层级、文案节奏、数字格式、颜色、组件用法、自查清单 |
| [`template.tsx`](template.tsx) | 空白模板，`«…»` 为占位 |
| [`examples/2026-11-12.tsx`](examples/2026-11-12.tsx) | 用 2026-11-12 正式早报原数据重排的完整示例 |

## 改了什么

旧版的问题与对应改动：

| 旧版 | 新版 |
|---|---|
| 顶部「今日变化」Callout 约 250 字，与 summary 内容重复 | 拆成：4 格看板 + 只在有修订时出现的警示 + 3–5 条结论式「今日要点」 |
| 数据日、缓存复用、缺项散落在各节长 caption 里（Defined 一节 caption 约 200 字） | 集中到一张「数据截至」表，每个数据源一行；caption 只留一句口径 |
| 同一数字在 Metrics、Table、Callout、正文里重复出现；恐惧贪婪单独一节，Metrics + 表格只讲 28/29/−1 | 一个事实最多出现两次；恐惧贪婪并入看板 |
| X 摘要按账号排列，8 个账号各配一段「解读：……不是已核实档案」样板话 | 按主题分组（行业 / 市场 / AI / 安全 / 工具），同一事件合并多个账号，用「转述 / 截断 / 未核实」标签代替样板段 |
| Defined 新池：表格 + 5 个叙事块（4 个写「暂无可核实叙事」）+ 空图标占位 | 一张表包含名次变化与叙事列，掉出名单一行 |
| r/Monad 用英文标题当正文，评论数一列全是 `--` | 中文结论式标题 + 摘要，同主题多帖合并 |
| 取数与来源：Properties + Checklist + 长 Rows 三处说同一件事 | Checklist 管状态，Properties 管时间/额度/缓存，Rows 只留一句话口径 |
| 金额格式不统一（11-10 用「万 / 亿 + 原始 USD」，11-12 用 `$K/M/B`） | 统一 `formatUsd`；变化统一 `pctCell` 计算并着色 |

## 怎么用

1. Daily bot 出报时复制 `template.tsx`，替换 `«…»` 占位和顶部数据常量。
2. 按 `GUIDE.md` §3 写文案，按 §8 自查。
3. 拿不准时对照 `examples/2026-11-12.tsx`。

组件从 `cursor/pages` 引入，与现有三份日报源码一致（见 README 下方「待确认」）。

## 待确认

- 任务说明写的是 `grok/canvas`，但现有日报源码实际 `import … from "cursor/pages"`、使用 `useCursorPageTheme`。模板沿用了源码中的 `cursor/pages`；如果渲染环境确实是 `grok/canvas`，只需改 import 一行，组件名与属性未变。
- 本机没有 Node/TypeScript，示例与模板**未经编译或渲染验证**，只用了旧日报中已出现过的组件与属性。新用法有两处：`Table` 的 `emphasis={1}`（旧版只用过 `0`）、`Columns` 的 `emphasis={trenchRecent.length - 1}`（模板中）。
