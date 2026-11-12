#!/usr/bin/env bash
# 构建日报静态站，并把构建产物（仅产物）发布到公开仓库的 main 分支根目录（GitHub Pages 用户站点）。
# 用法：bash deploy/publish-pages.sh [--dry-run] [--from-dist DIR]
#   --dry-run         只构建并在临时目录生成提交，不推送
#   --from-dist DIR   不重新构建，直接发布 DIR 里已构建好的产物（apply-report.sh 用，保证与 nginx 同一份构建）
# 末尾输出一行机器可读结果：PAGES_RESULT=pushed <hash> | unchanged | dry-run <hash>
# 可重复执行：每次用新构建的产物整体替换公开仓库内容；内容无变化时不提交。
#
# 说明：
# - 构建输出到临时目录，不动 web/app/dist（本机 nginx 正在用它）。
# - 推送只用 SSH 别名 github.com-pages（该公开仓库专用的部署密钥），可用 PAGES_REMOTE 覆盖。
# - 公开仓库只包含产物、.nojekyll 和一份简短 README，不带本仓库的源码和 git 历史。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$REPO/web/app"
REMOTE="${PAGES_REMOTE:-git@github.com-pages:beamworld404-hash/beamworld404-hash.github.io.git}"
BRANCH=main
DRY_RUN=0
FROM_DIST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --from-dist) FROM_DIST="${2:?--from-dist 需要目录参数}"; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/dist"
SITE="$WORK/site"

SRC_REV="$(git -C "$REPO" rev-parse --short HEAD)"
if [[ -n "$(git -C "$REPO" status --porcelain -- web)" ]]; then
  echo "警告：web/ 下有未提交改动，产物将不完全对应 $SRC_REV" >&2
  SRC_REV="$SRC_REV-dirty"
fi

# 1. 构建（与 npm run build 相同的检查 + 类型检查，输出到临时目录）；--from-dist 时直接用现成产物
if [[ -n "$FROM_DIST" ]]; then
  OUT="$(cd "$FROM_DIST" && pwd)"
else
  (
    cd "$APP"
    npm run check
    npx tsc -b
    npx vite build --outDir "$OUT" --emptyOutDir
  )
fi
[[ -f "$OUT/index.html" ]] || { echo "构建失败：缺少 index.html" >&2; exit 1; }

# 2. 取公开仓库（空仓库时新建）
if git clone --quiet --depth 1 --branch "$BRANCH" "$REMOTE" "$SITE" 2>/dev/null; then
  :
else
  rm -rf "$SITE"
  git init --quiet -b "$BRANCH" "$SITE"
  git -C "$SITE" remote add origin "$REMOTE"
fi

# 3. 用新产物整体替换内容
find "$SITE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$OUT"/. "$SITE"/
rm -f "$SITE/.source"   # apply-report.sh 写在 nginx 发布目录里的来源标记，不发布
touch "$SITE/.nojekyll"
cat > "$SITE/README.md" <<'EOF'
# 关注清单日报

这是「关注清单日报」网站的静态发布仓库，只包含构建好的页面文件，由 GitHub Pages 从 `main` 分支根目录发布。

源码在另一个私有仓库中维护，请不要直接修改本仓库的文件——每次发布都会整体覆盖。
EOF

# 4. 提交并推送
cd "$SITE"
git add -A
if git diff --cached --quiet && git rev-parse --verify -q HEAD >/dev/null; then
  echo "产物无变化，无需发布。"
  echo "PAGES_RESULT=unchanged"
  exit 0
fi
# 公开仓库用 noreply 身份提交，避免暴露个人邮箱
git -c user.name="${PAGES_AUTHOR_NAME:-beamworld404-hash}" \
    -c user.email="${PAGES_AUTHOR_EMAIL:-beamworld404-hash@users.noreply.github.com}" \
    commit --quiet -m "publish: 日报静态站（源码 $SRC_REV）"
echo "公开仓库提交：$(git rev-parse --short HEAD)"
git ls-files

if [[ $DRY_RUN -eq 1 ]]; then
  echo "--dry-run：未推送。"
  echo "PAGES_RESULT=dry-run $(git rev-parse --short HEAD)"
  exit 0
fi
git push --quiet origin "$BRANCH"
echo "已推送到 $REMOTE ($BRANCH)"
echo "PAGES_RESULT=pushed $(git rev-parse --short HEAD)"
