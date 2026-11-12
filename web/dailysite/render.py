"""把一份日报数据渲染成 HTML。所有文本都经过转义；只有 [文字](https://…) 会变成链接。"""

from __future__ import annotations

import datetime as dt
from typing import Any

from . import charts
from .fmt import arrow, change_pct, esc, ext_link, mmdd, num, pct, rich, usd

WEEKDAYS = "一二三四五六日"
STATUS = {
    "ok": ("✓", "完成", "good"),
    "partial": ("◐", "部分", "warn"),
    "skipped": ("–", "未取", "muted"),
    "failed": ("✕", "失败", "bad"),
}

THEME_BOOT = (
    "<script>try{var t=localStorage.getItem('daily-theme');"
    "if(t)document.documentElement.dataset.theme=t}catch(e){}</script>"
)


def zh_day(date: str) -> str:
    d = dt.date.fromisoformat(date)
    return f"{d.year} 年 {d.month} 月 {d.day} 日"


def zh_weekday(date: str) -> str:
    return "星期" + WEEKDAYS[dt.date.fromisoformat(date).weekday()]


def zh_date(date: str) -> str:
    return f"{zh_day(date)} · {zh_weekday(date)}"


def page(title: str, body: str, root: str, description: str = "") -> str:
    return f"""<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
{THEME_BOOT}
<link rel="stylesheet" href="{root}assets/style.css">
<script defer src="{root}assets/app.js"></script>
</head>
<body>
<a class="skip" href="#main">跳到正文</a>
{body}
</body>
</html>
"""


def topbar(root: str, nav: str = "") -> str:
    return f"""<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="{root}index.html"><span class="brand-mark" aria-hidden="true">日</span><span class="brand-text">关注清单日报</span></a>
    <nav class="topnav" aria-label="期数导航">{nav}</nav>
    <button class="theme-btn" type="button" data-theme-toggle aria-label="切换深浅色">
      <span class="theme-ico" aria-hidden="true"></span><span class="theme-txt">外观</span>
    </button>
  </div>
</header>"""


def footer(generated_at: str) -> str:
    return f"""<footer class="foot">
  <p>关注清单日报 · 私有资料，请勿公开转发。数据与口径以各节说明为准，非交易建议。</p>
  <p class="muted">页面生成于 {esc(generated_at)}</p>
</footer>"""


# ---------------------------------------------------------------- KPI


def kpis(data: dict) -> list[dict]:
    """看板指标：恐惧贪婪 → 各协议收入 → Trench。由模块数据计算，不单独存储。

    只有收入变化着色（升绿降红）；指数点数的升降不代表好坏，保持中性。
    """
    out: list[dict] = []
    fng = data.get("fng")
    if fng:
        lt, pv = fng["latest"], fng.get("previous")
        sub = f"UTC {mmdd(lt['date'])}"
        delta_txt = ""
        if pv:
            d = lt["value"] - pv["value"]
            delta_txt = f"较上一日 {pv['value']:g} {'升' if d > 0 else '降' if d < 0 else '持平'}{'' if d == 0 else f' {abs(d):g} 点'}"
        out.append({"label": "恐惧贪婪指数", "value": f"{lt['value']:g}", "unit": lt["class_zh"],
                    "delta": delta_txt, "trend": "flat", "sub": sub, "href": "#market"})
    rev = data.get("revenue")
    if rev:
        for p in rev["protocols"]:
            v = p["values"]
            c = change_pct(v[-1], v[-2]) if v[-2] else 0.0
            out.append({"label": f"{p['name']} 收入", "value": usd(v[-1]), "unit": "",
                        "delta": f"{arrow(c)} {pct(abs(c))}", "trend": "up" if c > 0 else "down" if c < 0 else "flat",
                        "sub": f"UTC {mmdd(rev['dates'][-1])} · 较前一日", "href": "#revenue"})
    tr = (data.get("tehc") or {}).get("trench")
    if tr:
        hist = tr.get("history") or []
        delta_txt = ""
        if len(hist) >= 2:
            d = hist[-1]["score"] - hist[-2]["score"]
            delta_txt = f"较 {mmdd(hist[-2]['date'])} 的 {hist[-2]['score']:g} {'升' if d > 0 else '降' if d < 0 else '持平'}{'' if d == 0 else f' {abs(d):g} 分'}"
        out.append({"label": "Trench", "value": f"{tr['score']:g}", "unit": tr.get("label_zh") or tr["label"],
                    "delta": delta_txt, "trend": "flat", "sub": f"{mmdd(tr['date'])}", "href": "#onchain"})
    return out


