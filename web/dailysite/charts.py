"""内联 SVG / HTML 图表。纯服务端生成，悬停提示由 static/app.js 读取 data-tip 实现。

配色按实体固定（协议在数据里的顺序 = 色槽顺序），见 static/style.css 的 --series-*。
"""

from __future__ import annotations

import math

from .fmt import esc, mmdd, pct, usd


def nice_ceiling(v: float) -> float:
    if v <= 0:
        return 1
    mag = 10 ** math.floor(math.log10(v))
    for m in (1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if v <= m * mag:
            return m * mag
    return 10 * mag


def tick_usd(v: float) -> str:
    """坐标轴刻度用的短写：$250K、$1.5M。"""
    for div, suf in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
        if v >= div:
            s = f"{v / div:.2f}".rstrip("0").rstrip(".")
            return f"${s}{suf}"
    return f"${v:.0f}"


def _bar_path(x: float, y: float, w: float, h: float, r: float = 3) -> str:
    """顶部圆角、底部贴基线的柱。"""
    r = min(r, w / 2, h)
    if h <= 0:
        return ""
    return (
        f"M{x:.2f},{y + h:.2f}V{y + r:.2f}Q{x:.2f},{y:.2f} {x + r:.2f},{y:.2f}"
        f"H{x + w - r:.2f}Q{x + w:.2f},{y:.2f} {x + w:.2f},{y + r:.2f}V{y + h:.2f}Z"
    )


def revenue_chart(dates: list[str], protocols: list[dict]) -> str:
    W, H = 720, 280
    L, R, T, B = 56, 8, 12, 28
    pw, ph = W - L - R, H - T - B
    top = nice_ceiling(max(max(p["values"]) for p in protocols))
    ticks = [top * i / 4 for i in range(5)]
    n, k = len(dates), len(protocols)
    group = pw / n
    gap = 2
    bar_w = max(2.0, (group * 0.72 - gap * (k - 1)) / k)
    inner = bar_w * k + gap * (k - 1)

    def y(v: float) -> float:
        return T + ph - (v / top) * ph

    parts = [
        f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" '
        f'aria-label="近 {n} 个完整日收入柱状图，数值见下方表格">'
    ]
    for t in ticks:
        yy = y(t)
        cls = "axis" if t == 0 else "grid"
        parts.append(f'<line class="{cls}" x1="{L}" x2="{W - R}" y1="{yy:.2f}" y2="{yy:.2f}"/>')
        parts.append(f'<text class="tick" x="{L - 8}" y="{yy + 4:.2f}" text-anchor="end">{esc(tick_usd(t))}</text>')
    for i, d in enumerate(dates):
        gx = L + group * i + (group - inner) / 2
        for s, p in enumerate(protocols):
            v = p["values"][i]
            bx = gx + s * (bar_w + gap)
            parts.append(f'<path class="bar s{s + 1}" d="{_bar_path(bx, y(v), bar_w, y(0) - y(v))}"/>')
        if n <= 16 or i % 2 == (n - 1) % 2:
            parts.append(
                f'<text class="tick" x="{L + group * i + group / 2:.2f}" y="{H - 8}" '
                f'text-anchor="middle">{esc(mmdd(d))}</text>'
            )
        tip = "UTC " + d + "|" + "|".join(f'{p["name"]}：{usd(p["values"][i])}' for p in protocols)
        parts.append(
            f'<rect class="hit" x="{L + group * i:.2f}" y="{T}" width="{group:.2f}" height="{ph}" '
            f'data-tip="{esc(tip)}" tabindex="0"/>'
        )
    parts.append("</svg>")
    return "".join(parts)


def column_chart(points: list[tuple[str, float]], aria: str) -> str:
    """少量（≤10）单序列柱，末项强调，柱顶直接标数值。"""
    W, H = 360, 170
    L, R, T, B = 8, 8, 22, 26
    pw, ph = W - L - R, H - T - B
    top = nice_ceiling(max(v for _, v in points))
    n = len(points)
    group = pw / n
    bw = min(44.0, group * 0.6)
    parts = [f'<svg class="chart chart-sm" viewBox="0 0 {W} {H}" role="img" aria-label="{esc(aria)}">']
    base = T + ph
    parts.append(f'<line class="axis" x1="{L}" x2="{W - R}" y1="{base}" y2="{base}"/>')
    for i, (label, v) in enumerate(points):
        h = v / top * ph
        x = L + group * i + (group - bw) / 2
        cls = "bar s1" if i == n - 1 else "bar muted"
        parts.append(f'<path class="{cls}" d="{_bar_path(x, base - h, bw, h)}"/>')
        cx = L + group * i + group / 2
        vcls = "val strong" if i == n - 1 else "val"
        parts.append(f'<text class="{vcls}" x="{cx:.2f}" y="{base - h - 6:.2f}" text-anchor="middle">{esc(f"{v:g}")}</text>')
        parts.append(f'<text class="tick" x="{cx:.2f}" y="{H - 8}" text-anchor="middle">{esc(label)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def meter(label: str, ratio_pct: float, meta: str, slot: int = 1) -> str:
    width = min(100.0, max(0.0, ratio_pct))
    return (
        '<div class="meter">'
        f'<div class="meter-head"><span class="meter-label"><i class="swatch s{slot}"></i>{esc(label)}</span>'
        f'<span class="meter-val"><b>{pct(ratio_pct)}</b> · {esc(meta)}</span></div>'
        f'<div class="meter-track" role="meter" aria-valuemin="0" aria-valuemax="100" '
        f'aria-valuenow="{ratio_pct:.2f}" aria-label="{esc(label)} 占历史最高 {pct(ratio_pct)}">'
        f'<div class="meter-fill s{slot}" style="width:{width:.2f}%"></div></div></div>'
    )


def fng_scale(value: float, previous: float | None) -> str:
    """0–100 刻度条：实心点为最新，空心点为上一日。"""
    prev = ""
    if previous is not None:
        prev = f'<span class="fng-dot prev" style="left:{previous:.2f}%" title="上一日 {previous:g}"></span>'
    return (
        '<div class="fng-scale" aria-hidden="true">'
        '<div class="fng-track"></div>'
        f"{prev}"
        f'<span class="fng-dot now" style="left:{value:.2f}%"></span>'
        '<div class="fng-ends"><span>0 极度恐惧</span><span>50</span><span>100 极度贪婪</span></div>'
        "</div>"
    )
