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

**本机只发布、不出报。** 日报数据仍由 Daily bot 每天 09:00（上海时间）采集生成（其中关注时间线需要 beam 的 X 连接器，
本机没有）。本机流程只负责「当天 JSON 送到之后」到「两个站点都更新」这一段，不生成、不估算、不补写任何数据；
当天数据没送到就不发布。

### 数据入口

- 目录：`/home/ubuntu/briefs/incoming/`（仓库外，权限 755，只有 ubuntu 可写）
- 文件：`YYYY-MM-DD.json`（上海时间当天的日期），内容必须符合 `schema_version` 1，`date` 字段与文件名一致
- Daily bot / 协调者在 09:00 出报后把文件放到这里即可（建议先写临时文件再 `mv` 成正式文件名，避免读到半个文件）

### 定时（用户 crontab，Asia/Shanghai）

见 `deploy/crontab.txt`，用 `bash deploy/install-cron.sh` 安装（可重复执行，只替换自己那一段）：

| 时间 | 命令 |
|---|---|
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
# 数据晚到（例如 10:30 之后才放进 incoming）：直接发布
bash deploy/apply-report.sh /home/ubuntu/briefs/incoming/2026-11-13.json
# 或按 cron 的逻辑检查某一天
bash deploy/daily-cron.sh --date 2026-11-13
# 只演练：校验 + 构建 + Pages 本地提交 + 与 nginx 现网比较，不提交、不推送、不切换、不写状态
bash deploy/apply-report.sh --dry-run /path/to/2026-11-13.json
```

### 失败时会怎样

- 数据没送到：10:30 记 `failed`「今日数据未送达」，两个站点保持前一期，不会发布空的或编造的一期
- 校验 / 构建失败：不提交、不推送、不切换；临时放入仓库的数据文件会还原
- 分支推送失败：本地已有数据提交，状态 `failed`；重跑会继续推送（只会代推纯数据提交）
- Pages 推送失败：分支已推送，状态 `failed`、`pages=failed`；重跑会补推 Pages 并完成 nginx
- nginx 自检失败：切回原发布目录，状态 `failed`
- 期次日期晚于今天、仓库不在 `feat/daily-report-incr-design`、工作区有未提交改动、与远端分叉：直接拒绝
