#!/usr/bin/env bash
# 日报出报入口：本机抓取公开数据 → 生成当天 JSON → 校验 → 投放到 incoming（用户 crontab 每天 08:40 调用）。
#
# 用法：bash deploy/fetch-report.sh [--date YYYY-MM-DD] [--dry-run] [--force] [--out DIR]
#   默认      今天（上海时间）。校验通过后原子投放到 /home/ubuntu/briefs/incoming/YYYY-MM-DD.json，
#             09:15 起的 deploy/daily-cron.sh 负责发布
#   --dry-run 只写临时目录（默认 /tmp/daily-fetch-dryrun-*，或 --out 指定）并校验，不进 incoming、不发布、
#             不写状态文件。--date 只在 --dry-run 时可以不是今天
#   --force   incoming 或仓库里已有当天文件时仍重抓；抓到的内容与 incoming 里的相同则不改写
#
# 核心逻辑在 deploy/fetch_report.py（Python 3.12 标准库，不需要任何密钥）。
# 失败（所有数值源都失败、校验不通过）时不生成文件，退出码非 0，原因写进日志与状态文件。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib-daily.sh"

DATE="" DRY=0
args=("$@")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE="${2:?--date 需要参数}"; shift ;;
    --dry-run) DRY=1 ;;
    --force) ;;
    --out) shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done
DATE="${DATE:-$(today_sh)}"

mkdir -p "$DAILY_LOGS"
LOG="$DAILY_LOGS/fetch-$DATE.log"
STATUS="$DAILY_LOGS/fetch-$DATE.status"
[[ $DRY -eq 1 ]] && LOG="$DAILY_LOGS/fetch-dryrun.log"

exec 7>"$DAILY_LOGS/.fetch-report.lock"
flock -n 7 || { echo "[$(now_sh)] [fetch] 上一次出报仍在运行，本次跳过" | tee -a "$LOG"; exit 0; }

echo "[$(now_sh)] [fetch] 开始：deploy/fetch_report.py ${args[*]:-}" >> "$LOG"
set +e
DAILY_INCOMING="$DAILY_INCOMING" DAILY_LOGS="$DAILY_LOGS" \
  python3 "$DAILY_REPO/deploy/fetch_report.py" "${args[@]}" 2>&1 | tee -a "$LOG"
rc=${PIPESTATUS[0]}
set -e
echo "[$(now_sh)] [fetch] 结束，退出码 $rc" >> "$LOG"

# 参数错误（退出码 2）不写状态文件
if [[ $DRY -eq 0 && $rc -ne 2 ]]; then
  IN="$DAILY_INCOMING/$DATE.json"
  if [[ $rc -eq 0 && -f "$IN" ]]; then state=done; reason="已投放 $IN"
  elif [[ $rc -eq 0 ]]; then state=skipped; reason="未投放（见日志）"
  else state=failed; reason="出报失败，未生成文件（退出码 $rc，见日志）"; fi
  tmp="$STATUS.tmp.$$"
  {
    echo "date=$DATE"
    echo "state=$state"
    echo "reason=$reason"
    echo "updated_at=$(now_sh)"
    echo "input=$IN"
    [[ -f "$IN" ]] && echo "input_sha256=$(sha256sum "$IN" | cut -d' ' -f1)"
    echo "log=$LOG"
  } > "$tmp"
  mv -f "$tmp" "$STATUS"
fi
exit "$rc"
