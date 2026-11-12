"""日报数据文件校验。规则见 web/README.md「数据格式」。

只做结构与一致性校验，不判断内容真伪：数据真实性由出报方负责。
"""

from __future__ import annotations

import re
from typing import Any

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL_RE = re.compile(r"^https?://\S+$")
DEXSCREENER_URL_RE = re.compile(r"^https://dexscreener\.com/[a-z0-9-]+/\S+$")
SCHEMA_VERSION = 1
CHECK_STATUSES = {"ok", "partial", "skipped", "failed"}
NOTICE_TONES = {"info", "warning", "danger"}


class _V:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def err(self, path: str, msg: str) -> None:
        self.errors.append(f"{path}: {msg}")

    def get(self, obj: Any, key: str, path: str, typ: type | tuple, required: bool = True) -> Any:
        if not isinstance(obj, dict):
            self.err(path, "应为对象")
            return None
        if key not in obj or obj[key] is None:
            if required:
                self.err(f"{path}.{key}", "缺少必填字段")
            return None
        val = obj[key]
        if typ in (int, float, (int, float)) and isinstance(val, bool):
            self.err(f"{path}.{key}", "应为数字")
            return None
        if not isinstance(val, typ):
            name = typ.__name__ if isinstance(typ, type) else "/".join(t.__name__ for t in typ)
            self.err(f"{path}.{key}", f"类型应为 {name}，实际为 {type(val).__name__}")
            return None
        if isinstance(val, str) and required and not val.strip():
            self.err(f"{path}.{key}", "不能为空字符串")
        return val

    def date(self, obj: Any, key: str, path: str, required: bool = True) -> str | None:
        v = self.get(obj, key, path, str, required)
        if v is not None and not DATE_RE.match(v):
            self.err(f"{path}.{key}", f"日期格式应为 YYYY-MM-DD，实际为 {v!r}")
        return v

    def url(self, obj: Any, key: str, path: str, required: bool = True) -> str | None:
        v = self.get(obj, key, path, str, required)
        if v is not None and not URL_RE.match(v):
            self.err(f"{path}.{key}", f"链接必须是 http(s) 地址，实际为 {v!r}")
        return v

    def items(self, obj: Any, key: str, path: str, required: bool = True, nonempty: bool = False) -> list:
        v = self.get(obj, key, path, list, required)
        if v is None:
            return []
        if nonempty and not v:
            self.err(f"{path}.{key}", "不能为空列表")
        return v

    def links(self, obj: Any, path: str) -> None:
        for i, ln in enumerate(self.items(obj, "links", path, required=False)):
            p = f"{path}.links[{i}]"
            self.get(ln, "label", p, str)
            self.url(ln, "url", p)


NUM = (int, float)


