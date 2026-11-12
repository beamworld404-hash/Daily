"""数据校验测试。运行：python3 -m unittest discover -s web/tests -v（在仓库根目录）

前端格式化（usd 等）的测试在 web/app/tests/，用 `npm test` 运行。
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEB))

from dailysite.validate import validate_report  # noqa: E402

SAMPLE = WEB / "content" / "reports" / "2026-11-12.json"


def sample() -> dict:
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def run_check(content: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(WEB / "check.py"), "--content", str(content)], capture_output=True, text=True
    )


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


class CheckCliTests(unittest.TestCase):
    def test_repo_content_passes(self):
        r = run_check(WEB / "content" / "reports")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("2026-11-12", r.stdout)

    def test_invalid_data_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            content = Path(tmp)
            (content / "2026-11-13.json").write_text(json.dumps(sample()), encoding="utf-8")  # 日期与文件名不符
            r = run_check(content)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("与文件名日期", r.stderr)

    def test_empty_dir_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertNotEqual(run_check(Path(tmp)).returncode, 0)


if __name__ == "__main__":
    unittest.main()
