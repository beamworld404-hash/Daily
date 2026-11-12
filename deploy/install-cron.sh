#!/usr/bin/env bash
# 安装/更新日报自动发布的用户 crontab，并建立入口目录。可重复执行：
# 只替换 crontab 里 ">>> daily-report auto publish" 到 "<<<" 之间的段落，其余条目保持不变。
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p /home/ubuntu/briefs/incoming /home/ubuntu/briefs/daily-report-incr-design/logs
chmod 755 /home/ubuntu/briefs/incoming          # 仅 ubuntu 可写
{
  crontab -l 2>/dev/null | sed '/^# >>> daily-report auto publish/,/^# <<< daily-report auto publish/d' || true
  cat "$REPO/deploy/crontab.txt"
} | crontab -
crontab -l
