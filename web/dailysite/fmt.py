"""数字与文本格式化。与旧版日报的 formatUsd 口径保持一致。"""

from __future__ import annotations

import html
import math
import re
from decimal import ROUND_HALF_UP, Decimal

_EPS = 2.220446049250313e-16  # JS Number.EPSILON


def _to_fixed2(x: float) -> str:
    """等价于 JS Number.prototype.toFixed(2)（按精确二进制值四舍五入，平局取大）。"""
    return str(Decimal(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _js_round2(x: float) -> str:
    """等价于 JS (Math.round((x + EPSILON) * 100) / 100).toFixed(2)。"""
    return _to_fixed2(math.floor((x + _EPS) * 100 + 0.5) / 100)


def usd(value: float) -> str:
    """美元简写：$ + 两位小数 + K/M/B。"""
    sign = "-" if value < 0 else ""
    n = abs(value)
    if n < 1_000:
        return f"{sign}${_to_fixed2(n)}"
    if n < 1_000_000:
        return f"{sign}${_js_round2(n / 1_000)}K"
    if n < 1_000_000_000:
        return f"{sign}${_js_round2(n / 1_000_000)}M"
    return f"{sign}${_js_round2(n / 1_000_000_000)}B"


def num(value: int | float) -> str:
    """千分位整数。"""
    return f"{value:,.0f}" if isinstance(value, float) else f"{value:,}"


def pct(value: float) -> str:
    return f"{value:.2f}%"


def change_pct(latest: float, previous: float) -> float:
    return (latest / previous - 1) * 100


def arrow(delta: float) -> str:
    if delta > 0:
        return "↑"
    if delta < 0:
        return "↓"
    return "→"


def mmdd(date: str) -> str:
    """'2026-11-10' -> '11-10'。"""
    return date[5:] if len(date) == 10 else date


_LINK = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)")


def esc(text: object) -> str:
    return html.escape(str(text), quote=True)


def ext_link(url: str, label: str, cls: str = "") -> str:
    c = f' class="{esc(cls)}"' if cls else ""
    return (
        f'<a{c} href="{esc(url)}" target="_blank" rel="noopener noreferrer">'
        f"{esc(label)}</a>"
    )


def rich(text: str) -> str:
    """转义文本，只把 [文字](https://…) 渲染为外链。不支持其他标记。"""
    out, last = [], 0
    for m in _LINK.finditer(text):
        out.append(esc(text[last : m.start()]))
        out.append(ext_link(m.group(2), m.group(1)))
        last = m.end()
    out.append(esc(text[last:]))
    return "".join(out)
