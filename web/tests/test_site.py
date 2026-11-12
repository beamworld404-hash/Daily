"""运行：python3 -m unittest discover -s web/tests -v（在仓库根目录）"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEB))

import build  # noqa: E402
from dailysite import fmt  # noqa: E402
from dailysite.render import report_page  # noqa: E402
from dailysite.validate import validate_report  # noqa: E402
import serve  # noqa: E402

SAMPLE = WEB / "content" / "reports" / "2026-11-12.json"


def sample() -> dict:
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


class FormatTests(unittest.TestCase):
    def test_usd_matches_legacy_format(self):
        # 与旧版日报 formatUsd 的输出逐一对照
        cases = {
            300012: "$300.01K", 288990.01: "$288.99K", 85167.01: "$85.17K",
            172487: "$172.49K", 179035: "$179.04K", 1844534: "$1.84M",
            5737132: "$5.74M", 1050352557.4107416: "$1.05B", 1181347.8717953796: "$1.18M",
            1000: "$1.00K", 999.5: "$999.50", 0: "$0.00", -2500: "-$2.50K",
        }
        for v, want in cases.items():
            self.assertEqual(fmt.usd(v), want, v)

    def test_change_and_share_match_legacy_report(self):
        self.assertEqual(fmt.pct(fmt.change_pct(300012, 288990.01)), "3.81%")
        self.assertEqual(fmt.pct(abs(fmt.change_pct(172487, 179035))), "3.66%")
        self.assertEqual(fmt.pct(300012 / 1844534 * 100), "16.26%")
        self.assertEqual(fmt.pct(172487 / 5737132 * 100), "3.01%")

    def test_rich_escapes_and_only_links_http(self):
        out = fmt.rich('<script>x</script> [ok](https://a.example/) [bad](javascript:alert(1))')
        self.assertNotIn("<script>", out)
        self.assertIn('href="https://a.example/"', out)
        self.assertNotIn('href="javascript', out)


class ValidateTests(unittest.TestCase):
    def test_sample_is_valid(self):
        self.assertEqual(validate_report(sample(), "2026-11-12"), [])

    def test_catches_common_mistakes(self):
        d = sample()
        d["date"] = "2026/11/12"
        d["revenue"]["protocols"][0]["values"].pop()
        d["defined"]["tokens"][0]["url"] = "javascript:alert(1)"
        d["methods"]["checklist"][0]["status"] = "done"
        d["x_digest"]["accounts"][0]["handle"] = "@wublockchain12"
        errs = "\n".join(validate_report(d, "2026-11-12"))
        for frag in ("$.date", "values", "tokens[0].url", "checklist[0].status", "handle"):
            self.assertIn(frag, errs)

    def test_optional_modules_can_be_absent(self):
        d = sample()
        for k in ("fng", "revenue", "tehc", "defined", "reddit", "github", "x_digest", "notices"):
            d.pop(k)
        self.assertEqual(validate_report(d, "2026-11-12"), [])
        html = report_page(d, None, None, "test")
        self.assertIn("取数与来源", html)
        self.assertNotIn('id="revenue"', html)


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.hrefs = [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "a" and "href" in a:
            self.hrefs.append(a["href"])


class BuildTests(unittest.TestCase):
    def test_build_outputs_and_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "dist"
            build.build(out)
            page = out / "reports" / "2026-11-12" / "index.html"
            for f in (out / "index.html", out / "latest.html", page, out / "assets" / "style.css", out / "assets" / "app.js"):
                self.assertTrue(f.exists(), f)
            html = page.read_text(encoding="utf-8")
            p = _Parser()
            p.feed(html)
            self.assertEqual(len(p.ids), len(set(p.ids)), "重复的 id")
            for h in p.hrefs:
                if h.startswith("#"):
                    self.assertIn(h[1:], p.ids, f"页内锚点不存在：{h}")
                elif not h.startswith(("http://", "https://")):
                    self.assertTrue((page.parent / h).resolve().exists(), f"站内链接失效：{h}")
            self.assertIn('content="noindex', html)
            # 看板数字与原稿一致
            for s in ("$300.01K", "$172.49K", "16.26%", "3.01%", "↑ 3.81%", "↓ 3.66%", "较上一日 29 降 1 点", "较 11-09 的 36 升 1 分"):
                self.assertIn(s, html)

    def test_prev_next_navigation(self):
        with tempfile.TemporaryDirectory() as tmp:
            content = Path(tmp) / "c"
            content.mkdir()
            for day in ("2026-11-10", "2026-11-11", "2026-11-12"):
                d = sample()
                d["date"] = day
                (content / f"{day}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
            out = Path(tmp) / "dist"
            build.build(out, content)
            mid = (out / "reports" / "2026-11-11" / "index.html").read_text(encoding="utf-8")
            self.assertIn('reports/2026-11-10/index.html" rel="prev"', mid)
            self.assertIn('reports/2026-11-12/index.html" rel="next"', mid)
            self.assertIn("reports/2026-11-12/index.html", (out / "latest.html").read_text(encoding="utf-8"))

    def test_invalid_data_fails_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            content = Path(tmp) / "c"
            content.mkdir()
            (content / "2026-11-13.json").write_text(json.dumps(sample()), encoding="utf-8")  # 日期与文件名不符
            r = subprocess.run([sys.executable, str(WEB / "build.py"), "--check", "--content", str(content)],
                               capture_output=True, text=True)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("与文件名日期", r.stderr)


class ServeTests(unittest.TestCase):
    def test_loopback_detection(self):
        for h in ("127.0.0.1", "localhost", "::1"):
            self.assertTrue(serve.is_loopback(h), h)
        for h in ("0.0.0.0", "::", "10.0.0.5", "example.com"):
            self.assertFalse(serve.is_loopback(h), h)

    def test_refuses_public_bind_without_password(self):
        env = {"PATH": "/usr/bin:/bin"}
        r = subprocess.run([sys.executable, str(WEB / "serve.py"), "--host", "0.0.0.0", "--port", "0"],
                           capture_output=True, text=True, env=env, timeout=20)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("拒绝", r.stderr)


if __name__ == "__main__":
    unittest.main()
