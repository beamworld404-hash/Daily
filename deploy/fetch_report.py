#!/usr/bin/env python3
"""关注清单日报：本机抓取公开数据，生成当天 JSON（schema_version 1）。

由 deploy/fetch-report.sh 调用（cron 每天 08:40，上海时间），也可手动运行：

  python3 deploy/fetch_report.py                 # 今天（上海时间），校验通过后投放到 incoming
  python3 deploy/fetch_report.py --dry-run       # 只写临时目录并校验，不进 incoming、不发布
  python3 deploy/fetch_report.py --dry-run --date 2026-11-13   # 演练某一期（数据仍是此刻快照）
  python3 deploy/fetch_report.py --force         # incoming / 仓库里已有当天文件时仍重抓（内容相同则不改写）

数据源（全部是公开、无需密钥的官方接口）：
  Alternative.me 恐惧贪婪、DefiLlama dailyRevenue（gmgn / fomo）、TehcScreener /api/v1、
  Reddit r/Monad 新帖 Atom RSS、GitHub 未登录 REST（rarefriends）、DexScreener 官方 API。
不抓 X（本机没有关注时间线连接器）：不写 x_digest，methods 里标 skipped。

原则：只写本次实际取到的数字和事实。某个源失败 → methods 标 failed / partial，对应章节省略；
不估算、不补写、不沿用旧数字。所有源都没有取到可用数字时不生成文件，退出码 1。
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

if sys.version_info < (3, 12):
    sys.exit("需要 Python 3.12 或更高版本")

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "web"))
from dailysite.validate import validate_report  # noqa: E402

SH = ZoneInfo("Asia/Shanghai")
UTC = timezone.utc
USER_AGENT = "daily-report-fetch/1.0 (+https://github.com/beamworld404-hash)"
CONTENT = REPO / "web" / "content" / "reports"
INCOMING = Path(os.environ.get("DAILY_INCOMING", "/home/ubuntu/briefs/incoming"))
LOGS = Path(os.environ.get("DAILY_LOGS", "/home/ubuntu/briefs/daily-report-incr-design/logs"))

FNG_URL = "https://api.alternative.me/fng/?limit=2"
LLAMA_URL = "https://api.llama.fi/summary/fees/{slug}?dataType=dailyRevenue"
LLAMA_PROTOCOLS = [("FOMO", "fomo"), ("GMGN", "gmgn")]  # 展示顺序与 11-12 期一致
TEHC = "https://tehcscreener.com/api/v1"
REDDIT_RSS = "https://www.reddit.com/r/Monad/new/.rss"
GH_ORG = "rarefriends"
GH_API = "https://api.github.com"
DS_API = "https://api.dexscreener.com"
DS_PROFILES = f"{DS_API}/token-profiles/latest/v1"
DS_TOKENS = DS_API + "/tokens/v1/{chain}/{addrs}"
DS_BATCH = 30  # 官方文档：tokenAddresses 最多 30 个
DS_TOP = 5
DS_MIN_LIQ = 1_000
DS_MIN_VOL = 1_000
REVENUE_DAYS = 14
TRENCH_HISTORY = 5
BOTS_ROWS = 10

FNG_ZH = {"Extreme Fear": "极度恐惧", "Fear": "恐惧", "Neutral": "中性", "Greed": "贪婪", "Extreme Greed": "极度贪婪"}
BAND_ZH = {"ded": "死寂", "cold": "冷", "active": "活跃", "hot": "热", "euphoric": "狂热"}
# Trench 分项：接口键 → (中文名, 是否为金额)
TRENCH_COMPONENTS = {
    "pad_volume": ("发射台成交额", True),
    "tokens_launched": ("新发射", False),
    "pad_revenue": ("发射台收入", True),
    "bot_volume": ("机器人成交额", True),
    "bot_fees": ("机器人手续费", True),
}


# ───────────────────────── 格式化（与 web/app/src/lib/format.ts 口径一致） ─────────────────────────


def usd(value: float) -> str:
    sign = "-" if value < 0 else ""
    n = abs(value)
    if n < 1_000:
        return f"{sign}${n:.2f}"
    div, unit = (1e3, "K") if n < 1e6 else (1e6, "M") if n < 1e9 else (1e9, "B")
    amount = math.floor((n / div + sys.float_info.epsilon) * 100 + 0.5) / 100
    return f"{sign}${amount:.2f}{unit}"


def mmdd(d: str) -> str:
    return d[5:] if len(d) == 10 else d


def moved(d: float, unit: str) -> str:
    if d > 0:
        return f"上升 {fmt_num(abs(d))} {unit}"
    if d < 0:
        return f"下降 {fmt_num(abs(d))} {unit}"
    return "持平"


def fmt_num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def sh_str(dt: datetime, seconds: bool = True) -> str:
    return dt.astimezone(SH).strftime("%Y-%m-%d %H:%M:%S" if seconds else "%Y-%m-%d %H:%M")


# ───────────────────────── HTTP（只读公开接口，不带任何密钥） ─────────────────────────


@dataclass
class Req:
    source: str
    url: str
    status: int | None
    error: str | None = None


@dataclass
class Http:
    raw_dir: Path | None = None
    log: list[Req] = field(default_factory=list)
    sleep: Callable[[float], None] = time.sleep
    timeout: float = 30

    def get(self, source: str, url: str, name: str, accept: str = "application/json", tries: int = 3) -> bytes:
        """GET 一次（429 / 5xx / 网络错误最多重试 tries-1 次）。每次尝试都记一条请求。失败抛 FetchError。"""
        last = ""
        for attempt in range(tries):
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    body = r.read()
                    self.log.append(Req(source, url, r.status))
                    if self.raw_dir:
                        self.raw_dir.mkdir(parents=True, exist_ok=True)
                        (self.raw_dir / name).write_bytes(body)
                    return body
            except urllib.error.HTTPError as e:
                self.log.append(Req(source, url, e.code, f"HTTP {e.code}"))
                last = f"HTTP {e.code}"
                if e.code != 429 and e.code < 500:
                    break
                wait = 3 * (attempt + 1)
                if e.code == 429:
                    try:
                        wait = min(30, int(e.headers.get("Retry-After", wait)))
                    except ValueError:
                        pass
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                reason = getattr(e, "reason", e)
                self.log.append(Req(source, url, None, f"网络错误：{reason}"))
                last = f"网络错误：{reason}"
                wait = 3 * (attempt + 1)
            if attempt + 1 < tries:
                self.sleep(wait)
        raise FetchError(f"{url} 失败（{last}）")

    def json(self, source: str, url: str, name: str) -> Any:
        body = self.get(source, url, name)
        try:
            return json.loads(body)
        except json.JSONDecodeError as e:
            raise FetchError(f"{url} 返回的不是 JSON：{e.msg}") from e

    def summary(self, source: str) -> str:
        rs = [r for r in self.log if r.source == source]
        if not rs:
            return "未请求"
        codes: dict[str, int] = {}
        for r in rs:
            k = str(r.status) if r.status else "网络错误"
            codes[k] = codes.get(k, 0) + 1
        return f"新请求 {len(rs)} 次（" + "、".join(f"{k} ×{v}" if v > 1 else k for k, v in codes.items()) + "）"


class FetchError(Exception):
    pass


# ───────────────────────── 上一期 ─────────────────────────


@dataclass
class Prev:
    report: dict | None
    since: datetime | None  # 覆盖窗口起点：上一期正式早报的取数开始时刻

    @property
    def date(self) -> str | None:
        return self.report["date"] if self.report else None


TS_RE = re.compile(r"(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)")


def find_prev(content: Path, date: str) -> Prev:
    """仓库里日期早于 date 的最新一期（已发布的正式期次）。"""
    best = None
    for f in sorted(content.glob("*.json")):
        if f.stem < date:
            best = f
    if not best:
        return Prev(None, None)
    rep = json.loads(best.read_text(encoding="utf-8"))
    since = None
    for p in rep.get("methods", {}).get("properties", []):
        if p.get("label") == "本次取数":
            m = TS_RE.search(p.get("value", ""))
            if m:
                since = _parse_sh(m.group(1), m.group(2))
            break
    if since is None:
        m = TS_RE.search(rep.get("issued_at", ""))
        if m:
            since = _parse_sh(m.group(1), m.group(2))
    return Prev(rep, since)


def _parse_sh(d: str, t: str) -> datetime:
    fmt = "%Y-%m-%d %H:%M:%S" if t.count(":") == 2 else "%Y-%m-%d %H:%M"
    return datetime.strptime(f"{d} {t}", fmt).replace(tzinfo=SH)


# ───────────────────────── 各数据源：取数（fetch_*）与整理（build_*） ─────────────────────────


@dataclass
class Part:
    """一个数据源的结果：章节数据 + methods 条目 + 摘要用事实。"""

    key: str  # 写进报告的顶层字段名（None 表示不写字段）
    data: dict | None
    check: dict
    source: dict
    links: list[dict] = field(default_factory=list)
    notices: list[dict] = field(default_factory=list)
    facts: dict = field(default_factory=dict)


# ---- 恐惧贪婪 ----


def build_fng(payload: dict) -> dict:
    rows = payload.get("data") or []
    if not rows:
        raise FetchError("FNG 返回空 data")

    def point(row: dict) -> dict:
        en = row["value_classification"]
        return {
            "date": datetime.fromtimestamp(int(row["timestamp"]), UTC).strftime("%Y-%m-%d"),
            "value": int(row["value"]),
            "class_en": en,
            "class_zh": FNG_ZH.get(en, en),
        }

    out = {"source": "Alternative.me", "latest": point(rows[0])}
    if len(rows) > 1:
        out["previous"] = point(rows[1])
    return out


def part_fng(http: Http) -> Part:
    src = "fng"
    try:
        fng = build_fng(http.json(src, FNG_URL, "fng.json"))
    except (FetchError, KeyError, ValueError, TypeError) as e:
        return Part("fng", None, _chk("恐惧贪婪指数", "failed", f"失败：{e}；{http.summary(src)}"),
                    {"title": "Alternative.me", "detail": f"官方 {FNG_URL}。本次取数失败，本期省略。"})
    lt = fng["latest"]
    pv = fng.get("previous")
    meta = f"{http.summary(src)}；数据日 UTC {lt['date']}"
    detail = f"官方 {FNG_URL}。数据日 UTC {lt['date']}" + (f"，上一日为 {mmdd(pv['date'])}。" if pv else "。")
    return Part("fng", fng, _chk("恐惧贪婪指数", "ok", meta), {"title": "Alternative.me", "detail": detail},
                [{"title": "Fear & Greed Index", "site": "Alternative.me", "url": "https://alternative.me/crypto/fear-and-greed-index/"}],
                facts={"fng": fng})


# ---- DefiLlama ----


def llama_series(payload: dict, today_utc: str) -> list[tuple[str, float]]:
    """totalDataChart → [(UTC 日期, 值)]，只保留完整日（早于今天 UTC）。"""
    out = []
    for ts, val in payload.get("totalDataChart") or []:
        d = datetime.fromtimestamp(int(ts), UTC).strftime("%Y-%m-%d")
        if d < today_utc and isinstance(val, (int, float)) and not isinstance(val, bool):
            out.append((d, float(val) if not float(val).is_integer() else int(val)))
    out.sort()
    return out


def build_revenue(series: dict[str, list[tuple[str, float]]], prev: dict | None, today_utc: str) -> tuple[dict, list[dict], list[str]]:
    """series: 名称 → 完整日序列。返回 (revenue, notices, 修订说明)。"""
    common = None
    for s in series.values():
        ds = {d for d, _ in s}
        common = ds if common is None else common & ds
    dates = sorted(common or [])[-REVENUE_DAYS:]
    if len(dates) < 2:
        raise FetchError("DefiLlama 可用完整日不足 2 天")
    protocols, revisions = [], []
    prev_rev = {p["name"]: p for p in (prev or {}).get("revenue", {}).get("protocols", [])} if prev else {}
    prev_dates = (prev or {}).get("revenue", {}).get("dates", []) if prev else []
    for name, s in series.items():
        m = dict(s)
        ath_d, ath_v = max(s, key=lambda x: (x[1], x[0]))
        protocols.append({
            "name": name,
            "url": f"https://defillama.com/protocol/{name.lower()}",
            "values": [m[d] for d in dates],
            "ath": {"usd": ath_v, "date": ath_d},
        })
        old = prev_rev.get(name)
        if old:
            for d, ov in zip(prev_dates, old.get("values", [])):
                if d in m and abs(m[d] - ov) >= 0.01:
                    revisions.append(f"{name} 的 UTC {mmdd(d)} 读数已由 DefiLlama 从上一期报道的 {usd(ov)} 修订为 {usd(m[d])}")
    latest = dates[-1]
    yday = (datetime.strptime(today_utc, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    caption = f"最新完整日 UTC {latest}。"
    if latest < yday:
        caption += f"UTC {mmdd(yday)} 尚未出现在数据中。"
    caption += "不是实时行情。"
    notes = []
    if revisions:
        notes.append("；".join(revisions) + "。图表使用修订后的值。")
    rev = {"source": "DefiLlama dailyRevenue", "caption": caption, "dates": dates, "protocols": protocols}
    if notes:
        rev["notes"] = notes
    notices = []
    if revisions:
        notices.append({"tone": "warning", "title": "数据修订",
                        "text": "；".join(revisions) + "。下方收入图表使用修订后的值。"})
    return rev, notices, revisions


def part_revenue(http: Http, prev: dict | None, now: datetime) -> Part:
    src = "llama"
    today_utc = now.astimezone(UTC).strftime("%Y-%m-%d")
    series, errs = {}, []
    for name, slug in LLAMA_PROTOCOLS:
        try:
            s = llama_series(http.json(src, LLAMA_URL.format(slug=slug), f"llama-{slug}.json"), today_utc)
            if len(s) < 2:
                raise FetchError("完整日不足 2 天")
            series[name] = s
        except (FetchError, KeyError, ValueError, TypeError) as e:
            errs.append(f"{name}：{e}")
    links = [{"title": n, "site": "DefiLlama", "url": f"https://defillama.com/protocol/{s}"} for n, s in LLAMA_PROTOCOLS]
    title = "GMGN / FOMO dailyRevenue"
    base = "新请求 summary/fees/gmgn 与 summary/fees/fomo（dataType=dailyRevenue）"
    if not series:
        return Part("revenue", None, _chk(title, "failed", f"失败：{'；'.join(errs)}；{http.summary(src)}"),
                    {"title": "DefiLlama", "detail": f"{base}。本次取数失败，本期省略收入章节。"}, links)
    try:
        rev, notices, revisions = build_revenue(series, prev, today_utc)
    except FetchError as e:
        return Part("revenue", None, _chk(title, "failed", f"失败：{e}；{http.summary(src)}"),
                    {"title": "DefiLlama", "detail": f"{base}。{e}，本期省略收入章节。"}, links)
    latest = rev["dates"][-1]
    status = "partial" if errs else "ok"
    meta = f"{http.summary(src)}；最新完整日 UTC {latest}"
    if revisions:
        meta += "；" + "、".join(sorted({r.split(" 的 ")[0] for r in revisions})) + " 有历史读数被数据源修订"
    if errs:
        meta += "；失败：" + "；".join(errs)
    detail = f"{base}。只取已公布的完整 UTC 日，最新为 {latest}。" + ("；".join(revisions) + "。" if revisions else "") + "不是实时行情。"
    return Part("revenue", rev, _chk(title, status, meta), {"title": "DefiLlama", "detail": detail}, links, notices,
                facts={"revenue": rev, "revisions": revisions})


# ---- TehcScreener ----


def build_tehc(status: dict | None, trench: dict | None, pads: dict | None, bots: dict | None, chains: dict | None,
               prev: dict | None, revenue: dict | None) -> tuple[dict, list[dict], list[str]]:
    out: dict[str, Any] = {"source": "tehcscreener.com，底层 Allium"}
    notices, revised = [], []
    cap = []
    if status and status.get("synced_at"):
        raw = str(status["synced_at"])
        try:
            dt = datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)
            cap.append(f"status.synced_at 为 {raw[:19]} UTC（{sh_str(dt)} 北京时间）。")
        except ValueError:
            cap.append(f"status.synced_at 为 {raw}。")
    if trench and trench.get("today"):
        t = trench["today"]
        hist = [{"date": h["day"], "score": h["score"]} for h in trench.get("history", []) if h.get("day") <= t["day"]]
        hist = hist[-TRENCH_HISTORY:]
        if not hist or hist[-1]["date"] != t["day"]:
            hist.append({"date": t["day"], "score": t["score"]})
        by_day = {h["day"]: h["score"] for h in trench.get("history", [])}
        notes = []
        if len(hist) >= 2:
            p = hist[-2]
            notes.append(f"较 {mmdd(p['date'])} 的 {p['score']} {moved(t['score'] - p['score'], '分')}")
        prev_tr = ((prev or {}).get("tehc") or {}).get("trench") if prev else None
        if prev_tr:
            for h in prev_tr.get("history", []):
                cur = by_day.get(h["date"])
                if cur is not None and cur != h["score"]:
                    revised.append(f"{mmdd(h['date'])} 由 {h['score']} 变为 {cur}")
        comps = []
        weights = (trench.get("method") or {}).get("weights") or {}
        for k, c in (t.get("components") or {}).items():
            name, money = TRENCH_COMPONENTS.get(k, (k, True))
            row = {"name": name, ("usd" if money else "count"): c["value"], "percentile": c["percentile"]}
            comps.append(row)
        wtxt = "、".join(f"{TRENCH_COMPONENTS.get(k, (k,))[0]} {round(w * 100)}%" for k, w in weights.items())
        new_names = []
        if prev_tr and prev_tr.get("components"):
            old = {c["name"] for c in prev_tr["components"]}
            new_names = [c["name"] for c in comps if c["name"] not in old]
        if revised:
            msg = "接口当前历史与上一期报道不同（" + "；".join(revised) + "），本期使用接口当前值"
            if new_names:
                msg += "；接口分项新增：" + "、".join(new_names)
            notes.append(msg)
            notices.append({"tone": "warning", "title": "Trench 历史已变化",
                            "text": "TehcScreener 的 Trench 历史分数与上一期报道不同：" + "；".join(revised)
                            + "。" + (f"接口分项新增{'、'.join(new_names)}。" if new_names else "")
                            + "本期图表和比较一律用接口当前值，不与上一期报道的旧分数直接比较。"})
        out["trench"] = {
            "date": t["day"], "score": t["score"], "label": t["band"], "label_zh": BAND_ZH.get(t["band"], t["band"]),
            "note": "；".join(notes) + "。" if notes else None,
            "history": hist,
            "components": comps,
            "components_note": (f"接口 method.weights：{wtxt}。" if wtxt else "")
            + "分项合计与发射台、机器人接口汇总不必相同，分别按各自接口列示。",
        }
        if out["trench"]["note"] is None:
            del out["trench"]["note"]
        cap.append(f"Trench 数据日 {t['day']}。")
    if pads and pads.get("pads"):
        rows = sorted(pads["pads"], key=lambda x: -x["volume_usd"])
        out["launchpads"] = {
            "caption": f"window={pads.get('window')}，截至 {pads.get('through')}。",
            "total": {"volume_usd": sum(r["volume_usd"] for r in rows), "launches": sum(r["tokens_launched"] for r in rows)},
            "rows": [{"name": f"{r['chain']} / {r.get('display_name') or r['pad']}", "volume_usd": r["volume_usd"],
                      "launches": r["tokens_launched"]} for r in rows],
        }
        cap.append(f"发射台 through {pads.get('through')}。")
    if bots and bots.get("series"):
        rows = [{"name": s.get("display_name") or s["name"], "id": s["name"],
                 "volume_usd": round(sum(s["volume_usd"]), 2), "fees_usd": round(sum(s["fees_usd"]), 2)} for s in bots["series"]]
        rows.sort(key=lambda x: -x["volume_usd"])
        blk = {
            "caption": f"window={bots.get('window')}，截至 {bots.get('through')}；按成交额列前 {min(BOTS_ROWS, len(rows))}，合计含全部 {len(rows)} 个。",
            "total": {"volume_usd": round(sum(r["volume_usd"] for r in rows), 2), "fees_usd": round(sum(r["fees_usd"] for r in rows), 2)},
            "rows": [{k: r[k] for k in ("name", "volume_usd", "fees_usd")} for r in rows[:BOTS_ROWS]],
        }
        by_id = {r["id"].lower(): r for r in rows}
        if revenue and ("gmgn" in by_id or "fomo" in by_id):
            last = revenue["dates"][-1]
            rv = {p["name"]: p["values"][-1] for p in revenue["protocols"]}
            tb = "、".join(f"{by_id[k]['name']} 手续费 {usd(by_id[k]['fees_usd'])}" for k in ("gmgn", "fomo") if k in by_id)
            dl = "、".join(f"{n} {usd(v)}" for n, v in rv.items())
            blk["warning"] = (f"TehcScreener 中 {tb}（截至 {bots.get('through')}），与 DefiLlama dailyRevenue（{dl}，均为 UTC {mmdd(last)}）"
                              "口径不同，不可直接对照或替换。")
        out["bots"] = blk
        cap.append(f"机器人 through {bots.get('through')}。")
    if chains and chains.get("chains"):
        rows = [{"name": c.get("display_name") or c["chain"], "dex_volume_usd": c["latest"]["dex_volume_usd"],
                 "wallets": c["latest"]["active_wallets"], "date": c["through"]} for c in chains["chains"]]
        rows.sort(key=lambda x: -x["dex_volume_usd"])
        by_date: dict[str, list[str]] = {}
        for r in rows:
            by_date.setdefault(r["date"], []).append(r["name"])
        if len(by_date) == 1:
            ccap = f"TehcScreener /chains。各链 latest 均截至 {rows[0]['date']}。"
        else:
            main = max(by_date, key=lambda d: len(by_date[d]))
            others = "；".join(f"{'、'.join(n)} 截至 {d}" for d, n in sorted(by_date.items()) if d != main)
            ccap = f"TehcScreener /chains。{'、'.join(by_date[main])} 的 latest 截至 {main}；{others}，日期不一致。"
        out["chains"] = {"caption": ccap, "rows": rows}
    out["caption"] = "".join(cap) or "TehcScreener 部分接口未取到。"
    return out, notices, revised


def part_tehc(http: Http, prev: dict | None, revenue: dict | None) -> Part:
    src = "tehc"
    got: dict[str, Any] = {}
    errs = []
    for key, path in (("status", "/status"), ("trench", "/trench"), ("launchpads", "/launchpads?window=1d"),
                      ("bots", "/bots?window=1d"), ("chains", "/chains")):
        try:
            got[key] = http.json(src, TEHC + path, f"tehc-{key}.json")
        except FetchError as e:
            errs.append(f"{key}：{e}")
    links = [{"title": "TehcScreener", "site": "tehcscreener.com", "url": "https://tehcscreener.com/"},
             {"title": "TehcScreener API 文档", "site": "tehcscreener.com", "url": "https://tehcscreener.com/api"}]
    title = "TehcScreener"
    detail_base = "仅官方 /api/v1：status、trench、launchpads（window=1d）、bots（window=1d）、chains。未调未文档化接口，未请求 RWA。"
    try:
        tehc, notices, revised = build_tehc(got.get("status"), got.get("trench"), got.get("launchpads"), got.get("bots"),
                                            got.get("chains"), prev, revenue)
    except (KeyError, TypeError, ValueError) as e:
        return Part("tehc", None, _chk(title, "failed", f"返回格式异常：{e}；{http.summary(src)}"),
                    {"title": "TehcScreener", "detail": detail_base + "本次返回格式异常，本期省略。"}, links)
    has = [k for k in ("trench", "launchpads", "bots", "chains") if k in tehc]
    if not has:
        return Part("tehc", None, _chk(title, "failed", f"失败：{'；'.join(errs)}；{http.summary(src)}"),
                    {"title": "TehcScreener", "detail": detail_base + "本次取数失败，本期省略。"}, links)
    meta = f"{http.summary(src)}；" + tehc["caption"].rstrip("。")
    if revised:
        meta += "；Trench 历史分数与上一期报道不同"
    if errs:
        meta += "；失败：" + "；".join(errs)
    return Part("tehc", tehc, _chk(title, "partial" if errs else "ok", meta),
                {"title": "TehcScreener", "detail": detail_base + ("Trench 历史与上一期报道不同，见修订提示。" if revised else "")},
                links, notices, facts={"tehc": tehc, "trench_revised": revised})


# ---- Reddit ----

ATOM = "{http://www.w3.org/2005/Atom}"


def build_reddit(xml_bytes: bytes, since: datetime | None, until: datetime) -> tuple[dict, int, bool]:
    root = ET.fromstring(xml_bytes)
    entries = root.findall(f"{ATOM}entry")
    posts = []
    for e in entries:
        upd = e.findtext(f"{ATOM}updated") or ""
        try:
            t = datetime.fromisoformat(upd)
        except ValueError:
            continue
        if since and t < since:
            continue
        if t > until:
            continue
        link = e.find(f"{ATOM}link")
        posts.append({
            "title": html.unescape(e.findtext(f"{ATOM}title") or "").strip(),
            "url": link.get("href") if link is not None else "",
            "author": (e.findtext(f"{ATOM}author/{ATOM}name") or "").strip(),
            "comments": None,
        })
    posts = [p for p in posts if p["title"] and p["url"].startswith("https://") and p["author"]]
    # RSS 只返回最新若干条；如果全部条目都在窗口内，可能有更早的新帖没进 RSS
    maybe_truncated = bool(entries) and since is not None and len(posts) == len(entries)
    since_txt = f"{sh_str(since, seconds=False)}（北京时间）" if since else "（无上一期）"
    if posts:
        summary = f"新帖 RSS 中按条目更新时间自 {since_txt}起有 {len(posts)} 篇新帖，下面列出标题与作者，不做内容概括。"
    else:
        summary = f"新帖 RSS 中自 {since_txt}起没有新条目。这只代表新帖 RSS 为空，不等于没有讨论。"
    note = "本次未取评论 RSS，评论数记为 --。这是论坛讨论，不是行情判断。"
    if maybe_truncated:
        note = f"RSS 本次返回的 {len(entries)} 条全部在窗口内，更早的新帖可能未列出。" + note
    return ({"subreddit": "r/Monad", "url": "https://www.reddit.com/r/Monad/", "since": since_txt,
             "summary": summary, "note": note, "posts": posts}, len(entries), maybe_truncated)


def part_reddit(http: Http, since: datetime | None, now: datetime) -> Part:
    src = "reddit"
    title = "r/Monad 新帖 RSS"
    detail = "只用官方新帖 Atom RSS（/r/Monad/new/.rss），按条目更新时间筛选。不取评论 RSS，评论数写 --。无新帖只指新帖 RSS 为空，不等于无讨论。"
    links = [{"title": "r/Monad", "site": "Reddit", "url": "https://www.reddit.com/r/Monad/"}]
    try:
        rd, n, trunc = build_reddit(http.get(src, REDDIT_RSS, "reddit-new.xml", accept="application/atom+xml"), since, now)
    except (FetchError, ET.ParseError) as e:
        return Part("reddit", None, _chk(title, "failed", f"失败：{e}；{http.summary(src)}"),
                    {"title": "Reddit", "detail": detail + "本次取数失败，本期省略。"}, links)
    st = "partial" if trunc else "ok"
    meta = f"{http.summary(src)}；RSS 共 {n} 条，窗口内 {len(rd['posts'])} 篇" + ("；可能未覆盖全部" if trunc else "")
    return Part("reddit", rd, _chk(title, st, meta), {"title": "Reddit", "detail": detail}, links,
                facts={"reddit": rd})


def reddit_comments_check() -> dict:
    return _chk("r/Monad 评论 RSS", "skipped", "本次未请求，避免为补评论数增加抓取；评论数记为 --")


# ---- GitHub ----


def build_github(repos: list[dict], pulls: dict[str, list[dict]], since: datetime | None) -> dict:
    def after(ts: str | None) -> bool:
        if not ts or since is None:
            return False
        return datetime.fromisoformat(ts.replace("Z", "+00:00")) >= since

    bits = []
    for r in repos:
        if r.get("private"):
            continue
        name = r["name"]
        if after(r.get("created_at")):
            bits.append(f"新仓库 [{name}]({r['html_url']})")
        elif after(r.get("pushed_at")):
            bits.append(f"[{name}]({r['html_url']}) 有推送（pushed_at {sh_str(datetime.fromisoformat(r['pushed_at'].replace('Z', '+00:00')), False)}）")
        for p in pulls.get(name, []):
            if after(p.get("updated_at")):
                state = "已合并" if p.get("merged_at") else ("已关闭" if p.get("state") == "closed" else "进行中")
                bits.append(f"{name} PR [#{p['number']} {p['title']}]({p['html_url']}) 有更新（{state}）")
    since_txt = f"{sh_str(since, False)}（北京时间）" if since else "上一期"
    if bits:
        text = f"自 {since_txt}起：" + "；".join(bits) + "。仅公开仓库。"
    else:
        text = f"自 {since_txt}起公开仓库与 PR 暂无新更新。仅公开仓库。"
    return {"org": GH_ORG, "url": f"https://github.com/{GH_ORG}", "updated": bool(bits), "text": text}


def part_github(http: Http, since: datetime | None) -> Part:
    src = "github"
    title = f"{GH_ORG} 仓库与 PR"
    detail = "未登录公开 REST：先拉组织仓库再按库拉 PR（state=all，按更新时间倒序），未使用 search，未克隆仓库。仅可见公开仓库。"
    links = [{"title": GH_ORG, "site": "GitHub", "url": f"https://github.com/{GH_ORG}"}]
    try:
        repos = http.json(src, f"{GH_API}/orgs/{GH_ORG}/repos?per_page=100&type=public", "gh-repos.json")
        pulls = {}
        for r in repos:
            if r.get("private"):
                continue
            pulls[r["name"]] = http.json(src, f"{GH_API}/repos/{GH_ORG}/{r['name']}/pulls?state=all&sort=updated&direction=desc&per_page=30",
                                         f"gh-pulls-{r['name']}.json")
        gh = build_github(repos, pulls, since)
    except (FetchError, KeyError, TypeError, ValueError) as e:
        return Part("github", None, _chk(title, "failed", f"失败：{e}；{http.summary(src)}"),
                    {"title": "GitHub", "detail": detail + "本次取数失败，本期省略。"}, links)
    meta = f"{http.summary(src)}；" + ("本窗口有更新" if gh["updated"] else "本窗口无推送、新仓库或 PR 变动")
    return Part("github", gh, _chk(title, "ok", meta), {"title": "GitHub", "detail": detail}, links, facts={"github": gh})


# ---- DexScreener（替代 Defined / Codex） ----

DS_TITLE = f"DexScreener 最新代币资料 · 按 24h 成交额前 {DS_TOP}"
DS_URL_RE = re.compile(r"^https://dexscreener\.com/([a-z0-9-]+)/[A-Za-z0-9]+$")


def pick_pair(token: str, pairs: list[dict]) -> tuple[dict | None, str]:
    """某代币作为 baseToken 的交易对里流动性最高的一个。返回 (pair, 不入选原因)。"""
    own = [p for p in pairs if (p.get("baseToken") or {}).get("address", "").lower() == token.lower()]
    if not own:
        return None, "无以该代币为 base 的交易对"
    with_liq = [p for p in own if isinstance((p.get("liquidity") or {}).get("usd"), (int, float))]
    if not with_liq:
        return None, "接口未给流动性"
    return max(with_liq, key=lambda p: p["liquidity"]["usd"]), ""


def build_dexscreener(profiles: list[dict], pairs_by_chain: dict[str, list[dict]], fetched: datetime,
                      prev: dict | None, failed_chains: list[str]) -> tuple[dict | None, dict]:
    """返回 (dexscreener 字段或 None, 统计)。"""
    seen, toks = set(), []
    for pr in profiles:
        c, a = pr.get("chainId"), pr.get("tokenAddress")
        if not c or not a or (c, a.lower()) in seen:
            continue
        seen.add((c, a.lower()))
        toks.append((c, a))
    stats = {"profiles": len(profiles), "tokens": len(toks), "chains": len({c for c, _ in toks}),
             "no_pair": 0, "no_liq": 0, "below": 0, "bad_url": 0, "no_vol": 0, "eligible": 0}
    rows = []
    for c, a in toks:
        if c in failed_chains:
            continue
        p, why = pick_pair(a, pairs_by_chain.get(c, []))
        if not p:
            stats["no_pair" if why.startswith("无") else "no_liq"] += 1
            continue
        vol = (p.get("volume") or {}).get("h24")
        if not isinstance(vol, (int, float)):
            stats["no_vol"] += 1
            continue
        url = p.get("url") or ""
        m = DS_URL_RE.match(url)
        if not m or m.group(1) != c or p.get("chainId") != c:
            stats["bad_url"] += 1
            continue
        liq = p["liquidity"]["usd"]
        if liq < DS_MIN_LIQ or vol < DS_MIN_VOL:
            stats["below"] += 1
            continue
        row = {
            "symbol": p["baseToken"].get("symbol") or a[:6],
            "chain": c,
            "url": url,
            "address": a,
            "dex": p.get("dexId"),
            "liquidity_usd": liq,
            "volume_24h_usd": vol,
            "narrative": None,
        }
        if isinstance(p.get("pairCreatedAt"), (int, float)):
            row["pair_created_at"] = sh_str(datetime.fromtimestamp(p["pairCreatedAt"] / 1000, UTC), False)
        rows.append(row)
    stats["eligible"] = len(rows)
    rows.sort(key=lambda r: (-r["volume_24h_usd"], -r["liquidity_usd"]))
    top = rows[:DS_TOP]
    if not top:
        return None, stats

    # 与上一榜对比：只有上一期也是 DexScreener 同口径榜单时才做
    prev_ds = (prev or {}).get("dexscreener") if prev else None
    if prev_ds:
        old = {(t.get("chain"), (t.get("address") or "").lower()): i + 1 for i, t in enumerate(prev_ds.get("tokens", []))}
        new_keys = set()
        for i, t in enumerate(top):
            k = (t["chain"], t["address"].lower())
            new_keys.add(k)
            t["status"] = "新上" if k not in old else (f"{old[k]} → {i + 1}" if old[k] != i + 1 else f"仍第 {i + 1}")
        up = [t["symbol"] for t in top if t["status"] == "新上"]
        dropped = [t["symbol"] for t in prev_ds.get("tokens", []) if (t.get("chain"), (t.get("address") or "").lower()) not in new_keys]
        parts = []
        if up:
            parts.append("新上 " + "、".join(up))
        stay = [f"{t['symbol']}（{t['status']}）" for t in top if t["status"] != "新上"]
        if stay:
            parts.append("仍在榜 " + "、".join(stay))
        if dropped:
            parts.append("掉出 " + "、".join(dropped))
        changes = f"与上一期（{prev['date']}，抓取于 {prev_ds.get('fetched_at')}）同口径榜相比：" + "；".join(parts) + "。"
    elif prev and prev.get("defined"):
        changes = (f"数据源已由 Defined / Codex 更换为 DexScreener 官方接口。上一期（{prev['date']}）是 Defined「≤24h 新池 · "
                   "trendingScore4」榜，与本榜口径不同，本期不做新上 / 掉出对比。")
    else:
        changes = "上一期没有同口径的 DexScreener 榜，本期不做对比。"

    skipped = []
    for k, label in (("no_pair", "无以该代币为 base 的交易对"), ("no_liq", "接口未给流动性（如仍在联合曲线上）"),
                     ("no_vol", "接口未给 24h 成交额"), ("bad_url", "链接不是 dexscreener.com 同链页面"),
                     ("below", f"流动性或 24h 成交额低于 {usd(DS_MIN_LIQ)}")):
        if stats[k]:
            skipped.append(f"{label} {stats[k]} 个")
    if failed_chains:
        skipped.append(f"{'、'.join(failed_chains)} 链交易对请求失败")
    fetched_txt = f"{sh_str(fetched)}（北京时间）"
    ds = {
        "title": DS_TITLE,
        "fetched_at": fetched_txt,
        "caption": ("取自 DexScreener 官方 API：GET /token-profiles/latest/v1 返回的最新代币资料（token profiles）列表，"
                    "按资料时间给出，不是「新池」榜，也不按热度排序；再用 GET /tokens/v1/{chainId}/{地址} 取交易对数据，"
                    f"按 24h 成交额排序取前 {DS_TOP}。与旧 Defined / Codex「≤24h 新池 · trendingScore4」榜口径不同，"
                    "不能与之直接比较。上榜不代表项目质量或安全，非交易建议。"),
        "changes": changes,
        "tokens": top,
        "method": (f"本次资料列表共 {stats['profiles']} 条，去重后 {stats['tokens']} 个代币，分布在 {stats['chains']} 条链；"
                   f"按链分批（每批 ≤{DS_BATCH} 个地址）请求 /tokens/v1。每个代币只取它作为 baseToken 的交易对中 "
                   f"liquidity.usd 最高的一个；要求流动性 ≥{usd(DS_MIN_LIQ)}、volume.h24 ≥{usd(DS_MIN_VOL)}，"
                   f"按 volume.h24 降序、同额按流动性降序。符合条件 {stats['eligible']} 个"
                   + (f"；未入选：{'；'.join(skipped)}" if skipped else "")
                   + f"。金额为抓取时刻 {fetched_txt}接口返回值。链接为接口返回的交易对页面 url（已核对为 https://dexscreener.com/{{链}}/… 且链一致）。"
                   "未调用 Defined / Codex，未爬网页。项目资料描述由项目方自行提交，未经核实，故不写叙述。"),
    }
    return ds, stats


def part_dexscreener(http: Http, prev: dict | None) -> Part:
    src = "dexscreener"
    title = "DexScreener 最新代币资料"
    links = [{"title": "DexScreener API 文档", "site": "docs.dexscreener.com", "url": "https://docs.dexscreener.com/api/reference"},
             {"title": "DexScreener", "site": "dexscreener.com", "url": "https://dexscreener.com/"}]
    base = ("官方 HTTP API（docs.dexscreener.com/api/reference）：GET /token-profiles/latest/v1（限 60 次/分）取最新代币资料，"
            "GET /tokens/v1/{chainId}/{tokenAddresses}（限 300 次/分，每次 ≤30 个地址）取交易对。无需密钥。"
            "不再调用 Defined / Codex。")
    try:
        profiles = http.json(src, DS_PROFILES, "ds-profiles.json")
        if not isinstance(profiles, list):
            raise FetchError("token-profiles 返回的不是列表")
    except FetchError as e:
        return Part("dexscreener", None, _chk(title, "failed", f"失败：{e}；{http.summary(src)}"),
                    {"title": "DexScreener", "detail": base + "本次取数失败，本期省略。"}, links)
    by_chain: dict[str, list[str]] = {}
    for pr in profiles:
        c, a = pr.get("chainId"), pr.get("tokenAddress")
        if isinstance(c, str) and isinstance(a, str) and re.fullmatch(r"[a-z0-9-]+", c) and re.fullmatch(r"[A-Za-z0-9]+", a):
            if a not in by_chain.setdefault(c, []):
                by_chain[c].append(a)
    pairs: dict[str, list[dict]] = {}
    failed = []
    for c, addrs in sorted(by_chain.items()):
        pairs[c] = []
        for i in range(0, len(addrs), DS_BATCH):
            batch = addrs[i:i + DS_BATCH]
            try:
                got = http.json(src, DS_TOKENS.format(chain=c, addrs=",".join(batch)), f"ds-tokens-{c}-{i // DS_BATCH}.json")
                if isinstance(got, list):
                    pairs[c].extend(got)
            except FetchError:
                failed.append(c)
                break
    fetched = datetime.now(UTC)
    try:
        ds, stats = build_dexscreener(profiles, pairs, fetched, prev, failed)
    except (KeyError, TypeError, ValueError) as e:
        return Part("dexscreener", None, _chk(title, "failed", f"返回格式异常：{e}；{http.summary(src)}"),
                    {"title": "DexScreener", "detail": base + "本次返回格式异常，本期省略。"}, links)
    if ds is None:
        return Part("dexscreener", None,
                    _chk(title, "partial", f"{http.summary(src)}；资料 {stats['profiles']} 条，无符合条件的交易对，本期省略此章"),
                    {"title": "DexScreener", "detail": base}, links)
    st = "partial" if failed else "ok"
    meta = f"{http.summary(src)}；资料 {stats['profiles']} 条，符合条件 {stats['eligible']} 个，取前 {len(ds['tokens'])}"
    if failed:
        meta += f"；{'、'.join(failed)} 链交易对请求失败"
    return Part("dexscreener", ds, _chk(title, st, meta), {"title": "DexScreener", "detail": base}, links,
                facts={"dexscreener": ds})


def x_check() -> tuple[dict, dict]:
    return (_chk("关注账号 X 摘要", "skipped", "本机没有 beam 的 X 关注时间线连接器，本期未抓取，不写 X 摘要"),
            {"title": "X", "detail": "本期未读取 X。出报改由东京本机脚本自动完成，本机没有 beam 的 X 连接器；不抓网页、不补写摘要。"})


def _chk(text: str, status: str, meta: str) -> dict:
    return {"text": text, "status": status, "meta": meta}


# ───────────────────────── 组装整期 ─────────────────────────


def compose(date: str, parts: dict[str, Part], prev: Prev, started: datetime, finished: datetime, http: Http,
            raw_dir: Path | None) -> dict:
    f = {k: p.facts for k, p in parts.items()}
    sentences, highlights = [], []

    rev = parts["revenue"].data
    if rev:
        latest = rev["dates"][-1]
        segs = []
        for p in rev["protocols"]:
            v = p["values"][-1]
            segs.append(f"{p['name']} {usd(v)}（占历史最高 {v / p['ath']['usd'] * 100:.2f}%）")
        revs = f["revenue"].get("revisions") or []
        tail = "；" + "、".join(sorted({r.split(' 的 ')[0] for r in revs})) + " 此前报道的读数已被数据源修订" if revs else ""
        sentences.append(f"DefiLlama 最新完整日为 UTC {mmdd(latest)}：收入 " + "，".join(segs) + tail + "。")
        highlights.append(f"DefiLlama 最新完整日 UTC {latest}：" + "；".join(segs) + "。" + ("修订：" + "；".join(revs) + "。" if revs else ""))

    tehc = parts["tehc"].data
    tr = (tehc or {}).get("trench")
    if tr:
        h = tr.get("history") or []
        cmp = ""
        if len(h) >= 2:
            cmp = f"，较 {mmdd(h[-2]['date'])} 的 {h[-2]['score']} {moved(tr['score'] - h[-2]['score'], '分')}"
        rv = "；接口历史分数与上一期报道不同，已按当前值展示" if f["tehc"].get("trench_revised") else ""
        sentences.append(f"TehcScreener Trench {mmdd(tr['date'])} 为 {tr['score']}（{tr['label_zh']}）{cmp}{rv}。")
        highlights.append(f"TehcScreener Trench {tr['date']} 为 {tr['score']}（{tr['label_zh']}）{cmp}。")
    elif tehc:
        highlights.append(f"TehcScreener：{tehc['caption']}")

    fng = parts["fng"].data
    if fng:
        lt, pv = fng["latest"], fng.get("previous")
        cmp = f"，较 {mmdd(pv['date'])} 的 {pv['value']} {moved(lt['value'] - pv['value'], '点')}" if pv else ""
        sentences.append(f"恐惧贪婪指数 {lt['value']}（{lt['class_zh']}）{cmp}。")
        highlights.append(f"恐惧贪婪指数 {lt['value']}（{lt['class_zh']}）{cmp}。")

    ds = parts["dexscreener"].data
    if ds:
        names = "、".join(t["symbol"] for t in ds["tokens"])
        cmp = "与上一期 Defined 新池榜口径不同，不做对比" if prev.report and prev.report.get("defined") and not prev.report.get("dexscreener") else ""
        highlights.append(f"DexScreener 最新代币资料按 24h 成交额前 {len(ds['tokens'])}：{names}" + (f"（{cmp}）" if cmp else "") + "。")
        if not sentences:
            sentences.append(highlights[-1])

    rd, gh = parts["reddit"].data, parts["github"].data
    comm = []
    if rd:
        comm.append(f"r/Monad 新帖 RSS 本窗口有 {len(rd['posts'])} 篇新帖" if rd["posts"] else "r/Monad 新帖 RSS 本窗口无新帖")
    if gh:
        comm.append(f"{GH_ORG} 公开仓库与 PR {'有更新' if gh['updated'] else '暂无新更新'}")
    if comm:
        highlights.append("；".join(comm) + "。")
    highlights.append("本期没有 X 摘要：出报改由本机脚本完成，本机没有关注时间线的 X 连接器。")

    failed = [p.check["text"] for p in parts.values() if p.check["status"] == "failed"]
    notices = []
    for p in parts.values():
        notices.extend(p.notices)
    if ds and prev.report and prev.report.get("defined") and not prev.report.get("dexscreener"):
        notices.append({"tone": "info", "title": "新池榜数据源更换",
                        "text": "原 Defined / Codex 新池榜改为 DexScreener 官方接口的「最新代币资料 · 按 24h 成交额」榜，"
                                "两者端点、筛选和排序都不同，本期与上一期 Defined 榜不可直接比较。"})
    if failed:
        notices.append({"tone": "warning", "title": "部分数据源失败",
                        "text": "以下数据源本次取数失败，对应章节已省略，未用旧数字代替：" + "、".join(failed) + "。"})

    since_txt = f"{sh_str(prev.since)}（北京时间）" if prev.since else None
    if since_txt:
        coverage = f"自上次正式早报 {prev.date} 取数开始 {since_txt}至本次取数 {sh_str(finished)}（北京时间），并包含上一自然日 {_yday(date)}。"
    else:
        coverage = f"未找到上一期正式早报，Reddit 与 GitHub 按 RSS / 接口当前返回列出。本次取数截至 {sh_str(finished)}（北京时间）。"
    coverage += f"取数自 {started.astimezone(SH).strftime('%H:%M:%S')} 起，由东京本机脚本自动抓取。"

    reqs = len(http.log)
    ok = sum(1 for r in http.log if r.status == 200)
    bad = [r for r in http.log if r.status != 200]
    props = [
        {"label": "本次取数", "value": f"{sh_str(started)}–{finished.astimezone(SH).strftime('%H:%M:%S')}（北京时间）；东京本机 deploy/fetch-report.sh 自动出报"},
        {"label": "新请求", "value": f"公开 HTTP 请求 {reqs} 次，{ok} 次 200"
         + ("；非 200：" + "；".join(f"{k} ×{v}" if v > 1 else k for k, v in _count(f"{r.source} {r.error}" for r in bad).items())
            + "（429 / 5xx / 网络错误会重试，结果见下方各项）" if bad else "")
         + "。未使用任何密钥；未请求评论 RSS；未读取 X。"},
    ]
    if raw_dir:
        props.append({"label": "原始响应", "value": f"本机仓库外 {raw_dir.name}（logs/runs 下）"})

    checklist = [parts["reddit"].check, reddit_comments_check(), parts["github"].check, parts["revenue"].check,
                 parts["tehc"].check, parts["fng"].check, parts["dexscreener"].check, x_check()[0]]
    sources = [parts[k].source for k in ("reddit", "github", "revenue", "tehc", "fng", "dexscreener")] + [x_check()[1]]
    links = [ln for k in ("reddit", "github", "revenue", "tehc", "fng", "dexscreener") for ln in parts[k].links]

    report: dict[str, Any] = {
        "schema_version": 1,
        "date": date,
        "edition": "早报",
        "issued_at": finished.astimezone(SH).strftime("%Y-%m-%d %H:%M"),
        "coverage": coverage,
        "summary": "".join(sentences[:3]) or "本期只取到部分数据，详见取数与来源。",
        "highlights": highlights[:6],
    }
    if notices:
        report["notices"] = notices
    for key in ("fng", "revenue", "tehc", "dexscreener", "reddit", "github"):
        if parts[key].data is not None:
            report[key] = parts[key].data
    report["methods"] = {"properties": props, "checklist": checklist, "sources": sources, "links": links}
    return report


def _count(xs) -> dict[str, int]:
    out: dict[str, int] = {}
    for x in xs:
        out[x] = out.get(x, 0) + 1
    return out


def _yday(date: str) -> str:
    return (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")


NUMERIC = ("fng", "revenue", "tehc", "dexscreener")


def run_fetch(date: str, http: Http, content: Path = CONTENT, raw_dir: Path | None = None) -> dict:
    prev = find_prev(content, date)
    started = datetime.now(UTC)
    parts: dict[str, Part] = {}
    parts["fng"] = part_fng(http)
    parts["revenue"] = part_revenue(http, prev.report, started)
    parts["tehc"] = part_tehc(http, prev.report, parts["revenue"].data)
    parts["reddit"] = part_reddit(http, prev.since, started)
    parts["github"] = part_github(http, prev.since)
    parts["dexscreener"] = part_dexscreener(http, prev.report)
    finished = datetime.now(UTC)
    if not any(parts[k].data for k in NUMERIC):
        raise FetchError("恐惧贪婪、DefiLlama、TehcScreener、DexScreener 全部失败，不生成报告："
                         + "；".join(f"{parts[k].check['text']}：{parts[k].check['meta']}" for k in NUMERIC))
    return compose(date, parts, prev, started, finished, http, raw_dir)


# ───────────────────────── 命令行 ─────────────────────────


def dump(report: dict) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2) + "\n"


def validate_file(path: Path, date: str) -> list[str]:
    """把单个文件放进只含它的临时目录，用 web/check.py --content 校验（与发布时同一套规则）。"""
    errs = validate_report(json.loads(path.read_text(encoding="utf-8")), date)
    if errs:
        return errs
    with tempfile.TemporaryDirectory(prefix="daily-check-") as d:
        shutil.copy(path, Path(d) / f"{date}.json")
        r = subprocess.run([sys.executable, str(REPO / "web" / "check.py"), "--content", d], capture_output=True, text=True)
        if r.returncode != 0:
            return [(r.stderr or r.stdout).strip()]
    return []


def prune_runs(root: Path, keep: int = 30) -> None:
    runs = sorted(p for p in root.glob("*") if p.is_dir())
    for p in runs[:-keep]:
        shutil.rmtree(p, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", help="期次日期 YYYY-MM-DD（默认今天，上海时间）。正式出报只能是今天；--dry-run 可任意")
    ap.add_argument("--dry-run", action="store_true", help="只写临时目录并校验，不进 incoming、不发布")
    ap.add_argument("--force", action="store_true", help="当天文件已在 incoming 或仓库里时仍重抓（内容相同不改写）")
    ap.add_argument("--out", type=Path, help="--dry-run 的输出目录（默认新建 /tmp/daily-fetch-dryrun-*）")
    a = ap.parse_args(argv)

    today = datetime.now(SH).strftime("%Y-%m-%d")
    date = a.date or today
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        print(f"--date 格式应为 YYYY-MM-DD：{date}", file=sys.stderr)
        return 2
    if not a.dry_run and date != today:
        print(f"正式出报只能生成今天（{today}）这一期：数据是此刻快照，写成 {date} 会错标日期。演练请加 --dry-run。", file=sys.stderr)
        return 2

    target = INCOMING / f"{date}.json"
    repo_file = CONTENT / f"{date}.json"
    if not a.dry_run and not a.force:
        for p in (target, repo_file):
            if p.exists():
                print(f"{p} 已存在，不重抓（需要重抓请加 --force）。发布交给 deploy/daily-cron.sh。")
                return 0

    stamp = datetime.now(SH).strftime("%Y%m%d-%H%M%S")
    if a.dry_run:
        out = a.out or Path(tempfile.mkdtemp(prefix="daily-fetch-dryrun-"))
        out.mkdir(parents=True, exist_ok=True)
        raw_dir = out / f"run-{stamp}"
    else:
        raw_dir = LOGS / "runs" / f"run-{stamp}"
    http = Http(raw_dir=raw_dir)
    print(f"[{sh_str(datetime.now(UTC))}] 开始抓取 {date}（{'dry-run' if a.dry_run else '正式'}）；原始响应 {raw_dir}")
    try:
        report = run_fetch(date, http, raw_dir=raw_dir)
    except FetchError as e:
        print(f"出报失败：{e}", file=sys.stderr)
        _print_requests(http)
        return 1
    _print_requests(http)
    for c in report["methods"]["checklist"]:
        print(f"  [{c['status']:<7}] {c['text']}：{c.get('meta', '')}")

    text = dump(report)
    stage_dir = Path(tempfile.mkdtemp(prefix="daily-fetch-stage-"))
    stage = stage_dir / f"{date}.json"
    stage.write_text(text, encoding="utf-8")
    errs = validate_file(stage, date)
    if errs:
        print("校验未通过，未投放：", *errs, sep="\n  ", file=sys.stderr)
        return 1
    print("校验通过（web/check.py --content 单文件）")

    if a.dry_run:
        dest = out / f"{date}.json"
        shutil.move(stage, dest)
        shutil.rmtree(stage_dir, ignore_errors=True)
        print(f"dry-run 产物：{dest}（未写入 incoming，未发布）")
        return 0

    if target.exists() and target.read_text(encoding="utf-8") == text:
        print(f"{target} 内容相同，不改写")
        shutil.rmtree(stage_dir, ignore_errors=True)
        return 0
    INCOMING.mkdir(parents=True, exist_ok=True)
    tmp = INCOMING / f".{date}.json.tmp.{os.getpid()}"
    shutil.copy(stage, tmp)
    os.chmod(tmp, 0o644)
    os.replace(tmp, target)  # 同一目录内 rename，daily-cron 不会读到半个文件
    shutil.rmtree(stage_dir, ignore_errors=True)
    prune_runs(LOGS / "runs")
    print(f"已投放：{target}（等待 09:15 起的 deploy/daily-cron.sh 发布）")
    return 0


def _print_requests(http: Http) -> None:
    for r in http.log:
        print(f"  {r.status or '---'} {r.source:<11} {r.url}" + (f"  {r.error}" if r.error else ""))


if __name__ == "__main__":
    sys.exit(main())
