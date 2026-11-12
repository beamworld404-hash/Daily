# Daily

共享开发仓库。

- 东京：写代码、推分支、开 PR
- 广州：只读拉取并审核
- 合并：由仓库所有者在网页上完成

## 关注清单日报网站

日报通过独立网站交付，用普通浏览器打开，不再用 Grok Bot Page，也不再在聊天里发报告。前端是 React 19 + Vite，数据来自 `web/content/reports/*.json`。代码与完整说明在 [`web/`](web/README.md)。版式为「期目录 → 章节文章」的阅读型网站，设计说明见 [`web/README.md`](web/README.md#设计说明)。

```bash
cd web/app
npm ci              # 安装依赖（需 Node 20.19+；没有 Node 可装到用户目录，见 web/README.md）
npm run dev         # 开发预览：http://127.0.0.1:5173/
npm run build       # 校验数据 + 构建到 web/app/dist/
npm run preview     # 预览构建结果：http://127.0.0.1:4173/
```

- 每日更新：自 2026-11-13 起由本机 cron 每天 08:40 自动出报（`deploy/fetch-report.sh`，公开接口抓取，DexScreener 替代 Defined，暂无 X 摘要），09:15 起自动发布，详见 [`deploy/README.md`](deploy/README.md)。人工出报仍可新增 `web/content/reports/YYYY-MM-DD.json` → `python3 web/check.py`，见 [`web/README.md`](web/README.md#每日更新流程)。
- 预览只监听 127.0.0.1；远程查看用 SSH 端口转发，不要无鉴权对公网开放。**不要占用 5002、8765**（服务器上已有其他预览进程）。
- 测试：`python3 -m unittest discover -s web/tests -v`；`cd web/app && npm test && npm run typecheck`
