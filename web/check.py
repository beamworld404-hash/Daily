#!/usr/bin/env python3
"""关注清单日报：校验 web/content/reports/*.json。

网站由 web/app（React + Vite）在构建时直接读取这些 JSON；
`npm run build` 会先运行本脚本，校验不通过就不构建。

用法（仓库根目录）：
  python3 web/check.py                    # 校验全部数据文件
  python3 web/check.py --content DIR      # 校验指定目录
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if sys.version_info < (3, 12):
    sys.exit("需要 Python 3.12 或更高版本")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from dailysite.validate import DATE_RE, validate_report  # noqa: E402

CONTENT = HERE / "content" / "reports"


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


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--content", type=Path, default=CONTENT, help="数据目录（默认 web/content/reports）")
    a = ap.parse_args()
    reports, errors = load_reports(a.content)
    if errors:
        print("数据校验失败：", *errors, sep="\n  ", file=sys.stderr)
        sys.exit(1)
    if not reports:
        print(f"数据校验失败：{a.content} 下没有任何 YYYY-MM-DD.json", file=sys.stderr)
        sys.exit(1)
    print(f"校验通过：{len(reports)} 期（{', '.join(r['date'] for r in reports)}）")


if __name__ == "__main__":
    main()
