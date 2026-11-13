# 部署：本机 nginx 静态站（IP 访问，仅 HTTP）

- 站点根目录：`/home/ubuntu/daily-site/current`（软链，指向 `/home/ubuntu/daily-site/releases/` 下的某次 Vite 构建；仓库外，不入库）
- 仓库内配置：`deploy/nginx/daily.conf`
- 系统路径：`/etc/nginx/sites-available/daily`，软链到 `/etc/nginx/sites-enabled/daily`（移除了默认站点 `default`）
- 监听 `0.0.0.0:80` 与 `[::]:80`，`systemctl enable nginx` 开机自启
- 没有域名，所以不配 HTTPS / 证书

## 安装或更新

```bash
bash deploy/install.sh          # 用现有 dist 发布
bash deploy/install.sh --build  # 先 npm run build 再发布
```

脚本可重复执行：nginx 未安装时才安装 nginx 与 acl；`current` 软链不存在时用 `web/app/dist` 的副本建立第一个发布目录；
只给 `www-data` 在 `/home/ubuntu` 等上级目录加“进入”（x）权限（ACL），安装配置，`nginx -t` 检查后
reload（nginx 未运行时才 start），最后用 `curl` 自检。

日常更新内容不需要动 nginx：`deploy/apply-report.sh` 把新构建放进新的发布目录，再用 `rename(2)` 原子替换
`current` 软链（`index.html` 为 `no-cache`，`/assets/` 下的带哈希文件长期缓存）。

## 公网访问

外网能否访问 80 还取决于云厂商控制台的安全组（不在本机 iptables 里），需在控制台放行 TCP 80。

## 每日自动发布（每天新一期）

从 2026-11-13 起，每天新一期自动发布到 GitHub Pages（https://beamworld404-hash.github.io/）和本机 nginx（80 端口）。

**本机自动出报并发布。** 自 2026-11-13 起 Daily bot 不再出报，数据由东京本机脚本每天 08:40（上海时间）抓取公开接口生成，
再走下面的「incoming → 校验 → 提交 → Pages → nginx」管道。出报只写本次实际取到的数字和事实，某个源失败就在
`methods` 里标 `failed` / `partial` 并省略对应章节，不估算、不补写、不沿用旧数字。

### 出报（`deploy/fetch-report.sh`）

```bash
bash deploy/fetch-report.sh                      # 今天（上海时间）：抓取 → 校验 → 投放到 incoming
bash deploy/fetch-report.sh --dry-run            # 只写临时目录（/tmp/daily-fetch-dryrun-*）并校验，不进 incoming、不发布
bash deploy/fetch-report.sh --dry-run --date 2026-11-14 --out /tmp/x   # 演练某一期（数据仍是此刻快照）
bash deploy/fetch-report.sh --force              # incoming / 仓库里已有当天文件时仍重抓（内容相同则不改写）
```

核心逻辑在 `deploy/fetch_report.py`（Python 3.12+ 标准库，**不需要任何密钥**），测试在 `web/tests/test_fetch_report.py`（离线）。

| 数据源 | 请求（全部公开、官方） | 写入字段 |
|---|---|---|
| Alternative.me 恐惧贪婪 | `https://api.alternative.me/fng/?limit=2` | `fng` |
| DefiLlama | `summary/fees/fomo`、`summary/fees/gmgn`（`dataType=dailyRevenue`），只取已公布的完整 UTC 日（最近 14 天）；与上一期同日读数不同就在 `notices` 与 `revenue.notes` 写明「从 X 修订为 Y」，图表用修订后的值 | `revenue` |
| TehcScreener | 仅官方 `/api/v1`：`status`、`trench`、`launchpads?window=1d`、`bots?window=1d`、`chains`（不请求 RWA，不调未文档化接口）；Trench 历史与上一期报道不同时写修订提示 | `tehc` |
| Reddit | 只用 r/Monad 新帖 Atom RSS，按条目 `updated` 落在覆盖窗口内筛选；只列标题和作者，不做内容概括；评论数写 `--`（不取评论 RSS） | `reddit` |
| GitHub | 未登录公开 REST：`/orgs/rarefriends/repos`，再按库 `/pulls?state=all&sort=updated`；不用 search、不克隆 | `github` |
| DexScreener（替代 Defined / Codex） | 见下 | `dexscreener` |
| X | **不抓**：本机没有 beam 的 X 关注时间线连接器。不写 `x_digest`，`methods.checklist` 标 `skipped` | — |

