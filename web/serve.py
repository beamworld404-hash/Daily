#!/usr/bin/env python3
"""本机预览服务器：只读地提供 web/dist/。

默认只监听 127.0.0.1（本机回环），外部无法访问；远程查看请用 SSH 端口转发。
如确需监听非回环地址，必须设置环境变量 DAILY_SITE_PASSWORD 启用 HTTP Basic 认证，
否则拒绝启动。不要把它当作常驻公网服务。

用法：
  python3 web/serve.py                 # http://127.0.0.1:8765/
  python3 web/serve.py --port 9000
  python3 web/serve.py --build         # 先重新生成再启动
"""

from __future__ import annotations

import argparse
import base64
import functools
import hmac
import ipaddress
import os
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_PORT = 8765


def is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class Handler(SimpleHTTPRequestHandler):
    password: str | None = None
    user = "beam"

    def end_headers(self) -> None:
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _authorized(self) -> bool:
        if self.password is None:
            return True
        h = self.headers.get("Authorization", "")
        if not h.startswith("Basic "):
            return False
        try:
            user, _, pw = base64.b64decode(h[6:]).decode("utf-8").partition(":")
        except Exception:
            return False
        ok_user = hmac.compare_digest(user.encode(), self.user.encode())
        ok_pw = hmac.compare_digest(pw.encode(), self.password.encode())
        return ok_user and ok_pw

    def _deny(self) -> None:
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="daily", charset="UTF-8"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._authorized():
            return self._deny()
        super().do_GET()

    def do_HEAD(self) -> None:
        if not self._authorized():
            return self._deny()
        super().do_HEAD()

    def list_directory(self, path):  # 不提供目录列表
        self.send_error(404)
        return None

    def log_message(self, fmt: str, *args) -> None:  # 不记录 Authorization 等头
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    ap.add_argument("--port", type=int, default=int(os.environ.get("DAILY_SITE_PORT", DEFAULT_PORT)),
                    help=f"端口（默认 {DEFAULT_PORT}，或环境变量 DAILY_SITE_PORT）")
    ap.add_argument("--dir", type=Path, default=HERE / "dist", help="站点目录（默认 web/dist）")
    ap.add_argument("--build", action="store_true", help="启动前先运行 build.py")
    a = ap.parse_args()

    if a.build:
        subprocess.run([sys.executable, str(HERE / "build.py"), "--out", str(a.dir)], check=True)
    if not (a.dir / "index.html").exists():
        sys.exit(f"{a.dir} 里没有 index.html，请先运行：python3 {HERE / 'build.py'}")

    password = os.environ.get("DAILY_SITE_PASSWORD") or None
    if not is_loopback(a.host) and not password:
        sys.exit("拒绝在非回环地址上无认证启动。请改用默认 127.0.0.1 + SSH 端口转发，"
                 "或设置环境变量 DAILY_SITE_PASSWORD 启用 Basic 认证。")

    Handler.password = password
    handler = functools.partial(Handler, directory=str(a.dir))
    httpd = ThreadingHTTPServer((a.host, a.port), handler)
    shown = f"[{a.host}]" if ":" in a.host else a.host
    print(f"关注清单日报预览：http://{shown}:{a.port}/   （Ctrl+C 停止）")
    if password:
        print("已启用 Basic 认证，用户名 beam，密码取自 DAILY_SITE_PASSWORD。")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
