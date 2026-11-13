#!/usr/bin/env bash
# 在本机（Ubuntu）安装 nginx 并以 http://<本机IP>/ 发布日报静态站。
# 用法：bash deploy/install.sh [--build]
#   --build  先在 web/app 下执行 npm run build 重新生成 web/app/dist
# 可重复执行（幂等）。需要 sudo。
#
# 站点根：/home/ubuntu/daily-site/current（软链）→ /home/ubuntu/daily-site/releases/<构建>。
# 首次运行时若 current 不存在，用 web/app/dist 的副本建立第一个发布目录；之后由 deploy/apply-report.sh 原子切换。
# nginx 已在运行时只做 reload（平滑加载配置），不重启。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO/web/app/dist"
SITE="${DAILY_SITE:-/home/ubuntu/daily-site}"
CONF_SRC="$REPO/deploy/nginx/daily.conf"
CONF_DST=/etc/nginx/sites-available/daily

if [[ "${1:-}" == "--build" ]]; then
  (cd "$REPO/web/app" && npm run build)
fi

# 1. 发布目录与 current 软链
mkdir -p "$SITE/releases"
if [[ ! -L "$SITE/current" ]]; then
  [[ -f "$DIST/index.html" ]] || { echo "缺少 $DIST/index.html，请先构建（--build）" >&2; exit 1; }
  rel="$SITE/releases/$(date +%Y%m%d-%H%M%S)-initial"
  cp -R "$DIST" "$rel"
  chmod -R a+rX "$rel"
  ln -sfn "$rel" "$SITE/.current.tmp"
  mv -T "$SITE/.current.tmp" "$SITE/current"
  echo "已建立 $SITE/current -> $rel"
fi

# 2. nginx（未安装时才安装）
if ! command -v nginx >/dev/null; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx acl
fi

# nginx 工作进程（www-data）需能穿过 /home/<user>；只授予该用户“进入”权限，不开放列目录/读文件
d="$SITE/current"
while [[ "$d" != "/" ]]; do
  d="$(dirname "$d")"
  if [[ "$d" == /home/* ]] && ! sudo -u www-data test -x "$d"; then
    sudo setfacl -m u:www-data:x "$d"
  fi
done

# 配置里的 root 写死为 /home/ubuntu/daily-site/current；站点目录不在该位置时替换
sed "s#root /home/ubuntu/daily-site/current;#root $SITE/current;#" "$CONF_SRC" | sudo tee "$CONF_DST" >/dev/null
sudo ln -sfn "$CONF_DST" /etc/nginx/sites-enabled/daily
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl enable nginx
if systemctl is-active --quiet nginx; then
  sudo systemctl reload nginx
else
  sudo systemctl start nginx
fi

curl -fsSI http://127.0.0.1/ | head -1
