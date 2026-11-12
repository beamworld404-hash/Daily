# 关注清单日报 · 网站

日报通过这个**独立网站**交付，用普通浏览器打开，不依赖 Grok Bot 的 Page / Canvas，也不在聊天里发报告。

- 每天一份 JSON 数据文件 → `check.py` 校验 → `npm run build` 构建成静态站 → 浏览器打开。
- 前端是 React 19 + Vite + TypeScript，不依赖第三方 UI 组件库，数据来自 `content/reports/*.json`。
- 构建产物是纯静态文件（`app/dist/`），不需要后端，不请求外部 CDN 或字体。

## 目录

```
web/
├── content/reports/YYYY-MM-DD.json   # 每天一份数据（唯一需要每天新增的文件）
├── check.py                          # 数据校验（Python 3.12+ 标准库）
├── dailysite/validate.py             # 校验规则
├── tests/test_site.py                # 校验的单元测试
└── app/                              # 网站前端（React 19 + Vite）
    ├── package.json                  # 脚本：dev / build / preview / test / check
    ├── index.html
    ├── src/
    │   ├── App.tsx                   # 按路由选页面
    │   ├── components/pages.tsx      # 期目录页、章节详情页、往期页、底部书卡
    │   ├── components/chapters/      # 每一章的内容与目录说明（全部由当期 JSON 算出）
    │   ├── components/ui.tsx         # 胶囊标签、表格、柱状图、提示框、深浅色按钮
    │   ├── lib/                      # 数据类型、格式化、读取 JSON、hash 路由、深浅色、链接渲染
    │   └── styles.css                # 全部版式与配色（无第三方 UI 库、无外部字体）
    ├── tests/format.test.ts          # 格式化单测（与旧版 formatUsd 对照）
    └── dist/                         # 构建产物（.gitignore，不入库）
```

## 安装依赖

需要 **Node.js 20.19+**（开发时用 Node 26）和 **Python 3.12+**。

本机没有 Node 时，可以装到用户目录，不动系统包管理：

```bash
# 例：官方二进制包解压到 ~/.local/node（版本号按 https://nodejs.org/dist/ 最新 LTS）
mkdir -p ~/.local/node
curl -fsSLO https://nodejs.org/dist/v26.13.1/node-v26.13.1-linux-x64.tar.xz
tar -xJf node-v26.13.1-linux-x64.tar.xz -C ~/.local/node --strip-components=1
export PATH="$HOME/.local/node/bin:$PATH"     # 可写进 ~/.bashrc
```

然后在仓库根目录：

```bash
cd web/app
npm ci          # 按 package-lock.json 安装依赖
```

构建不需要任何访问密钥。

## 本地启动与预览

都在 `web/app/` 下运行，只监听 `127.0.0.1`：

| 命令 | 用途 | 地址 |
|---|---|---|
| `npm run dev` | 开发模式，改代码或 JSON 自动刷新 | <http://127.0.0.1:5173/> |
| `npm run build` | 校验数据 + 类型检查 + 构建到 `dist/` | — |
| `npm run preview` | 预览构建好的 `dist/` | <http://127.0.0.1:4173/> |

- 端口用 `--strictPort` 固定为 5173 / 4173，被占用时直接报错而不是悄悄换端口。要换端口：`npm run dev -- --port 5180`。
- **不要使用 5002 和 8765**：东京 VPS 上这两个端口已有别的预览进程。
- 在远程服务器上预览：从自己电脑做 SSH 端口转发 `ssh -L 4173:127.0.0.1:4173 <服务器>`，再在本机打开 <http://127.0.0.1:4173/>。不要把预览绑定到公网地址。
- 页面地址（hash 路由，静态托管在任意子路径都能用）：
  - `#/` 最新一期目录；`#/2026-11-12` 某一期目录；`#/2026-11-12/onchain` 某一期的某一章（`overview` / `onchain` / `trench` / `defined` / `community` / `x` / `methods`）；`#/2026-11-12/onchain/fng` 某一章并定位到某一节；`#/archive` 往期。