def kpi_grid(items: list[dict], compact: bool = False) -> str:
    cells = []
    for k in items:
        unit = f'<span class="kpi-unit">{esc(k["unit"])}</span>' if k["unit"] else ""
        delta = f'<span class="kpi-delta {k["trend"]}">{esc(k["delta"])}</span>' if k["delta"] else ""
        tag = "div" if compact else "a"
        href = "" if compact else f' href="{k["href"]}"'
        cells.append(
            f'<{tag} class="kpi"{href}><span class="kpi-label">{esc(k["label"])}</span>'
            f'<span class="kpi-value">{esc(k["value"])}{unit}</span>'
            f'<span class="kpi-foot">{delta}<span class="kpi-sub">{esc(k["sub"])}</span></span></{tag}>'
        )
    cls = "kpis compact" if compact else "kpis"
    return f'<div class="{cls}">{"".join(cells)}</div>'


# ---------------------------------------------------------------- 组件


def section(sid: str, kicker: str, title: str, body: str, caption: str = "") -> str:
    cap = f'<p class="sec-cap">{rich(caption)}</p>' if caption else ""
    return (
        f'<section class="sec" id="{sid}" aria-labelledby="{sid}-h">'
        f'<header class="sec-head"><span class="kicker">{esc(kicker)}</span>'
        f'<h2 id="{sid}-h">{esc(title)}</h2>{cap}</header>{body}</section>'
    )


def table(cols: list[str], rows: list[list[str]], num_cols: set[int], cls: str = "", caption: str = "") -> str:
    """rows 里的单元格是已转义的 HTML。"""
    th = "".join(f'<th scope="col"{" class=num" if i in num_cols else ""}>{esc(c)}</th>' for i, c in enumerate(cols))
    trs = []
    for r in rows:
        tds = []
        for i, c in enumerate(r):
            tag = "th scope=row" if i == 0 else "td"
            klass = " class=num" if i in num_cols else ""
            tds.append(f"<{tag}{klass}>{c}</{tag.split()[0]}>")
        trs.append(f"<tr>{''.join(tds)}</tr>")
    cap = f"<caption>{esc(caption)}</caption>" if caption else ""
    return f'<div class="tbl-wrap"><table class="tbl {cls}">{cap}<thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>'


def callout(tone: str, title: str, text: str) -> str:
    icon = {"warning": "!", "danger": "✕", "info": "i"}.get(tone, "i")
    return (
        f'<aside class="callout {esc(tone)}" role="note"><span class="callout-ico" aria-hidden="true">{icon}</span>'
        f'<div><strong>{esc(title)}</strong><p>{rich(text)}</p></div></aside>'
    )


def inline_bar(v: float, vmax: float) -> str:
    w = 0 if vmax <= 0 else max(1.5, v / vmax * 100)
    return f'<span class="ibar" aria-hidden="true"><span style="width:{w:.2f}%"></span></span>'


def link_list(links: list[dict]) -> str:
    return " · ".join(ext_link(ln["url"], ln["label"]) for ln in links)


# ---------------------------------------------------------------- 各模块