**DexScreener 榜的口径**（官方文档 <https://docs.dexscreener.com/api/reference>）：

1. `GET https://api.dexscreener.com/token-profiles/latest/v1`（限 60 次/分）：最新代币资料（token profiles）列表，约 30 条，按资料时间给出。官方接口**没有**「24h 新池」或热度排序端点，所以这不是新池榜。
2. 按链分批 `GET /tokens/v1/{chainId}/{最多 30 个地址}`（限 300 次/分）取交易对。
3. 每个代币只取它作为 `baseToken` 的交易对中 `liquidity.usd` 最高的一个；接口没给流动性（如仍在联合曲线上）或 24h 成交额的不入选；要求流动性 ≥ $1K、`volume.h24` ≥ $1K；按 `volume.h24` 降序取前 5。
4. 链接用接口返回的交易对 `url`，必须是同链的 `https://dexscreener.com/{chainId}/…`（`validate.py` 也会检查）。
5. `narrative` 一律 `null`：代币资料里的描述由项目方自行提交、未经核实。

与旧 Defined 榜（Codex `filterPairs`、≤24h 新池、`trendingScore4` 排序）**不是同一套口径**。只有上一期也有 `dexscreener` 时才做「新上 / 名次 / 掉出」对比；第一期（上一期是 Defined 榜）只注明数据源已更换、不可直接对比。不再调用 Defined / Codex。

**覆盖窗口**：起点为上一期正式早报（仓库 `web/content/reports/` 里日期更早的最新一期）`methods.properties`「本次取数」的开始时刻，取不到时用其 `issued_at`。

**投放**：先写到临时目录，用 `web/check.py --content <只含这一份的目录>` 校验，通过后复制成
`incoming/.YYYY-MM-DD.json.tmp.<pid>`（权限 644），同目录 `rename` 成 `YYYY-MM-DD.json`，发布脚本不会读到半个文件。

**幂等**：incoming 或仓库里已有当天文件时默认不重抓（退出码 0）；`--force` 重抓后内容与 incoming 里的相同则不改写。
发布的幂等由 `daily-cron.sh` / `apply-report.sh` 负责。

**日期**：正式出报只能生成今天这一期（数据是此刻快照，写成别的日期会错标）；`--date` 指定其他日期只能配合 `--dry-run`。

**失败行为**：每个源单独重试（429 / 5xx / 网络错误最多 3 次），失败的源标 `failed` 并省略章节、在 `notices` 写「部分数据源失败」；
恐惧贪婪、DefiLlama、TehcScreener、DexScreener 四个数值源**全部**失败，或校验不通过时，不生成任何文件，退出码 1，
10:30 的发布检查会记「今日数据未送达」，两个站点保持前一期。

**日志**（仓库外，不含密钥——本来也没有）：

- `logs/fetch-YYYY-MM-DD.log`：每次请求的 URL 与 HTTP 状态、各源结果、校验结果；`--dry-run` 记到 `logs/fetch-dryrun.log`
- `logs/fetch-YYYY-MM-DD.status`：`state=done`（已投放）/ `skipped`（已存在未重抓）/ `failed`
- `logs/runs/run-<时间>/`：本次各接口原始响应（保留最近 30 次）；dry-run 的原始响应在输出目录里

### 数据入口

- 目录：`/home/ubuntu/briefs/incoming/`（仓库外，权限 755，只有 ubuntu 可写）
- 文件：`YYYY-MM-DD.json`（上海时间当天的日期），内容必须符合 `schema_version` 1，`date` 字段与文件名一致
- 正常由 08:40 的 `deploy/fetch-report.sh` 写入；手动放文件时也请先写临时文件再 `mv` 成正式文件名

### 定时（用户 crontab，Asia/Shanghai）

见 `deploy/crontab.txt`，用 `bash deploy/install-cron.sh` 安装（可重复执行，只替换 `daily-report auto publish` 与
`daily-report auto fetch` 这两段，其余 crontab 条目不动）：

| 时间 | 命令 |
|---|---|
| 08:40 | `deploy/fetch-report.sh`（出报，投放到 incoming） |
| 09:15、09:30、09:45、10:00、10:15 | `deploy/daily-cron.sh` |
| 10:30 | `deploy/daily-cron.sh --final` |

每次调用只检查一次就退出，不常驻：

- 今天这一期已发布（状态 `done` 且 incoming 文件没变）→ 直接退出
- incoming 有当天文件 → 调 `deploy/apply-report.sh` 发布
- incoming 没有、仓库里已有这一期 → 调 `apply-report.sh` 确认已发布（幂等）
- 都没有：10:30 之前记 `waiting`；10:30 那一次记 `failed`「今日数据未送达」，不发布任何内容

