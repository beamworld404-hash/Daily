# 部署：本机 nginx 静态站（IP 访问，仅 HTTP）

- 站点根目录：`web/app/dist`（Vite 构建产物，不入库）
- 仓库内配置：`deploy/nginx/daily.conf`
- 系统路径：`/etc/nginx/sites-available/daily`，软链到 `/etc/nginx/sites-enabled/daily`（移除了默认站点 `default`）
- 监听 `0.0.0.0:80` 与 `[::]:80`，`systemctl enable nginx` 开机自启
- 没有域名，所以不配 HTTPS / 证书

## 安装或更新

```bash
bash deploy/install.sh          # 用现有 dist 发布
bash deploy/install.sh --build  # 先 npm run build 再发布
```

脚本可重复执行：安装 nginx 与 acl，只给 `www-data` 在 `/home/ubuntu` 等上级目录加“进入”（x）权限（ACL），
安装配置，`nginx -t` 检查后重启，最后用 `curl` 自检。

只更新页面内容时，重新构建 dist 即可，不必重启 nginx（`index.html` 为 `no-cache`，`/assets/` 下的带哈希文件长期缓存）。

## 公网访问

外网能否访问 80 还取决于云厂商控制台的安全组（不在本机 iptables 里），需在控制台放行 TCP 80。
