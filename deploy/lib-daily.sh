# 日报自动发布：apply-report.sh 与 daily-cron.sh 共用的路径与状态文件函数（被 source，不单独执行）。
# 所有路径都可以用同名环境变量覆盖（测试用）；默认值即生产路径。

export TZ=Asia/Shanghai
export PATH="$HOME/.local/node/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

DAILY_REPO="${DAILY_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DAILY_BRANCH="${DAILY_BRANCH:-feat/daily-report-incr-design}"
DAILY_INCOMING="${DAILY_INCOMING:-/home/ubuntu/briefs/incoming}"
DAILY_LOGS="${DAILY_LOGS:-/home/ubuntu/briefs/daily-report-incr-design/logs}"
# nginx 站点根是 $DAILY_SITE/current（软链），指向 $DAILY_SITE/releases/ 下的某次构建
DAILY_SITE="${DAILY_SITE:-/home/ubuntu/daily-site}"

now_sh() { date '+%Y-%m-%d %H:%M:%S %Z'; }
today_sh() { date '+%Y-%m-%d'; }

status_file() { echo "$DAILY_LOGS/daily-$1.status"; }
log_file() { echo "$DAILY_LOGS/daily-$1.log"; }

# 读状态文件里的某个字段：status_get <date> <key>
status_get() {
  local f; f="$(status_file "$1")"
  [[ -f "$f" ]] || return 0
  sed -n "s/^$2=//p" "$f" | tail -1
}

# 原子写状态文件：status_write <date> key=value ...
# 固定字段 date / updated_at / log 自动补上；未给出的字段写空。
status_write() {
  local d="$1"; shift
  mkdir -p "$DAILY_LOGS"
  local f tmp; f="$(status_file "$d")"; tmp="$f.tmp.$$"
  declare -A kv=()
  local a
  for a in "$@"; do kv["${a%%=*}"]="${a#*=}"; done
  {
    echo "date=$d"
    echo "state=${kv[state]:-}"
    echo "reason=${kv[reason]:-}"
    echo "updated_at=$(now_sh)"
    echo "input=${kv[input]:-}"
    echo "input_sha256=${kv[input_sha256]:-}"
    echo "commit=${kv[commit]:-}"
    echo "branch_pushed=${kv[branch_pushed]:-}"
    echo "pages=${kv[pages]:-}"
    echo "pages_commit=${kv[pages_commit]:-}"
    echo "nginx_release=${kv[nginx_release]:-}"
    echo "log=$(log_file "$d")"
  } > "$tmp"
  mv -f "$tmp" "$f"
}