- `dist/` 用的是 ES 模块脚本，需要通过 HTTP 打开（`npm run preview` 或任意静态服务器），直接双击 `file://` 打开会被浏览器拦截。

### 访问控制

日报对 beam 是私有资料：

- 开发 / 预览服务器只监听 `127.0.0.1`，外部网络无法访问。
- 页面带 `noindex` 和 `no-referrer`，外链都是 `target="_blank" rel="noopener noreferrer"`。
- 如以后要长期托管，请放在有登录保护的地方（例如需要登录的内网、带访问控制的静态托管），不要公开无鉴权发布。

## 每日更新流程

出报方（Daily bot 生成数据，或人工/督工转存）每天只需新增一个文件：

1. 新建 `web/content/reports/YYYY-MM-DD.json`，可以复制前一天的文件改数据。字段见下文「数据格式」。
2. 校验：`python3 web/check.py`（或在 `web/app` 下 `npm run check`）。有错会逐条列出路径，例如 `2026-11-13.json $.revenue.protocols[0].values: 长度 13 与 dates 长度 14 不一致`，改到通过为止。
3. 构建：`cd web/app && npm run build`。构建前会自动再校验一次，不通过就不构建。最新一期、往期列表、前后期导航都自动更新。
4. 预览：`npm run preview`，打开 <http://127.0.0.1:4173/>。
5. 提交数据文件（`git add web/content/reports/YYYY-MM-DD.json`），按仓库流程走分支 / PR。`dist/` 不入库，在要预览或托管的机器上重新构建即可。

不需要改 Daily bot 本身：只要它（或转存的人）能产出符合格式的 JSON。如果暂时仍拿到的是旧版 `.tsx` Page 源码，需要人工把数据转写成 JSON；**只转写原稿已有的事实**，不补数、不估算。

## 测试

```bash
python3 -m unittest discover -s web/tests -v    # 数据校验（仓库根目录）
cd web/app && npm test                          # 格式化口径
cd web/app && npm run typecheck                 # TypeScript 类型检查
```

## 数据约定

### 原则

- **存原始数，不存排好版的数。** 金额存美元原值（如 `300012`），`$300.01K`、`↑ 3.81%`、占 ATH 比例、看板 KPI 都在页面里计算（`app/src/lib/format.ts`），跟旧版 `formatUsd` 口径一致（`npm test` 有单测对照）。
- **一个事实只存一处。** 看板四个 KPI 从 `fng` / `revenue` / `tehc.trench` 算出，不另写。
- **模块可缺省。** `fng`、`revenue`、`tehc`、`defined`、`reddit`、`github`、`x_digest`、`notices` 都可以不写，页面和目录会自动跳过；`methods`（取数与来源）必填，缺项要在 `methods.checklist` 里标 `skipped` / `failed`，不能用旧数字冒充。
- **文字里的链接**只支持 `[文字](https://…)` 一种写法，其余内容一律按纯文本转义。

## 数据格式（schema_version 1）

完整示例：[`content/reports/2026-11-12.json`](content/reports/2026-11-12.json)。校验规则在 [`dailysite/validate.py`](dailysite/validate.py)；前端类型在 [`app/src/lib/types.ts`](app/src/lib/types.ts)，改字段时两边一起改。

