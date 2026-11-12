# Daily

共享开发仓库。

- 东京：写代码、推分支、开 PR
- 广州：只读拉取并审核
- 合并：由仓库所有者在网页上完成

## 关注清单日报网站

日报现在通过独立静态网站交付，用普通浏览器打开，不再用 Grok Bot Page，也不再在聊天里发报告。代码与说明在 [`web/`](web/README.md)。

```bash
python3 web/serve.py --build    # 生成并启动本机预览（需 Python 3.12+，无其他依赖）
# 浏览器打开 http://127.0.0.1:8765/
```

- 每日更新：新增 `web/content/reports/YYYY-MM-DD.json` → `python3 web/build.py --check` → `python3 web/build.py`，详见 [`web/README.md`](web/README.md#每日更新流程)。
- 预览服务只监听 127.0.0.1；远程查看用 SSH 端口转发，不要无鉴权对公网开放。
- 测试：`python3 -m unittest discover -s web/tests -v`