def sec_market(fng: dict) -> str:
    lt, pv = fng["latest"], fng.get("previous")
    rows = [["最新", f"{lt['value']:g} · {esc(lt.get('class_en', ''))}（{esc(lt['class_zh'])}）", f"UTC {esc(lt['date'])}"]]
    if pv:
        rows.append(["上一日", f"{pv['value']:g} · {esc(pv.get('class_en', ''))}（{esc(pv['class_zh'])}）", f"UTC {esc(pv['date'])}"])
    body = (
        '<div class="fng">'
        f'<div class="fng-big"><span class="fng-num">{lt["value"]:g}</span><span class="fng-cls">{esc(lt["class_zh"])}</span></div>'
        f'{charts.fng_scale(lt["value"], pv["value"] if pv else None)}'
        "</div>"
        + table(["项目", "数值", "数据日"], rows, {1, 2}, "slim")
    )
    return section("market", fng["source"], "市场情绪 · 恐惧贪婪指数", body, f"数据日 UTC {lt['date']}。")


def sec_revenue(rev: dict) -> str:
    dates, prots = rev["dates"], rev["protocols"]
    legend = "".join(f'<span class="lg"><i class="swatch s{i + 1}"></i>{esc(p["name"])}</span>' for i, p in enumerate(prots))
    head_rows = []
    for i, p in enumerate(prots):
        v = p["values"]
        c = change_pct(v[-1], v[-2])
        trend = "up" if c > 0 else "down" if c < 0 else "flat"
        ath = p.get("ath")
        ath_cell = f"{usd(ath['usd'])}（{esc(ath['date'])}）" if ath else "—"
        share = pct(v[-1] / ath["usd"] * 100) if ath else "—"
        name = ext_link(p["url"], p["name"]) if p.get("url") else esc(p["name"])
        head_rows.append([
            f'<i class="swatch s{i + 1}"></i>{name}', usd(v[-1]), usd(v[-2]),
            f'<span class="delta {trend}">{arrow(c)} {pct(abs(c))}</span>', share, ath_cell,
        ])
    summary_tbl = table(
        ["协议", f"UTC {mmdd(dates[-1])}", f"UTC {mmdd(dates[-2])}", "变化", "占 ATH", "历史最高"],
        head_rows, {1, 2, 3, 4, 5},
    )
    meters = "".join(
        charts.meter(p["name"], p["values"][-1] / p["ath"]["usd"] * 100,
                     f"ATH {usd(p['ath']['usd'])}（{p['ath']['date']}）", i + 1)
        for i, p in enumerate(prots) if p.get("ath")
    )
    full_rows = [[f"UTC {esc(d)}"] + [usd(p["values"][i]) for p in prots] for i, d in enumerate(dates)]
    full_tbl = table(["日期"] + [p["name"] for p in prots], full_rows[::-1], set(range(1, len(prots) + 1)), "slim")
    notes = "".join(f'<p class="note">{rich(n)}</p>' for n in rev.get("notes", []))
    body = (
        summary_tbl + notes
        + f'<figure class="fig"><figcaption><span>近 {len(dates)} 个完整日 · UTC {esc(mmdd(dates[0]))} 至 {esc(mmdd(dates[-1]))}</span>'
        f'<span class="legend">{legend}</span></figcaption>{charts.revenue_chart(dates, prots)}'
        f'<details class="data-view"><summary>查看逐日数据表</summary>{full_tbl}</details></figure>'
        + (f'<div class="sub"><h3>最新完整日占各自历史最高</h3><div class="meters">{meters}</div></div>' if meters else "")
    )
    return section("revenue", rev["source"], "GMGN 与 FOMO 收入", body, rev.get("caption", ""))


