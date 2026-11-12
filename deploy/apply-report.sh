#!/usr/bin/env bash
# 把一份已经生成好的日报 JSON 发布到两个站点：仓库分支 → GitHub Pages → 本机 nginx。
#
# 用法：bash deploy/apply-report.sh [--dry-run] [--date YYYY-MM-DD] FILE
#   FILE        当天数据，通常是 /home/ubuntu/briefs/incoming/YYYY-MM-DD.json
#   --date      期次日期；默认取文件名（必须是 YYYY-MM-DD.json）
#   --dry-run   只校验、构建、生成 Pages 本地提交并比较 nginx 现网内容；
#               不提交、不推送、不切换 nginx、不写状态文件（构建期间临时放入的数据文件会还原）
#
# 本脚本只搬运和发布数据，不生成、不修改任何数据内容。
#
# 步骤：
#   1. 校验：python3 web/check.py（新文件 + 仓库里已有各期一起校验），不通过就失败退出
#   2. 仓库检查：必须在 $DAILY_BRANCH、工作区干净、与 origin 不分叉
#   3. 放到 web/content/reports/<date>.json，构建（check + tsc + vite build）到新的发布目录
#   4. 提交并推送当前分支（内容没变则不提交）
#   5. deploy/publish-pages.sh --from-dist 推送 GitHub Pages（产物没变则不推）
#   6. nginx：软链 $DAILY_SITE/current 原子切换到新发布目录（内容没变则不切）
#
# 幂等：同一天同一份数据已经提交、已推 Pages、nginx 现网即是该构建时，直接退出（不构建、不提交、不推送）。
# 任一步失败都会把原因写进状态文件；重跑会从未完成的那一步继续（已完成的步骤都会被判定为"无变化"而跳过）。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib-daily.sh"

DRY_RUN=0
DATE=""
INPUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --date) DATE="${2:?--date 需要参数}"; shift ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    -*) echo "未知参数：$1" >&2; exit 2 ;;
    *) INPUT="$1" ;;
  esac
  shift
done
[[ -n "$INPUT" ]] || { echo "用法：apply-report.sh [--dry-run] [--date YYYY-MM-DD] FILE" >&2; exit 2; }
[[ -f "$INPUT" ]] || { echo "找不到数据文件：$INPUT" >&2; exit 2; }
INPUT="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
if [[ -z "$DATE" ]]; then
  DATE="$(basename "$INPUT" .json)"
