#!/usr/bin/env python3
"""关注清单日报：校验数据并生成静态站。

用法：
  python3 web/build.py            # 校验 + 生成到 web/dist/
  python3 web/build.py --check    # 只校验，不生成
  python3 web/build.py --out DIR  # 生成到指定目录
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

if sys.version_info < (3, 12):
    sys.exit("需要 Python 3.12 或更高版本")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from dailysite.render import index_page, report_page  # noqa: E402
from dailysite.validate import DATE_RE, validate_report  # noqa: E402

CONTENT = HERE / "content" / "reports"
STATIC = HERE / "static"
BJT = dt.timezone(dt.timedelta(hours=8))


def load_reports(content: Path) -> tuple[list[dict], list[str]]:
    reports, errors = [], []
    for f in sorted(content.glob("*.json")):
        stem = f.stem
        if not DATE_RE.match(stem):
            errors.append(f"{f.name}: 文件名应为 YYYY-MM-DD.json")
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{f.name}: JSON 解析失败：第 {e.lineno} 行第 {e.colno} 列 {e.msg}")
            continue
        errs = validate_report(data, stem)
        errors.extend(f"{f.name} {e}" for e in errs)
        if not errs:
            reports.append(data)
    reports.sort(key=lambda r: r["date"], reverse=True)
    return reports, errors


def build(out: Path, content: Path = CONTENT) -> list[dict]:
    reports, errors = load_reports(content)
    if errors:
        raise SystemExit("数据校验失败：\n  " + "\n  ".join(errors))
    generated = dt.datetime.now(BJT).strftime("%Y-%m-%d %H:%M（北京时间）")
    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    for f in STATIC.iterdir():
        if f.is_file():
            shutil.copy2(f, out / "assets" / f.name)
    # reports 倒序：i-1 是更新的一期，i+1 是更早的一期
    for i, r in enumerate(reports):
        newer = reports[i - 1]["date"] if i > 0 else None
        older = reports[i + 1]["date"] if i + 1 < len(reports) else None
        d = out / "reports" / r["date"]
        d.mkdir(parents=True)
        (d / "index.html").write_text(report_page(r, older, newer, generated), encoding="utf-8")
    (out / "index.html").write_text(index_page(reports, generated), encoding="utf-8")
    if reports:
        latest = reports[0]["date"]
        (out / "latest.html").write_text(
            f'<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
            f'<meta http-equiv="refresh" content="0; url=reports/{latest}/index.html">'
            f'<a href="reports/{latest}/index.html">最新一期：{latest}</a>\n',
            encoding="utf-8",
        )
    return reports


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="只校验数据，不生成")
    ap.add_argument("--out", type=Path, default=HERE / "dist", help="输出目录（默认 web/dist）")
    ap.add_argument("--content", type=Path, default=CONTENT, help="数据目录（默认 web/content/reports）")
    a = ap.parse_args()
    if a.check:
        reports, errors = load_reports(a.content)
        if errors:
            print("数据校验失败：", *errors, sep="\n  ", file=sys.stderr)
            sys.exit(1)
        print(f"校验通过：{len(reports)} 期（{', '.join(r['date'] for r in reports)}）")
        return
    reports = build(a.out, a.content)
    print(f"已生成 {len(reports)} 期 → {a.out}")


if __name__ == "__main__":
    main()
