#!/usr/bin/env bash
# 在本机（Ubuntu）安装 nginx 并以 http://<本机IP>/ 发布日报静态站。
# 用法：bash deploy/install.sh [--build]
#   --build  先在 web/app 下执行 npm run build 重新生成 dist
# 可重复执行（幂等）。需要 sudo。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO/web/app/dist"
CONF_SRC="$REPO/deploy/nginx/daily.conf"
CONF_DST=/etc/nginx/sites-available/daily

if [[ "${1:-}" == "--build" ]]; then
  (cd "$REPO/web/app" && npm run build)
fi
[[ -f "$DIST/index.html" ]] || { echo "缺少 $DIST/index.html，请先构建（--build）" >&2; exit 1; }

sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx acl

# nginx 工作进程（www-data）需能穿过 /home/<user>；只授予该用户“进入”权限，不开放列目录/读文件
d="$DIST"
while [[ "$d" != "/" ]]; do
  d="$(dirname "$d")"
  if [[ "$d" == /home/* ]] && ! sudo -u www-data test -x "$d"; then
    sudo setfacl -m u:www-data:x "$d"
  fi
done

# 配置里的 root 写死为 /home/ubuntu/Daily/web/app/dist；仓库不在该位置时替换
sed "s#root /home/ubuntu/Daily/web/app/dist;#root $DIST;#" "$CONF_SRC" | sudo tee "$CONF_DST" >/dev/null
sudo ln -sfn "$CONF_DST" /etc/nginx/sites-enabled/daily
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

curl -fsSI http://127.0.0.1/ | head -1