def sec_onchain(t: dict) -> str:
    parts = []
    tr = t.get("trench")
    if tr:
        hist = tr.get("history") or []
        chart = charts.column_chart([(mmdd(h["date"]), h["score"]) for h in hist], f"Trench 近 {len(hist)} 个已评分日") if hist else ""
        comp_rows = []
        for c in tr.get("components", []):
            val = usd(c["usd"]) if "usd" in c else num(c["count"])
            comp_rows.append([esc(c["name"]), val,
                              f'<span class="pctl"><span class="pctl-bar" style="width:{min(100, c["percentile"]):g}%"></span></span>{c["percentile"]:g}'])
        comp = table([f"分项（{mmdd(tr['date'])}）", "数值", "分位"], comp_rows, {1, 2}, "slim") if comp_rows else ""
        cnote = f'<p class="note">{rich(tr["components_note"])}</p>' if tr.get("components_note") else ""
        parts.append(
            '<div class="sub trench"><div class="trench-head">'
            f'<div class="trench-score"><span class="kicker">Trench · {esc(tr["date"])}</span>'
            f'<span class="big">{tr["score"]:g}</span><span class="tag cold">{esc(tr["label"])}{" · " + esc(tr["label_zh"]) if tr.get("label_zh") else ""}</span></div>'
            f'<p class="note">{rich(tr.get("note", ""))}</p></div>'
            f'<div class="trench-body"><figure class="fig fig-sm"><figcaption>近 {len(hist)} 个已评分日</figcaption>{chart}</figure>'
            f'<div>{comp}{cnote}</div></div></div>'
        )
    lp = t.get("launchpads")
    if lp:
        mx = max(r["volume_usd"] for r in lp["rows"])
        rows = [[esc(r["name"]), f'{inline_bar(r["volume_usd"], mx)}{usd(r["volume_usd"])}', num(r["launches"])] for r in lp["rows"]]
        tot = lp.get("total")
        totline = f'合计：成交额 {usd(tot["volume_usd"])} · 新发射 {num(tot["launches"])}。' if tot else ""
        parts.append(f'<div class="sub"><h3>发射台</h3><p class="note">{esc(lp.get("caption", ""))}{esc(totline)}</p>'
                     + table(["发射台", "成交额", "新发射"], rows, {1, 2}) + "</div>")
    bots = t.get("bots")
    if bots:
        mx = max(r["volume_usd"] for r in bots["rows"])
        rows = [[esc(r["name"]), f'{inline_bar(r["volume_usd"], mx)}{usd(r["volume_usd"])}', usd(r["fees_usd"])] for r in bots["rows"]]
        tot = bots.get("total")
        totline = f'合计：成交额 {usd(tot["volume_usd"])} · 手续费 {usd(tot["fees_usd"])}。' if tot else ""
        warn = callout("warning", "手续费 ≠ dailyRevenue", bots["warning"]) if bots.get("warning") else ""
        parts.append(f'<div class="sub"><h3>交易机器人</h3><p class="note">{esc(bots.get("caption", ""))}{esc(totline)}</p>'
                     + table(["机器人", "成交额", "手续费"], rows, {1, 2}) + warn + "</div>")
    ch = t.get("chains")
    if ch:
        main_date = max((r.get("date", "") for r in ch["rows"]), key=lambda d: sum(1 for r in ch["rows"] if r.get("date") == d))
        mx = max(r["dex_volume_usd"] for r in ch["rows"])
        rows = []
        for r in ch["rows"]:
            name = esc(r["name"])
            if r.get("date") and r["date"] != main_date:
                name += f' <span class="tag warn">至 {esc(mmdd(r["date"]))}</span>'
            rows.append([name, f'{inline_bar(r["dex_volume_usd"], mx)}{usd(r["dex_volume_usd"])}', num(r["wallets"])])
        parts.append(f'<div class="sub"><h3>公链</h3><p class="note">{esc(ch.get("caption", ""))}</p>'
                     + table(["链", "DEX 成交额", "钱包"], rows, {1, 2}) + "</div>")
    return section("onchain", t.get("source", "TehcScreener"), "链上活动 · TehcScreener", "".join(parts), t.get("caption", ""))