### 发布脚本 `deploy/apply-report.sh FILE`

1. `web/check.py` 校验（新文件和仓库里已有各期一起校验），不通过就失败，原因写进状态文件
2. 仓库检查：必须在 `feat/daily-report-incr-design`、工作区干净、与 origin 不分叉（落后时只做快进）
3. 放到 `web/content/reports/YYYY-MM-DD.json`，构建（`npm run check` + `tsc -b` + `vite build`）到新的发布目录
   `/home/ubuntu/daily-site/releases/<时间>-<提交>`，不碰 nginx 正在用的目录
4. 提交（`data: 日报 YYYY-MM-DD`）并推送当前分支；只提交这一个数据文件
5. `deploy/publish-pages.sh --from-dist <发布目录>` 推公开 Pages 仓库（只用 `github.com-pages` 别名），与 nginx 用同一份构建
6. 原子切换 `/home/ubuntu/daily-site/current` 软链，`curl http://127.0.0.1/` 自检，失败则切回原目录；只保留最近 5 个发布目录

**幂等**：同一天同一份数据已在远端分支、Pages 与 nginx 都已是这份内容时直接退出，不构建、不提交、不推送。
判断依据是 `web/` 的 git tree hash（构建产物是确定的）：nginx 发布目录里的 `.source`（nginx 拒绝访问点文件）和
`/home/ubuntu/daily-site/pages.source`。中途失败后重跑，已完成的步骤会被判定为“无变化”跳过，从失败的那一步继续。

### 状态与日志（仓库外）

- 状态：`/home/ubuntu/briefs/daily-report-incr-design/logs/daily-YYYY-MM-DD.status`（每次原子覆盖）
- 日志：同目录 `daily-YYYY-MM-DD.log`（追加）；cron 自身输出在 `cron.log`

状态文件是 `key=value` 行：

```
date=2026-11-13
state=done                  # pending（发布中）/ waiting（等数据）/ done / failed
reason=已发布               # 失败时为具体原因，如「今日数据未送达…」「数据校验未通过…」「推送 … 失败」
updated_at=2026-11-13 09:15:42 CST
input=/home/ubuntu/briefs/incoming/2026-11-13.json
input_sha256=…
commit=abc1234              # 仓库里这一期数据所在的提交
branch_pushed=yes
pages=pushed                # pushed / unchanged / failed
pages_commit=def5678        # 公开 Pages 仓库的提交
nginx_release=/home/ubuntu/daily-site/releases/…
log=/home/ubuntu/briefs/daily-report-incr-design/logs/daily-2026-11-13.log
```

### 手动补跑

```bash
# 08:40 出报失败（例如某接口一时不可用）：当天内直接重跑出报，09:15–10:30 的发布检查会接着发布
bash deploy/fetch-report.sh
# 10:30 之后才出报成功：出报后手动发布
bash deploy/fetch-report.sh && bash deploy/apply-report.sh /home/ubuntu/briefs/incoming/$(date +%F).json
# 数据晚到（例如 10:30 之后才放进 incoming）：直接发布
bash deploy/apply-report.sh /home/ubuntu/briefs/incoming/2026-11-13.json
# 或按 cron 的逻辑检查某一天
bash deploy/daily-cron.sh --date 2026-11-13
# 只演练：校验 + 构建 + Pages 本地提交 + 与 nginx 现网比较，不提交、不推送、不切换、不写状态
bash deploy/apply-report.sh --dry-run /path/to/2026-11-13.json
```

### 失败时会怎样

- 出报失败（四个数值源全部失败或校验不通过）：不生成文件，`fetch-YYYY-MM-DD.status` 记 `failed`；之后同下一条
- 数据没送到：10:30 记 `failed`「今日数据未送达」，两个站点保持前一期，不会发布空的或编造的一期
- 校验 / 构建失败：不提交、不推送、不切换；临时放入仓库的数据文件会还原
- 分支推送失败：本地已有数据提交，状态 `failed`；重跑会继续推送（只会代推纯数据提交）
- Pages 推送失败：分支已推送，状态 `failed`、`pages=failed`；重跑会补推 Pages 并完成 nginx
- nginx 自检失败：切回原发布目录，状态 `failed`
- 期次日期晚于今天、仓库不在 `feat/daily-report-incr-design`、工作区有未提交改动、与远端分叉：直接拒绝
