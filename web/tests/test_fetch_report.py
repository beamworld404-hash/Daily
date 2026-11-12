"""出报脚本 deploy/fetch_report.py 的离线测试（不联网：用假 HTTP 返回固定载荷）。

运行：python3 -m unittest discover -s web/tests -v（在仓库根目录）
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
REPO = WEB.parent
sys.path.insert(0, str(WEB))
sys.path.insert(0, str(REPO / "deploy"))

import fetch_report as fr  # noqa: E402
from dailysite.validate import validate_report  # noqa: E402

SAMPLE = WEB / "content" / "reports" / "2026-11-12.json"
DAY = 86400
# 2026-11-12 00:00 UTC
T1112 = 1794441600


def chart(start_ts: int, values: list[float]) -> list[list]:
    return [[start_ts + i * DAY, v] for i, v in enumerate(values)]


def pair(chain: str, token: str, pair_addr: str, sym: str, liq: float | None, vol: float | None, created: int = 1794496000000) -> dict:
    p = {
        "chainId": chain,
        "dexId": "pumpswap",
        "url": f"https://dexscreener.com/{chain}/{pair_addr.lower()}",
        "pairAddress": pair_addr,
        "baseToken": {"address": token, "symbol": sym, "name": sym},
        "quoteToken": {"address": "So11111111111111111111111111111111111111112", "symbol": "SOL"},
        "volume": {} if vol is None else {"h24": vol},
        "pairCreatedAt": created,
    }
    if liq is not None:
        p["liquidity"] = {"usd": liq, "base": 1, "quote": 1}
    return p


def payloads(fomo_1110: float = 299969) -> dict[str, object]:
    # DefiLlama：以 11-12 期已发布的 10-28…11-10 为底，追加 11-11、11-12；11-13 是“今天 UTC”（未完整），必须被排除
    rev = {p["name"]: p["values"] for p in json.loads(SAMPLE.read_text(encoding="utf-8"))["revenue"]["protocols"]}
    fomo = rev["FOMO"][:-1] + [fomo_1110, 341767, 350000, 5]
    gmgn = rev["GMGN"] + [229169, 210000, 7]
    start = T1112 - 15 * DAY  # 2026-10-28
    toks = [
        ("solana", "AAAApump", "PAIRA", "AAA", 50000, 900000),
        ("solana", "BBBBpump", "PAIRB", "BBB", 2000, 500000),
        ("solana", "CCCCpump", "PAIRC", "CCC", None, 800000),  # 无流动性 → 不入选
        ("solana", "DDDDpump", "PAIRD", "DDD", 500, 100000),  # 低于门槛
        ("robinhood", "0xEeee", "0xPAIRE", "EEE", 30000, 700000),
        ("robinhood", "0xFfff", "0xPAIRF", "FFF", 10000, 300000),
        ("robinhood", "0xGggg", "0xPAIRG", "GGG", 10000, 200000),
    ]
    profiles = [{"chainId": c, "tokenAddress": a, "url": f"https://dexscreener.com/{c}/{a}"} for c, a, *_ in toks]
    sol = [pair(c, a, p, s, l, v) for c, a, p, s, l, v in toks if c == "solana"]
    rh = [pair(c, a, p, s, l, v) for c, a, p, s, l, v in toks if c == "robinhood"]
    # 同一代币第二个交易对，流动性更低，不应被选中
    sol.append(pair("solana", "AAAApump", "PAIRA2", "AAA", 100, 9_999_999))
    rss = (
        '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">'
        "<updated>2026-11-13T00:40:00+00:00</updated>"
        "<entry><author><name>/u/alice</name></author><title>New &amp; shiny</title>"
        '<link href="https://www.reddit.com/r/Monad/comments/1/new/"/><updated>2026-11-12T03:47:37+00:00</updated></entry>'
        "<entry><author><name>/u/bob</name></author><title>Old post</title>"
        '<link href="https://www.reddit.com/r/Monad/comments/2/old/"/><updated>2026-11-11T18:00:42+00:00</updated></entry>'
        "</feed>"
    )
    return {
        fr.FNG_URL: {"data": [
            {"value": "28", "value_classification": "Fear", "timestamp": str(T1112)},
            {"value": "29", "value_classification": "Fear", "timestamp": str(T1112 - DAY)},
        ]},
        fr.LLAMA_URL.format(slug="fomo"): {"totalDataChart": chart(start, fomo) + [[T1112 - 400 * DAY, 1844534]]},
        fr.LLAMA_URL.format(slug="gmgn"): {"totalDataChart": chart(start, gmgn)},
        fr.TEHC + "/status": {"synced_at": "2026-11-12 14:22:41.3462+00"},
        fr.TEHC + "/trench": {
            "today": {"day": "2026-11-11", "score": 38, "band": "cold", "components": {
                "pad_volume": {"value": 1.1e9, "percentile": 34},
                "tokens_launched": {"value": 69110, "percentile": 53},
                "pad_revenue": {"value": 966029.5, "percentile": 23},
            }},
            "history": [{"day": f"2026-11-{d:02d}", "score": s} for d, s in ((6, 29), (7, 26), (8, 24), (9, 31), (10, 31), (11, 38))],
            "method": {"weights": {"pad_volume": 0.2, "tokens_launched": 0.1, "pad_revenue": 0.15}},
        },
        fr.TEHC + "/launchpads?window=1d": {"window": "1d", "through": "2026-11-11", "pads": [
            {"chain": "solana", "pad": "pumpfun", "display_name": "pumpfun", "tokens_launched": 42369, "volume_usd": 4.0e8}]},
        fr.TEHC + "/bots?window=1d": {"window": "1d", "through": "2026-11-11", "days": ["2026-11-11"], "series": [
            {"name": "fomo", "display_name": "fomo", "volume_usd": [69806340.55], "fees_usd": [287200.5]},
            {"name": "gmgn", "display_name": "GMGN", "volume_usd": [30000000.0], "fees_usd": [317500.0]}]},
        fr.TEHC + "/chains": {"chains": [
            {"chain": "solana", "display_name": "Solana", "through": "2026-11-11", "latest": {"dex_volume_usd": 3.1e9, "active_wallets": 964718}},
            {"chain": "elysium", "display_name": "Elysium", "through": "2026-11-12", "latest": {"dex_volume_usd": 6.2e7, "active_wallets": 45980}}]},
        fr.REDDIT_RSS: rss.encode(),
        f"{fr.GH_API}/orgs/{fr.GH_ORG}/repos?per_page=100&type=public": [
            {"name": "games", "html_url": "https://github.com/rarefriends/games", "private": False,
             "created_at": "2026-10-16T20:00:18Z", "pushed_at": "2026-10-26T06:50:36Z"}],
        f"{fr.GH_API}/repos/{fr.GH_ORG}/games/pulls?state=all&sort=updated&direction=desc&per_page=30": [],
        fr.DS_PROFILES: profiles,
        fr.DS_TOKENS.format(chain="robinhood", addrs="0xEeee,0xFfff,0xGggg"): rh,
        fr.DS_TOKENS.format(chain="solana", addrs="AAAApump,BBBBpump,CCCCpump,DDDDpump"): sol,
    }


class FakeHttp(fr.Http):
    def __init__(self, data: dict, fail: set[str] = frozenset()):
        super().__init__(raw_dir=None, sleep=lambda s: None)
        self.data, self.fail = data, fail

    def get(self, source, url, name, accept="application/json", tries=3):
        if any(url.startswith(f) for f in self.fail) or url not in self.data:
            self.log.append(fr.Req(source, url, 503, "HTTP 503"))
            raise fr.FetchError(f"{url} 失败（HTTP 503）")
        self.log.append(fr.Req(source, url, 200))
        body = self.data[url]
        return body if isinstance(body, bytes) else json.dumps(body).encode()


class FetchReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.content = self.tmp / "reports"
        self.content.mkdir()
        shutil.copy(SAMPLE, self.content / SAMPLE.name)
        # 固定“现在”为 2026-11-13 00:40 UTC（08:40 北京时间）
        self._dt = fr.datetime

        class FixedDT(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 11, 13, 0, 40, 0, tzinfo=timezone.utc).astimezone(tz)

        fr.datetime = FixedDT

    def tearDown(self):
        fr.datetime = self._dt
        shutil.rmtree(self.tmp)

    def build(self, data=None, fail=frozenset()):
        http = FakeHttp(data or payloads(), set(fail))
        return fr.run_fetch("2026-11-13", http, content=self.content), http

    def test_full_report_is_valid_and_has_no_x_or_defined(self):
        rep, _ = self.build()
        self.assertEqual(validate_report(rep, "2026-11-13"), [])
        self.assertNotIn("x_digest", rep)
        self.assertNotIn("defined", rep)
        self.assertEqual(rep["edition"], "早报")
        self.assertEqual(rep["issued_at"], "2026-11-13 08:40")
        x = [c for c in rep["methods"]["checklist"] if "X" in c["text"]]
        self.assertEqual([c["status"] for c in x], ["skipped"])
        self.assertNotIn("defined.fi", json.dumps(rep, ensure_ascii=False))

    def test_revenue_uses_complete_days_and_reports_revision(self):
        rep, _ = self.build()
        rev = rep["revenue"]
        self.assertEqual(rev["dates"][-1], "2026-11-12")  # 今天 UTC 11-13 不算完整日
        self.assertEqual(len(rev["dates"]), fr.REVENUE_DAYS)
        fomo = rev["protocols"][0]
        self.assertEqual(fomo["name"], "FOMO")
        self.assertEqual(fomo["values"][-3], 299969)  # 11-10 用修订后的值
        self.assertEqual(fomo["ath"], {"usd": 1844534, "date": "2025-10-08"})
        text = json.dumps(rep["notices"], ensure_ascii=False)
        self.assertIn("FOMO 的 UTC 11-10", text)
        self.assertIn("$300.01K", text)
        self.assertIn("$299.97K", text)

    def test_no_revision_notice_when_unchanged(self):
        rep, _ = self.build(payloads(fomo_1110=300012))
        self.assertNotIn("数据修订", [n["title"] for n in rep.get("notices", [])])

    def test_trench_history_change_is_disclosed(self):
        rep, _ = self.build()
        tr = rep["tehc"]["trench"]
        self.assertEqual((tr["date"], tr["score"], tr["label_zh"]), ("2026-11-11", 38, "冷"))
        self.assertEqual(tr["history"][-1], {"date": "2026-11-11", "score": 38})
        self.assertIn("11-10 由 37 变为 31", tr["note"])
        self.assertIn("Trench 历史已变化", [n["title"] for n in rep["notices"]])
        self.assertIn("日期不一致", rep["tehc"]["chains"]["caption"])

    def test_dexscreener_ranking_links_and_first_switch(self):
        rep, _ = self.build()
        ds = rep["dexscreener"]
        self.assertEqual([t["symbol"] for t in ds["tokens"]], ["AAA", "EEE", "BBB", "FFF", "GGG"])
        a = ds["tokens"][0]
        self.assertEqual(a["url"], "https://dexscreener.com/solana/paira")  # 流动性最高的那个交易对
        self.assertEqual(a["volume_24h_usd"], 900000)
        for t in ds["tokens"]:
            self.assertTrue(t["url"].startswith(f"https://dexscreener.com/{t['chain']}/"))
            self.assertIsNone(t["narrative"])
            self.assertNotIn("status", t)  # 第一期切换：不标新上 / 名次变化
        self.assertIn("不做新上 / 掉出对比", ds["changes"])
        self.assertIn("/token-profiles/latest/v1", ds["caption"])
        self.assertIn("不是「新池」榜", ds["caption"])
        self.assertIn("接口未给流动性", ds["method"])
        self.assertIn("新池榜数据源更换", [n["title"] for n in rep["notices"]])

    def test_dexscreener_compares_with_previous_dexscreener_issue(self):
        rep, _ = self.build()
        (self.content / "2026-11-13.json").write_text(json.dumps(rep, ensure_ascii=False), encoding="utf-8")
        prev = fr.find_prev(self.content, "2026-11-14")
        self.assertEqual(prev.date, "2026-11-13")
        self.assertEqual(fr.sh_str(prev.since), "2026-11-13 08:40:00")
        data = payloads()
        # 下一期：BBB 掉出，HHH 新上
        data[fr.DS_PROFILES] = [p for p in data[fr.DS_PROFILES] if p["tokenAddress"] != "BBBBpump"] + [
            {"chainId": "solana", "tokenAddress": "HHHHpump"}]
        data.pop(fr.DS_TOKENS.format(chain="solana", addrs="AAAApump,BBBBpump,CCCCpump,DDDDpump"))
        data[fr.DS_TOKENS.format(chain="solana", addrs="AAAApump,CCCCpump,DDDDpump,HHHHpump")] = [
            pair("solana", "AAAApump", "PAIRA", "AAA", 50000, 900000), pair("solana", "HHHHpump", "PAIRH", "HHH", 9000, 650000)]
        ds, _ = fr.build_dexscreener(data[fr.DS_PROFILES],
                                     {"solana": data[fr.DS_TOKENS.format(chain="solana", addrs="AAAApump,CCCCpump,DDDDpump,HHHHpump")],
                                      "robinhood": data[fr.DS_TOKENS.format(chain="robinhood", addrs="0xEeee,0xFfff,0xGggg")]},
                                     datetime(2026, 11, 14, tzinfo=timezone.utc), prev.report, [])
        st = {t["symbol"]: t.get("status") for t in ds["tokens"]}
        self.assertEqual(st["HHH"], "新上")
        self.assertEqual(st["AAA"], "仍第 1")
        self.assertIn("掉出 BBB", ds["changes"])
        self.assertIn("同口径榜", ds["changes"])

    def test_failed_source_is_marked_and_section_omitted(self):
        rep, _ = self.build(fail={fr.DS_API, fr.TEHC})
        self.assertNotIn("dexscreener", rep)
        self.assertNotIn("tehc", rep)
        st = {c["text"]: c["status"] for c in rep["methods"]["checklist"]}
        self.assertEqual(st["DexScreener 最新代币资料"], "failed")
        self.assertEqual(st["TehcScreener"], "failed")
        self.assertIn("部分数据源失败", [n["title"] for n in rep["notices"]])
        self.assertEqual(validate_report(rep, "2026-11-13"), [])

    def test_all_numeric_sources_failed_raises(self):
        with self.assertRaises(fr.FetchError):
            self.build(fail={fr.DS_API, fr.TEHC, "https://api.llama.fi", "https://api.alternative.me"})

    def test_reddit_window_and_github_quiet(self):
        rep, _ = self.build()
        posts = rep["reddit"]["posts"]
        self.assertEqual([p["title"] for p in posts], ["New & shiny"])  # 11-12 08:33 北京时间之前的帖子不算
        self.assertIsNone(posts[0]["comments"])
        self.assertFalse(rep["github"]["updated"])
        self.assertIn("暂无新更新", rep["github"]["text"])

    def test_coverage_window_starts_at_previous_fetch(self):
        rep, _ = self.build()
        self.assertIn("2026-11-12 08:33:11", rep["coverage"])
        self.assertTrue(rep["methods"]["properties"][0]["value"].startswith("2026-11-13 08:40:00"))

    def test_usd_matches_frontend_rounding(self):
        self.assertEqual(fr.usd(300012), "$300.01K")
        self.assertEqual(fr.usd(299969), "$299.97K")
        self.assertEqual(fr.usd(1844534), "$1.84M")
        self.assertEqual(fr.usd(999.5), "$999.50")
        self.assertEqual(fr.usd(1005), "$1.01K")  # 0.5 进位（不是银行家舍入）


class CliGuardTests(unittest.TestCase):
    def test_real_run_refuses_other_dates(self):
        self.assertEqual(fr.main(["--date", "2000-01-01"]), 2)

    def test_bad_date_format(self):
        self.assertEqual(fr.main(["--date", "2026/11/13", "--dry-run"]), 2)


if __name__ == "__main__":
    unittest.main()