def sec_defined(d: dict) -> str:
    cards = []
    for i, tk in enumerate(d["tokens"], 1):
        status = tk.get("status")
        st = ""
        if status:
            st_cls = "new" if status == "新上" else "move"
            st = f'<span class="tag {st_cls}">{esc(status)}</span>'
        narr = tk.get("narrative")
        narr_html = f'<p>{rich(narr)}</p>' if narr else '<p class="muted">暂无可核实叙事。</p>'
        cards.append(
            f'<li class="tok"><span class="tok-rank">{i}</span>'
            f'<div class="tok-main"><div class="tok-title">{ext_link(tk["url"], tk["symbol"], "tok-name")}'
            f'<span class="chain">{esc(tk.get("chain", ""))}</span>{st}</div>{narr_html}</div>'
            f'<dl class="tok-nums"><div><dt>24h 交易量</dt><dd>{usd(tk["volume_24h_usd"])}</dd></div>'
            f'<div><dt>流动性</dt><dd>{usd(tk["liquidity_usd"])}</dd></div></dl></li>'
        )
    changes = f'<p class="changes"><strong>榜单变化</strong>{esc(d["changes"])}</p>' if d.get("changes") else ""
    method = f'<details class="method"><summary>筛选方法</summary><p>{rich(d["method"])}</p></details>' if d.get("method") else ""
    body = changes + f'<ol class="toks">{"".join(cards)}</ol>' + method
    return section("defined", f"Defined / Codex · {d['fetched_at']}", d["title"], body, d.get("caption", ""))


def sec_community(rd: dict | None, gh: dict | None) -> str:
    parts = []
    if rd:
        posts = rd.get("posts", [])
        items = "".join(
            f'<li>{ext_link(p["url"], p["title"])}<span class="post-meta">{esc(p["author"])} · 评论 '
            f'{esc(p["comments"]) if p.get("comments") is not None else "--"}</span></li>'
            for p in posts
        )
        lst = f'<ol class="posts">{items}</ol>' if items else '<p class="muted">本窗口无新帖。</p>'
        since = f'自上次正式早报（{esc(rd["since"])}）以来 · {len(posts)} 篇新帖' if rd.get("since") else f"{len(posts)} 篇新帖"
        parts.append(
            f'<div class="sub"><h3>{ext_link(rd["url"], rd["subreddit"])}<span class="h-meta">{since}</span></h3>'
            f'{f"<p>{rich(rd["summary"])}</p>" if rd.get("summary") else ""}{lst}'
            f'{f"<p class=note>{rich(rd["note"])}</p>" if rd.get("note") else ""}</div>'
        )
    if gh:
        tag = '<span class="tag new">有更新</span>' if gh["updated"] else '<span class="tag muted">无更新</span>'
        parts.append(f'<div class="sub"><h3>{ext_link(gh["url"], gh["org"])} {tag}</h3><p>{rich(gh["text"])}</p></div>')
    return section("community", "Reddit · GitHub", "社区与代码", "".join(parts))


def sec_x(x: dict) -> str:
    parts = []
    if x.get("mainline"):
        parts.append(callout("info", "今日主线", x["mainline"]))
    cards = []
    for acc in x.get("accounts", []):
        items = []
        for it in acc["items"]:
            tags = ""
            if it.get("truncated"):
                tags += '<span class="tag warn">截断</span>'
            if it.get("unverified"):
                tags += '<span class="tag bad">未核实</span>'
            links = []
            if it.get("url"):
                links.append(ext_link(it["url"], "原帖"))
            if it.get("links"):
                links.append(link_list(it["links"]))
            items.append(
                f'<li><h4>{esc(it["title"])}{tags}</h4><p>{rich(it["detail"])}</p>'
                f'<p class="src">{" · ".join(links)}</p></li>'
            )
        note = f'<p class="xnote"><b>读法</b>{rich(acc["note"])}</p>' if acc.get("note") else ""
        cards.append(
            f'<article class="xacc"><header><span class="avatar" aria-hidden="true">{esc(acc["name"][:1])}</span>'
            f'<div><strong>{esc(acc["name"])}</strong>'
            f'{ext_link("https://x.com/" + acc["handle"], "@" + acc["handle"], "handle")}</div>'
            f'<span class="count">{len(acc["items"])} 条</span></header><ul>{"".join(items)}</ul>{note}</article>'
        )
    parts.append(f'<div class="xgrid">{"".join(cards)}</div>')
    if x.get("tools"):
        tools = "".join(
            f'<li><strong>{esc(t["title"])}</strong><p>{rich(t["detail"])}</p>'
            f'{f"<p class=src>{link_list(t["links"])}</p>" if t.get("links") else ""}</li>'
            for t in x["tools"]
        )
        parts.append(f'<div class="sub"><h3>工具</h3><ul class="tools">{tools}</ul></div>')
    kicker = f"X · {x['window']}" if x.get("window") else "X"
    return section("x", kicker, "关注账号 X 摘要", "".join(parts), x.get("caption", ""))