def validate_report(data: Any, filename_date: str | None = None) -> list[str]:
    v = _V()
    r = "$"
    if not isinstance(data, dict):
        return ["$: 顶层应为对象"]
    sv = v.get(data, "schema_version", r, int)
    if sv is not None and sv != SCHEMA_VERSION:
        v.err(f"{r}.schema_version", f"仅支持 {SCHEMA_VERSION}")
    date = v.date(data, "date", r)
    if filename_date and date and date != filename_date:
        v.err(f"{r}.date", f"与文件名日期 {filename_date} 不一致")
    v.get(data, "edition", r, str)
    v.get(data, "issued_at", r, str)
    v.get(data, "coverage", r, str)
    v.get(data, "summary", r, str)
    for i, h in enumerate(v.items(data, "highlights", r, nonempty=True)):
        if not isinstance(h, str) or not h.strip():
            v.err(f"{r}.highlights[{i}]", "应为非空字符串")
    for i, n in enumerate(v.items(data, "notices", r, required=False)):
        p = f"{r}.notices[{i}]"
        tone = v.get(n, "tone", p, str)
        if tone and tone not in NOTICE_TONES:
            v.err(f"{p}.tone", f"只能是 {sorted(NOTICE_TONES)}")
        v.get(n, "title", p, str)
        v.get(n, "text", p, str)

    # 恐惧贪婪
    fng = v.get(data, "fng", r, dict, required=False)
    if fng is not None:
        p = f"{r}.fng"
        v.get(fng, "source", p, str)
        for k in ("latest", "previous"):
            o = v.get(fng, k, p, dict, required=(k == "latest"))
            if o is not None:
                v.date(o, "date", f"{p}.{k}")
                val = v.get(o, "value", f"{p}.{k}", NUM)
                if val is not None and not 0 <= val <= 100:
                    v.err(f"{p}.{k}.value", "应在 0–100 之间")
                v.get(o, "class_zh", f"{p}.{k}", str)

    # 收入
    rev = v.get(data, "revenue", r, dict, required=False)
    if rev is not None:
        p = f"{r}.revenue"
        v.get(rev, "source", p, str)
        dates = v.items(rev, "dates", p, nonempty=True)
        for i, d in enumerate(dates):
            if not isinstance(d, str) or not DATE_RE.match(d):
                v.err(f"{p}.dates[{i}]", "日期格式应为 YYYY-MM-DD")
        if dates != sorted(dates, key=str):
            v.err(f"{p}.dates", "应按时间升序排列")
        for i, pr in enumerate(v.items(rev, "protocols", p, nonempty=True)):
            pp = f"{p}.protocols[{i}]"
            v.get(pr, "name", pp, str)
            v.url(pr, "url", pp, required=False)
            vals = v.items(pr, "values", pp, nonempty=True)
            if len(vals) != len(dates):
                v.err(f"{pp}.values", f"长度 {len(vals)} 与 dates 长度 {len(dates)} 不一致")
            if len(vals) < 2:
                v.err(f"{pp}.values", "至少需要 2 个完整日才能计算变化")
            for j, x in enumerate(vals):
                if isinstance(x, bool) or not isinstance(x, NUM):
                    v.err(f"{pp}.values[{j}]", "应为数字")
            ath = v.get(pr, "ath", pp, dict, required=False)
            if ath is not None:
                a = v.get(ath, "usd", f"{pp}.ath", NUM)
                v.date(ath, "date", f"{pp}.ath")
                if a is not None and a <= 0:
                    v.err(f"{pp}.ath.usd", "应大于 0")

    # TehcScreener
    tehc = v.get(data, "tehc", r, dict, required=False)
    if tehc is not None:
        p = f"{r}.tehc"
        v.get(tehc, "source", p, str)
        tr = v.get(tehc, "trench", p, dict, required=False)
        if tr is not None:
            pt = f"{p}.trench"
            v.date(tr, "date", pt)
            v.get(tr, "score", pt, NUM)
            v.get(tr, "label", pt, str)
            hist = v.items(tr, "history", pt, required=False)
            for i, h in enumerate(hist):
                v.date(h, "date", f"{pt}.history[{i}]")
                v.get(h, "score", f"{pt}.history[{i}]", NUM)
            if hist and isinstance(hist[-1], dict) and hist[-1].get("date") != tr.get("date"):
                v.err(f"{pt}.history", "最后一项日期应等于 trench.date")
            for i, c in enumerate(v.items(tr, "components", pt, required=False)):
                pc = f"{pt}.components[{i}]"
                v.get(c, "name", pc, str)
                if not (isinstance(c, dict) and (("usd" in c) ^ ("count" in c))):
                    v.err(pc, "usd 与 count 必须且只能有一个")
                v.get(c, "percentile", pc, NUM)
        for key, cols in (
            ("launchpads", ("volume_usd", "launches")),
            ("bots", ("volume_usd", "fees_usd")),
            ("chains", ("dex_volume_usd", "wallets")),
        ):
            blk = v.get(tehc, key, p, dict, required=False)
            if blk is None:
                continue
            pb = f"{p}.{key}"
            for i, row in enumerate(v.items(blk, "rows", pb, nonempty=True)):
                v.get(row, "name", f"{pb}.rows[{i}]", str)
                for c in cols:
                    v.get(row, c, f"{pb}.rows[{i}]", NUM)
            if key != "chains":
                tot = v.get(blk, "total", pb, dict, required=False)
                if tot is not None:
                    for c in cols:
                        v.get(tot, c, f"{pb}.total", NUM)

    # Defined
    de = v.get(data, "defined", r, dict, required=False)
    if de is not None:
        p = f"{r}.defined"
        v.get(de, "title", p, str)
        v.get(de, "fetched_at", p, str)
        for i, t in enumerate(v.items(de, "tokens", p, nonempty=True)):
            pt = f"{p}.tokens[{i}]"
            v.get(t, "symbol", pt, str)
            v.url(t, "url", pt)
            v.get(t, "liquidity_usd", pt, NUM)
            v.get(t, "volume_24h_usd", pt, NUM)
            v.get(t, "narrative", pt, str, required=False)
            v.get(t, "status", pt, str, required=False)

    # DexScreener（替代 Defined；口径不同，单独字段）
    ds = v.get(data, "dexscreener", r, dict, required=False)
    if ds is not None:
        p = f"{r}.dexscreener"
        v.get(ds, "title", p, str)
        v.get(ds, "fetched_at", p, str)
        v.get(ds, "caption", p, str)  # 必须写清实际端点与口径
        v.get(ds, "method", p, str)
        v.get(ds, "changes", p, str, required=False)
        for i, t in enumerate(v.items(ds, "tokens", p, nonempty=True)):
            pt = f"{p}.tokens[{i}]"
            v.get(t, "symbol", pt, str)
            v.get(t, "chain", pt, str)
            u = v.url(t, "url", pt)
            if u and not DEXSCREENER_URL_RE.match(u):
                v.err(f"{pt}.url", f"应为 DexScreener 官方接口返回的 https://dexscreener.com/… 页面链接，实际为 {u!r}")
            v.get(t, "liquidity_usd", pt, NUM)
            v.get(t, "volume_24h_usd", pt, NUM)
            v.get(t, "narrative", pt, str, required=False)
            v.get(t, "status", pt, str, required=False)
            v.get(t, "address", pt, str, required=False)
            v.get(t, "dex", pt, str, required=False)
            v.get(t, "pair_created_at", pt, str, required=False)

    # Reddit
    rd = v.get(data, "reddit", r, dict, required=False)
    if rd is not None:
        p = f"{r}.reddit"
        v.get(rd, "subreddit", p, str)
        v.url(rd, "url", p)
        for i, post in enumerate(v.items(rd, "posts", p)):
            pp = f"{p}.posts[{i}]"
            v.get(post, "title", pp, str)
            v.url(post, "url", pp)
            v.get(post, "author", pp, str)
            v.get(post, "comments", pp, int, required=False)

    gh = v.get(data, "github", r, dict, required=False)
    if gh is not None:
        v.get(gh, "org", f"{r}.github", str)
        v.url(gh, "url", f"{r}.github")
        v.get(gh, "updated", f"{r}.github", bool)
        v.get(gh, "text", f"{r}.github", str)

    # X
    xd = v.get(data, "x_digest", r, dict, required=False)
    if xd is not None:
        p = f"{r}.x_digest"
        v.get(xd, "caption", p, str)
        for i, acc in enumerate(v.items(xd, "accounts", p)):
            pa = f"{p}.accounts[{i}]"
            v.get(acc, "name", pa, str)
            h = v.get(acc, "handle", pa, str)
            if h and h.startswith("@"):
                v.err(f"{pa}.handle", "不要带 @ 前缀")
            for j, it in enumerate(v.items(acc, "items", pa, nonempty=True)):
                pi = f"{pa}.items[{j}]"
                v.get(it, "title", pi, str)
                v.get(it, "detail", pi, str)
                v.url(it, "url", pi, required=False)
                v.links(it, pi)
                if isinstance(it, dict) and not it.get("url") and not it.get("links"):
                    v.err(pi, "需要 url 或 links，至少给一个原帖链接")
            v.get(acc, "note", pa, str, required=False)
        for i, t in enumerate(v.items(xd, "tools", p, required=False)):
            v.get(t, "title", f"{p}.tools[{i}]", str)
            v.get(t, "detail", f"{p}.tools[{i}]", str)
            v.links(t, f"{p}.tools[{i}]")

    # 取数与来源
    me = v.get(data, "methods", r, dict)
    if me is not None:
        p = f"{r}.methods"
        for i, it in enumerate(v.items(me, "properties", p, required=False)):
            v.get(it, "label", f"{p}.properties[{i}]", str)
            v.get(it, "value", f"{p}.properties[{i}]", str)
        for i, it in enumerate(v.items(me, "checklist", p, nonempty=True)):
            pc = f"{p}.checklist[{i}]"
            v.get(it, "text", pc, str)
            st = v.get(it, "status", pc, str)
            if st and st not in CHECK_STATUSES:
                v.err(f"{pc}.status", f"只能是 {sorted(CHECK_STATUSES)}")
            v.get(it, "meta", pc, str, required=False)
        for i, it in enumerate(v.items(me, "sources", p, required=False)):
            v.get(it, "title", f"{p}.sources[{i}]", str)
            v.get(it, "detail", f"{p}.sources[{i}]", str)
        for i, it in enumerate(v.items(me, "links", p, required=False)):
            v.get(it, "title", f"{p}.links[{i}]", str)
            v.url(it, "url", f"{p}.links[{i}]")

    return v.errors
