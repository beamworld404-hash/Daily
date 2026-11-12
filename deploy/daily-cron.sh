#!/usr/bin/env bash
# 日报自动发布的定时入口（用户 crontab 每天 09:15–10:30 每 15 分钟调用一次，见 deploy/crontab.txt）。
#
# 用法：bash deploy/daily-cron.sh [--date YYYY-MM-DD] [--final]
#   --date   检查哪一期（默认今天，上海时间）
#   --final  最后一次检查（10:30 那一档）：仍没有数据就记为失败「今日数据未送达」
#            不带此参数时，当前时间 ≥ 10:30 也按最后一次处理
#
# 每次调用只检查一次就退出，不常驻、不循环等待：
#   - 状态已是 done 且 incoming 文件没变        → 直接退出
#   - incoming 有 <date>.json                    → 调 apply-report.sh 发布（幂等）
#   - incoming 没有，但仓库里已有这一期           → 调 apply-report.sh 确认已发布（幂等，通常秒退）
#   - 都没有：10:30 之前记 waiting；10:30 起记 failed「今日数据未送达」
# 本脚本不会生成、补写任何数据。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib-daily.sh"

DATE="" FINAL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE="${2:?--date 需要参数}"; shift ;;
    --final) FINAL=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done
DATE="${DATE:-$(today_sh)}"
if (( 10#$(date +%H%M) >= 1030 )); then FINAL=1; fi

mkdir -p "$DAILY_LOGS"
LOG="$(log_file "$DATE")"
say() { echo "[$(now_sh)] [cron] $*" | tee -a "$LOG"; }

# 上一档还在跑就跳过这一档
exec 8>"$DAILY_LOGS/.daily-cron.lock"
flock -n 8 || { say "上一次检查仍在运行，本次跳过"; exit 0; }

IN="$DAILY_INCOMING/$DATE.json"
REPO_FILE="$DAILY_REPO/web/content/reports/$DATE.json"
state="$(status_get "$DATE" state)"

if [[ -f "$IN" ]]; then
  sha="$(sha256sum "$IN" | cut -d' ' -f1)"
  if [[ "$state" == done && "$(status_get "$DATE" input_sha256)" == "$sha" ]]; then
    exit 0   # 今天这一期已发布，且数据没变
  fi
  say "发现 $IN，开始发布"
  exec bash "$DAILY_REPO/deploy/apply-report.sh" "$IN"
fi

if [[ -f "$REPO_FILE" ]]; then
  [[ "$state" == done ]] && exit 0
  say "incoming 没有 $DATE.json，但仓库里已有这一期，确认是否已发布"
  exec bash "$DAILY_REPO/deploy/apply-report.sh" "$REPO_FILE"
fi

if [[ $FINAL -eq 1 ]]; then
  reason="今日数据未送达：截至 $(date +%H:%M) $DAILY_INCOMING 下仍没有 $DATE.json，未发布"
  say "$reason"
  status_write "$DATE" state=failed "reason=$reason" "input=$IN"
  exit 1
fi
reason="等待数据：$DAILY_INCOMING 下还没有 $DATE.json（10:30 截止）"
say "$reason"
status_write "$DATE" state=waiting "reason=$reason" "input=$IN"