def sec_methods(m: dict, coverage: str) -> str:
    checks = "".join(
        f'<li class="chk {STATUS[c["status"]][2]}"><span class="chk-ico" aria-hidden="true">{STATUS[c["status"]][0]}</span>'
        f'<div><strong>{esc(c["text"])}</strong><span class="chk-st">{STATUS[c["status"]][1]}</span>'
        f'{f"<p>{rich(c["meta"])}</p>" if c.get("meta") else ""}</div></li>'
        for c in m["checklist"]
    )
    props = "".join(f"<div><dt>{esc(p['label'])}</dt><dd>{rich(p['value'])}</dd></div>" for p in m.get("properties", []))
    srcs = "".join(f"<div><dt>{esc(s['title'])}</dt><dd>{rich(s['detail'])}</dd></div>" for s in m.get("sources", []))
    links = "".join(
        f'<li><a href="{esc(ln["url"])}" target="_blank" rel="noopener noreferrer"><strong>{esc(ln["title"])}</strong>'
        f'<span>{esc(ln.get("site", ""))}</span></a></li>'
        for ln in m.get("links", [])
    )
    body = (
        f'<div class="sub"><h3>各数据源状态</h3><ul class="checks">{checks}</ul></div>'
        + (f'<div class="sub"><h3>本次取数</h3><dl class="props">{props}</dl></div>' if props else "")
        + (f'<details class="sub method" open><summary>各数据源口径</summary><dl class="props">{srcs}</dl></details>' if srcs else "")
        + (f'<div class="sub"><h3>来源入口</h3><ul class="linkcards">{links}</ul></div>' if links else "")
    )
    return section("methods", "审计", "取数与来源", body, f"覆盖窗口：{coverage}")


# ---------------------------------------------------------------- 页面


TOC = [
    ("market", "市场情绪", "fng"),
    ("revenue", "收入", "revenue"),
    ("onchain", "链上活动", "tehc"),
    ("defined", "Defined 新池", "defined"),
    ("community", "社区与代码", ("reddit", "github")),
    ("x", "X 摘要", "x_digest"),
    ("methods", "取数与来源", "methods"),
]


def _has(data: dict, key: Any) -> bool:
    if isinstance(key, tuple):
        return any(data.get(k) for k in key)
    return bool(data.get(key))