fi
[[ "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "无法确定期次日期（文件名应为 YYYY-MM-DD.json，或用 --date）：$INPUT" >&2; exit 2; }

mkdir -p "$DAILY_LOGS" "$DAILY_SITE/releases"
LOG="$(log_file "$DATE")"
if [[ $DRY_RUN -eq 0 ]]; then
  exec > >(tee -a "$LOG") 2>&1
fi

TARGET_REL="web/content/reports/$DATE.json"
TARGET="$DAILY_REPO/$TARGET_REL"
SHA="$(sha256sum "$INPUT" | cut -d' ' -f1)"
COMMIT="" BRANCH_PUSHED="" PAGES="" PAGES_COMMIT="" NGINX_RELEASE=""
RESTORE=0 TARGET_EXISTED=0 STAGE="" WORK=""

say() { echo "[$(now_sh)] $*"; }
put_status() {
  [[ $DRY_RUN -eq 1 ]] && return 0
  status_write "$DATE" "state=$1" "reason=$2" "input=$INPUT" "input_sha256=$SHA" "commit=$COMMIT" \
    "branch_pushed=$BRANCH_PUSHED" "pages=$PAGES" "pages_commit=$PAGES_COMMIT" "nginx_release=$NGINX_RELEASE"
}
restore_target() {
  [[ $RESTORE -eq 1 ]] || return 0
  if [[ $TARGET_EXISTED -eq 1 ]]; then git -C "$DAILY_REPO" checkout -q -- "$TARGET_REL"; else rm -f "$TARGET"; fi
  RESTORE=0
  say "已还原 $TARGET_REL"
}
cleanup() {
  restore_target || true
  [[ -n "$STAGE" && -d "$STAGE" ]] && rm -rf "$STAGE"
  [[ -n "$WORK" && -d "$WORK" ]] && rm -rf "$WORK"
  return 0
}
fail() {
  trap - ERR
  say "失败：$1"
  cleanup
  put_status failed "$1"
  exit 1
}
trap 'fail "第 $LINENO 行命令失败：$BASH_COMMAND"' ERR
trap cleanup EXIT

say "==== apply-report $DATE $([[ $DRY_RUN -eq 1 ]] && echo '(dry-run)') ===="
say "输入：$INPUT（sha256 $SHA）"
[[ "$DATE" > "$(today_sh)" ]] && fail "期次日期 $DATE 晚于今天（上海时间 $(today_sh)），拒绝发布"

# 同一时间只允许一个发布在跑
exec 9>"$DAILY_SITE/.apply.lock"
flock -w 900 9 || fail "等待发布锁超时（另一个发布仍在运行）"
put_status pending "发布中"

# ---------- 1. 校验 ----------
WORK="$(mktemp -d)"
mkdir "$WORK/content"
find "$DAILY_REPO/web/content/reports" -maxdepth 1 -name '*.json' ! -name "$DATE.json" -exec cp {} "$WORK/content/" \;
cp "$INPUT" "$WORK/content/$DATE.json"
if ! out="$(python3 "$DAILY_REPO/web/check.py" --content "$WORK/content" 2>&1)"; then
  echo "$out"
  fail "数据校验未通过（web/check.py）：$(echo "$out" | sed -n '2,4p' | sed 's/^ *//' | paste -sd'；' -)"
fi
say "$out"

# ---------- 2. 仓库检查 ----------
cd "$DAILY_REPO"
cur="$(git rev-parse --abbrev-ref HEAD)"
[[ "$cur" == "$DAILY_BRANCH" ]] || fail "仓库当前分支是 $cur，不是 $DAILY_BRANCH"
[[ -z "$(git status --porcelain)" ]] || fail "仓库工作区有未提交改动，为避免把无关改动发布出去，已停止：$(git status --porcelain | head -3 | paste -sd' ' -)"
git fetch --quiet origin "$DAILY_BRANCH" || fail "git fetch origin $DAILY_BRANCH 失败"
UP="origin/$DAILY_BRANCH"
behind="$(git rev-list --count "HEAD..$UP")"
ahead="$(git rev-list --count "$UP..HEAD")"
if [[ $behind -gt 0 && $ahead -gt 0 ]]; then
  fail "本地与 $UP 已分叉（本地多 $ahead 个提交、远端多 $behind 个），需要人工处理"
fi
if [[ $behind -gt 0 ]]; then
  if [[ $DRY_RUN -eq 1 ]]; then
    say "注意：本地落后 $UP $behind 个提交（dry-run 不拉取，按本地内容构建）"
  else
    git merge --quiet --ff-only "$UP"
    say "已快进到 $UP（$(git rev-parse --short HEAD)）"
  fi
fi
if [[ $ahead -gt 0 ]]; then
  # 只允许"之前某次发布已提交但推送失败"留下的数据提交，其他未推送提交不代为推送
  other="$(git diff --name-only "$UP..HEAD" | grep -vE '^web/content/reports/[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$' || true)"
  [[ -z "$other" ]] || fail "本地有未推送的非数据提交（$(echo "$other" | head -3 | paste -sd' ' -)），不代为推送"
  say "本地有 $ahead 个未推送的数据提交，将一并推送"
fi
if [[ ! -L "$DAILY_SITE/current" ]]; then
  [[ $DRY_RUN -eq 1 ]] || fail "nginx 站点根 $DAILY_SITE/current 不存在或不是软链，请先运行 deploy/install.sh 迁移"
fi

# ---------- 3. 放入数据并计算内容指纹 ----------
git cat-file -e "HEAD:$TARGET_REL" 2>/dev/null && TARGET_EXISTED=1
if cmp -s "$INPUT" "$TARGET"; then
  SAME_DATA=1
  say "仓库里的 $TARGET_REL 与输入一致"
else
  SAME_DATA=0
  RESTORE=1
  cp "$INPUT" "$TARGET"
  say "已放入 $TARGET_REL（$([[ $TARGET_EXISTED -eq 1 ]] && echo 替换已有一期 || echo 新增一期)）"
fi
# 指纹 = 当前工作区 web/ 的 git tree hash：web/ 内容相同则构建产物相同
cp "$(git rev-parse --git-path index)" "$WORK/index"
GIT_INDEX_FILE="$WORK/index" git add -A web
FP="$(GIT_INDEX_FILE="$WORK/index" git write-tree --prefix=web/)"
say "内容指纹（web/ tree）：$FP"

src_of() { [[ -f "$1/.source" ]] && cat "$1/.source" || true; }
CUR_DIR=""
[[ -L "$DAILY_SITE/current" ]] && CUR_DIR="$(readlink -f "$DAILY_SITE/current")"
PAGES_FP="$(cat "$DAILY_SITE/pages.source" 2>/dev/null || true)"
remote_blob="$(git rev-parse -q --verify "$UP:$TARGET_REL" 2>/dev/null || true)"
COMMIT="$(git log -1 --format=%h -- "$TARGET_REL" 2>/dev/null || true)"

# 快速路径：数据已在远端分支、Pages 与 nginx 都已是这份内容
if [[ $SAME_DATA -eq 1 && $ahead -eq 0 && "$remote_blob" == "$(git hash-object "$INPUT")" \
      && "$PAGES_FP" == "$FP" && -n "$CUR_DIR" && "$(src_of "$CUR_DIR")" == "$FP" ]]; then
  BRANCH_PUSHED=yes PAGES=unchanged NGINX_RELEASE="$CUR_DIR"
  PAGES_COMMIT="$(cat "$DAILY_SITE/pages.commit" 2>/dev/null || true)"
  say "已是当前内容：仓库、GitHub Pages、nginx 均已发布这一期（提交 $COMMIT），不重复发布。"
  put_status done "已是当前内容，无需重复发布"
  exit 0
fi

# ---------- 4. 构建（输出到新目录，不碰现网目录） ----------
STAMP="$(date +%Y%m%d-%H%M%S)"
if [[ $DRY_RUN -eq 1 ]]; then STAGE="$WORK/dist"; else STAGE="$DAILY_SITE/releases/.staging-$STAMP"; fi
say "构建到 $STAGE"
(
  cd web/app &&
  npm run --silent check &&
  npx tsc -b &&
  npx vite build --logLevel warn --outDir "$STAGE" --emptyOutDir
) || fail "构建失败（npm run check / tsc / vite build）"
[[ -f "$STAGE/index.html" ]] || fail "构建失败：缺少 index.html"
echo "$FP" > "$STAGE/.source"
chmod -R a+rX "$STAGE"

# ---------- 5. 提交并推送当前分支 ----------
if [[ $DRY_RUN -eq 1 ]]; then
  restore_target
  if [[ $SAME_DATA -eq 1 ]]; then say "[dry-run] 数据无变化：不会提交"; else say "[dry-run] 将提交 $TARGET_REL"; fi
else
  if [[ $SAME_DATA -eq 0 ]]; then
    git add -- "$TARGET_REL"
    msg="data: 日报 $DATE"; [[ $TARGET_EXISTED -eq 1 ]] && msg="data: 更新日报 $DATE"
    git commit --quiet -m "$msg" -m "由 deploy/apply-report.sh 自动发布；来源 $INPUT（sha256 $SHA）。" -- "$TARGET_REL"
    RESTORE=0
    ahead=$((ahead + 1))
    say "已提交 $(git rev-parse --short HEAD)"
  fi
  COMMIT="$(git log -1 --format=%h -- "$TARGET_REL")"
  [[ "$(git rev-parse HEAD:web)" == "$FP" ]] || fail "提交后的 web/ 内容与构建时不一致"
  if [[ $ahead -gt 0 ]]; then
    git push --quiet origin "$DAILY_BRANCH" || { BRANCH_PUSHED=no; fail "推送 origin $DAILY_BRANCH 失败（已在本地提交 $COMMIT，重跑会继续推送）"; }
    say "已推送 origin $DAILY_BRANCH"
  else
    say "分支无新提交，无需推送"
  fi
  BRANCH_PUSHED=yes
fi

# ---------- 6. GitHub Pages ----------
if [[ "$PAGES_FP" == "$FP" ]]; then
  PAGES=unchanged
  PAGES_COMMIT="$(cat "$DAILY_SITE/pages.commit" 2>/dev/null || true)"
  say "GitHub Pages 已是这份内容，跳过"
else
  args=(--from-dist "$STAGE"); [[ $DRY_RUN -eq 1 ]] && args+=(--dry-run)
  pout="$(bash "$DAILY_REPO/deploy/publish-pages.sh" "${args[@]}" 2>&1)" || { echo "$pout"; PAGES=failed; fail "GitHub Pages 发布失败：$(echo "$pout" | tail -2 | paste -sd' ' -)"; }
  echo "$pout" | grep -v '^PAGES_RESULT=' | grep -vE '^(assets/|index\.html$|README\.md$|\.nojekyll$)' || true
  res="$(echo "$pout" | sed -n 's/^PAGES_RESULT=//p' | tail -1)"
  PAGES="${res%% *}"
  [[ "$res" == *" "* ]] && PAGES_COMMIT="${res#* }"
  [[ -n "$PAGES" ]] || fail "GitHub Pages 发布脚本没有给出结果"
  if [[ $DRY_RUN -eq 0 ]]; then
    [[ -z "$PAGES_COMMIT" ]] && PAGES_COMMIT="$(cat "$DAILY_SITE/pages.commit" 2>/dev/null || true)"
    echo "$FP" > "$DAILY_SITE/pages.source"
    [[ -n "$PAGES_COMMIT" ]] && echo "$PAGES_COMMIT" > "$DAILY_SITE/pages.commit"
  fi
  say "GitHub Pages：$PAGES ${PAGES_COMMIT}"
fi

# ---------- 7. nginx 原子切换 ----------
if [[ -n "$CUR_DIR" ]] && diff -rq -x .source "$STAGE" "$CUR_DIR" >/dev/null 2>&1; then
  NGINX_RELEASE="$CUR_DIR"
  if [[ $DRY_RUN -eq 0 ]]; then echo "$FP" > "$CUR_DIR/.source"; fi
  say "nginx 现网已是这份内容（$CUR_DIR），不切换"
elif [[ $DRY_RUN -eq 1 ]]; then
  say "[dry-run] nginx 现网与新构建不同，正式运行会切换到新目录"
else
  rev="$(git rev-parse --short HEAD)"
  REL="$DAILY_SITE/releases/$STAMP-$rev"
  mv "$STAGE" "$REL"; STAGE=""
  ln -sfn "$REL" "$DAILY_SITE/.current.tmp"
  mv -T "$DAILY_SITE/.current.tmp" "$DAILY_SITE/current"   # rename(2)：原子替换，不会出现空目录
  NGINX_RELEASE="$REL"
  say "nginx 站点根已切换到 $REL"
  code="$(curl -s -o "$WORK/live.html" -w '%{http_code}' http://127.0.0.1/ || true)"
  if [[ "$code" != 200 ]] || ! cmp -s "$WORK/live.html" "$REL/index.html"; then
    if [[ -n "$CUR_DIR" ]]; then
      ln -sfn "$CUR_DIR" "$DAILY_SITE/.current.tmp"; mv -T "$DAILY_SITE/.current.tmp" "$DAILY_SITE/current"
      NGINX_RELEASE="$CUR_DIR"
    fi
    fail "nginx 自检失败（HTTP $code 或首页与新构建不一致），已回滚到 $CUR_DIR"
  fi
  say "nginx 自检通过（http://127.0.0.1/ 200）"
  # 只保留最近 5 个发布目录（当前目录一定保留）
  ls -1d "$DAILY_SITE"/releases/2* 2>/dev/null | sort -r | tail -n +6 | while read -r old; do
    [[ "$old" == "$(readlink -f "$DAILY_SITE/current")" ]] || rm -rf "$old"
  done || true
fi

if [[ $DRY_RUN -eq 1 ]]; then
  say "[dry-run] 完成：校验通过、构建通过；未提交、未推送、未切换 nginx。"
else
  put_status done "已发布"
  say "完成：提交 $COMMIT，Pages $PAGES ${PAGES_COMMIT}，nginx $NGINX_RELEASE"
fi
