# 关注清单日报 · 网站

日报改为通过这个**独立静态网站**交付：在普通浏览器里打开，不再依赖 Grok Bot 的 Page / Canvas，也不再在聊天里给 beam 发报告。

- 每天一份 JSON 数据文件 → `build.py` 校验并生成纯静态 HTML → 浏览器打开。
- 只依赖 Python 3.12+ 标准库，无 npm、无第三方包、无外部 CDN 或字体请求。
- 页面不需要 JavaScript 也能完整阅读；JS 只负责深浅色切换、图表悬停提示和目录高亮。

## 目录

```
web/
├── content/reports/YYYY-MM-DD.json   # 每天一份数据（唯一需要每天新增的文件）
├── build.py                          # 校验 + 生成静态站到 web/dist/
├── serve.py                          # 本机预览服务器（默认只监听 127.0.0.1）
├── dailysite/                        # 生成器：fmt 格式化、validate 校验、charts 图表、render 页面
├── static/                           # style.css、app.js（复制到 dist/assets/）
├── tests/test_site.py                # 单元测试
└── dist/                             # 生成产物（已 .gitignore，不入库）
```

生成后的站点结构：

| 路径 | 内容 |
|---|---|
| `index.html` | 首页：最新一期卡片 + 按月归档 |
| `latest.html` | 跳转到最新一期，可固定收藏 |
| `reports/YYYY-MM-DD/index.html` | 单期日报，顶栏可翻前一期 / 后一期 |
| `assets/` | 样式与脚本 |

所有链接都是相对路径，`dist/` 可以整体拷到任何静态托管或直接用 `file://` 打开。

## 本地启动与预览

在仓库根目录：

```bash
python3 web/build.py            # 校验数据并生成 web/dist/
python3 web/serve.py            # 启动预览：http://127.0.0.1:8765/
# 或一步完成：python3 web/serve.py --build
```

浏览器打开 <http://127.0.0.1:8765/>（首页）或 <http://127.0.0.1:8765/reports/2026-11-12/index.html>（11-12 示例）。`Ctrl+C` 停止。

- 端口默认 8765，可用 `--port 9000` 或环境变量 `DAILY_SITE_PORT` 改，不涉及任何系统端口配置。
- **在远程服务器上预览**：服务器只监听回环地址，从自己电脑用 SSH 端口转发：
  `ssh -L 8765:127.0.0.1:8765 <服务器>`，然后在本机浏览器打开 <http://127.0.0.1:8765/>。
- 不启动服务器也可以：直接用浏览器打开 `web/dist/index.html`。

### 访问控制

日报对 beam 是私有资料：

- `serve.py` 默认只绑定 `127.0.0.1`，外部网络无法访问。
- 如果用 `--host` 绑定非回环地址，**必须**设置环境变量 `DAILY_SITE_PASSWORD`（HTTP Basic，用户名 `beam`），否则拒绝启动。这只是临时预览手段，不是生产部署方案；密码不要写进代码或提交。
- 服务器关闭目录列表，响应带 `X-Robots-Tag: noindex`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`；页面也带 `noindex` 和 `no-referrer`，外链不带来源页地址。
- 如以后要长期托管，请放在有登录保护的地方（例如需要登录的内网、带访问控制的静态托管），不要公开无鉴权发布。

## 每日更新流程

出报方（Daily bot 生成数据，或人工/督工转存）每天只需新增一个文件：

1. 新建 `web/content/reports/YYYY-MM-DD.json`，可以复制前一天的文件改数据。字段见下文「数据格式」。
2. 校验：`python3 web/build.py --check`。有错会逐条列出路径，例如 `2026-11-13.json $.revenue.protocols[0].values: 长度 13 与 dates 长度 14 不一致`，改到通过为止。
3. 生成：`python3 web/build.py`。首页、归档、前后期导航、`latest.html` 都会自动更新。
4. 提交数据文件（`git add web/content/reports/YYYY-MM-DD.json`），按仓库流程走分支 / PR。`web/dist/` 不入库，在要预览或托管的机器上重新生成即可。

不需要改 Daily bot 本身：只要它（或转存的人）能产出符合格式的 JSON。如果暂时仍拿到的是旧版 `.tsx` Page 源码，需要人工把数据转写成 JSON；**只转写原稿已有的事实**，不补数、不估算。

### 原则

- **存原始数，不存排好版的数。** 金额存美元原值（如 `300012`），`$300.01K`、`↑ 3.81%`、占 ATH 比例、看板 KPI 都在生成时计算，跟旧版 `formatUsd` 口径一致（有单测对照）。
- **一个事实只存一处。** 看板四个 KPI 从 `fng` / `revenue` / `tehc.trench` 算出，不另写。
- **模块可缺省。** `fng`、`revenue`、`tehc`、`defined`、`reddit`、`github`、`x_digest`、`notices` 都可以不写，页面和目录会自动跳过；`methods`（取数与来源）必填，缺项要在 `methods.checklist` 里标 `skipped` / `failed`，不能用旧数字冒充。
- **文字里的链接**只支持 `[文字](https://…)` 一种写法，其余内容一律按纯文本转义。

## 数据格式（schema_version 1）

完整示例：[`content/reports/2026-11-12.json`](content/reports/2026-11-12.json)。校验规则在 [`dailysite/validate.py`](dailysite/validate.py)。

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

- **信息层次：结论 → 证据 → 审计。** 头部是日期、出报时间和导语；接着是 4 个 KPI 看板（恐惧贪婪、FOMO 收入、GMGN 收入、Trench，可点击跳到对应节）、修订提示、今日要点；往下是 6 个模块卡片；最后是「取数与来源」审计区。
- **导航：** 宽屏左侧固定目录并高亮当前节，窄屏变成顶部胶囊标签；顶栏可翻前后期、回归档。
- **图表：** 服务端生成内联 SVG，不依赖图表库。收入用 14 日分组柱状图（悬停或键盘聚焦显示当日两项数值，并附可展开的逐日数据表）；占 ATH 用进度条；Trench 用 5 日柱图（末日强调、直接标数值）；榜单表格带行内比例条。协议颜色按实体固定（数据中的第 1、2 个协议），深浅色各有一组取值。
- **颜色语义：** 只有收入变化用升绿降红；恐惧贪婪、Trench 的点数变化保持中性色，不暗示好坏。「截断」「未核实」「新上」「无更新」用文字标签，不只靠颜色。
- **深浅色：** 默认跟随系统，顶栏按钮可切换并记在本机浏览器。也做了打印样式和移动端适配。