| 字段 | 必填 | 说明 |
|---|---|---|
| `schema_version` | ✓ | 固定 `1` |
| `date` | ✓ | `YYYY-MM-DD`，必须与文件名一致 |
| `edition` | ✓ | `早报`；测试版写 `下午测试` 等，会显示在标题标签里 |
| `issued_at` | ✓ | 出报时间（北京时间），如 `2026-11-12 09:00` |
| `coverage` | ✓ | 覆盖窗口一句话 |
| `summary` | ✓ | 导语，≤ 3 句；也用于首页卡片和归档列表 |
| `highlights` | ✓ | 今日要点，字符串数组，3–6 条，每条带数字或名字 |
| `notices[]` |  | 修订 / 异常提示：`tone`（`info`/`warning`/`danger`）、`title`、`text`。没有就不写 |
| `fng` |  | `source`；`latest` / `previous`：`date`、`value`（0–100）、`class_en`、`class_zh` |
| `revenue` |  | `source`、`caption`、`dates[]`（升序 UTC 日期）、`protocols[]`：`name`、`url`、`values[]`（与 dates 等长，最后一项为最新完整日）、`ath`（`usd`、`date`）、`notes[]`。数据源修订了已报道的数字时，`values` 用修订后的值，并在 `notices` 写明「从 X 修订为 Y」 |
| `tehc` |  | `source`、`caption`；`trench`：`date`、`score`、`label`、`label_zh`、`note`、`history[]`（`date`、`score`，最后一项 = `trench.date`）、`components[]`（`name`、`usd` 或 `count`、`percentile`）、`components_note`；`launchpads` / `bots`：`caption`、`total`、`rows[]`；`bots.warning`；`chains`：`caption`、`rows[]`（`name`、`dex_volume_usd`、`wallets`、`date`，日期与多数不一致的链自动标注） |
| `defined` |  | `title`、`fetched_at`、`caption`、`changes`（与上一榜对比）、`tokens[]`（按名次：`symbol`、`chain`、`url`、`liquidity_usd`、`volume_24h_usd`、`status`（`新上`、`1 → 3` 等）、`narrative`（无可核实资料写 `null`））、`method` |
| `reddit` |  | `subreddit`、`url`、`since`、`summary`、`note`、`posts[]`（`title`、`url`、`author`、`comments`：未取到写 `null`） |
| `github` |  | `org`、`url`、`updated`（布尔）、`text` |
| `x_digest` |  | `caption`、`window`、`mainline`；`accounts[]`：`name`、`handle`（不带 @）、`items[]`（`title`、`detail`、`url` 或 `links[]`，可选 `truncated` / `unverified` 标记）、`note`；`tools[]`：`title`、`detail`、`links[]` |
| `methods` | ✓ | `properties[]`（`label`、`value`）、`checklist[]`（`text`、`status`：`ok`/`partial`/`skipped`/`failed`、`meta`）、`sources[]`（`title`、`detail`）、`links[]`（`title`、`site`、`url`） |

## 设计说明

版式对标一个作品库式的参考站（「目录 → 章节文章」的阅读型网站），不使用第三方 UI 组件库：

- **期目录页**：左上角站点标记；456px 居中单列；48px 衬线大标题（「11 月 12 日早报」）+ 16px 灰色导语；下面是细分隔线隔开的章节列表，每行一个 15px 中粗标题 + 14px 灰色说明（说明全部由当期数据算出），悬停整行浅灰圆角底；有修订提示的章节右侧带橙色描边胶囊。
- **书卡**：页面底部扇形排开的彩色卡片，对应最近几期和「往期」，固定在视口底部只露出上沿，悬停抬起。
- **章节页**：左侧固定「← 日期」返回与小节目录（阅读位置高亮）；576px 正文列；36px 衬线章标题、24px 衬线小节标题带底部细线；正文 16/24 stone 灰；底部「← 上一章 / 下一章 →」。窄屏（≤1100px）收起左侧目录。
- **配色**：白底 + stone 灰阶，强调色橙 `#e54f10`；跟随系统深浅色，也可手动切换（stone-950 深色底）。
- **字体**：标题用系统衬线（Iowan Old Style / 思源宋体 / Noto Serif CJK / 宋体），正文用系统无衬线；不打包、不外链任何字体文件，显示效果取决于本机已装字体。
- **数据图**：收入与 Trench 分数用单序列柱状图，只标注最新一根，逐日数值在可展开的表格里。