def report_page(data: dict, prev: str | None, nxt: str | None, generated_at: str) -> str:
    root = "../../"
    date = data["date"]
    nav = []
    nav.append(f'<a href="{root}reports/{prev}/index.html" rel="prev">← {esc(mmdd(prev))}</a>' if prev else '<span class="off">← 前一期</span>')
    nav.append(f'<a href="{root}index.html">全部日报</a>')
    nav.append(f'<a href="{root}reports/{nxt}/index.html" rel="next">{esc(mmdd(nxt))} →</a>' if nxt else '<span class="off">后一期 →</span>')
    toc_items = [(sid, label) for sid, label, key in TOC if _has(data, key)]
    toc = "".join(f'<li><a href="#{sid}">{esc(label)}</a></li>' for sid, label in toc_items)
    notices = "".join(callout(n["tone"], n["title"], n["text"]) for n in data.get("notices", []))
    highlights = "".join(f"<li>{rich(h)}</li>" for h in data["highlights"])

    secs = []
    if data.get("fng"):
        secs.append(sec_market(data["fng"]))
    if data.get("revenue"):
        secs.append(sec_revenue(data["revenue"]))
    if data.get("tehc"):
        secs.append(sec_onchain(data["tehc"]))
    if data.get("defined"):
        secs.append(sec_defined(data["defined"]))
    if data.get("reddit") or data.get("github"):
        secs.append(sec_community(data.get("reddit"), data.get("github")))
    if data.get("x_digest"):
        secs.append(sec_x(data["x_digest"]))
    secs.append(sec_methods(data["methods"], data["coverage"]))

    body = f"""{topbar(root, "".join(nav))}
<div class="layout">
  <aside class="toc" aria-label="本期目录">
    <p class="toc-title">本期目录</p>
    <ol>
      <li><a href="#top">概览</a></li>
      {toc}
    </ol>
  </aside>
  <main id="main" class="content">
    <section class="hero" id="top">
      <p class="eyebrow"><span class="edition">{esc(data["edition"])}</span>关注清单日报</p>
      <h1>{esc(zh_day(date))}<span class="wd">{esc(zh_weekday(date))}</span></h1>
      <p class="issued">出报 {esc(data["issued_at"])}（北京时间）</p>
      <p class="lede">{rich(data["summary"])}</p>
    </section>
    {kpi_grid(kpis(data))}
    {notices}
    <section class="digest" aria-labelledby="digest-h">
      <h2 id="digest-h">今日要点</h2>
      <ul>{highlights}</ul>
    </section>
    {"".join(secs)}
    {footer(generated_at)}
  </main>
</div>"""
    title = f"关注清单日报 · {date}" + ("" if data["edition"] == "早报" else f"（{data['edition']}）")
    return page(title, body, root, data["summary"])


def index_page(reports: list[dict], generated_at: str) -> str:
    """reports 按日期倒序。"""
    root = ""
    if not reports:
        body = f'{topbar(root)}<main id="main" class="content solo"><p>还没有日报。</p>{footer(generated_at)}</main>'
        return page("关注清单日报", body, root)
    latest = reports[0]
    feat = (
        f'<a class="feature" href="reports/{latest["date"]}/index.html">'
        f'<p class="eyebrow"><span class="edition">最新 · {esc(latest["edition"])}</span>{esc(zh_date(latest["date"]))}</p>'
        f'<h2>{esc(latest["date"])}</h2><p class="lede">{rich(latest["summary"])}</p>'
        f'{kpi_grid(kpis(latest), compact=True)}<span class="cta">阅读全文 →</span></a>'
    )
    by_month: dict[str, list[dict]] = {}
    for r in reports:
        by_month.setdefault(r["date"][:7], []).append(r)
    groups = []
    for month, rs in by_month.items():
        y, m = month.split("-")
        rows = "".join(
            f'<li><a href="reports/{r["date"]}/index.html"><span class="ar-date">{esc(mmdd(r["date"]))}'
            f'<small>星期{WEEKDAYS[dt.date.fromisoformat(r["date"]).weekday()]}</small></span>'
            f'<span class="ar-ed">{esc(r["edition"])}</span>'
            f'<span class="ar-sum">{esc(r["summary"])}</span></a></li>'
            for r in rs
        )
        groups.append(f'<section class="ar-month"><h3>{int(y)} 年 {int(m)} 月</h3><ol class="archive">{rows}</ol></section>')
    body = f"""{topbar(root)}
<main id="main" class="content solo">
  <section class="hero home">
    <h1>关注清单日报</h1>
    <p class="lede">每日 09:00（北京时间）整理：市场情绪、GMGN / FOMO 收入、链上活动、新池、社区、代码与关注账号摘要。共 {len(reports)} 期。</p>
  </section>
  {feat}
  <h2 class="ar-title">往期</h2>
  {"".join(groups)}
  {footer(generated_at)}
</main>"""
    return page("关注清单日报", body, root, "关注清单日报归档")
