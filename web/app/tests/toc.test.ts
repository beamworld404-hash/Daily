// 运行：npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorId, href, parse } from "../src/lib/route.ts";
import { activeAnchor, anchorsOf, homeEntries, resolveTarget, tocItems } from "../src/lib/toc.ts";

const chapters = [
  { id: "overview", title: "今日要点", sections: [{ id: "highlights", title: "要点" }, { id: "notices", title: "修订与提示" }] },
  { id: "trench", title: "Trench 与链上", sections: [{ id: "trench", title: "Trench 热度" }, { id: "bots", title: "交易机器人" }] },
];

test("空 hash 与 #/ 打开主页；旧的 #/archive 也落到主页", () => {
  assert.deepEqual(parse(""), { kind: "home" });
  assert.deepEqual(parse("#"), { kind: "home" });
  assert.deepEqual(parse("#/"), { kind: "home" });
  assert.deepEqual(parse("#/archive"), { kind: "home" });
});

test("日期 hash 打开那一期全文页", () => {
  assert.deepEqual(parse("#/2026-11-12"), { kind: "issue", date: "2026-11-12", chapter: null, section: null });
  assert.equal(href.issue("2026-11-12"), "#/2026-11-12");
});

test("全文页的返回指向主页，而不是同一期", () => {
  assert.equal(href.home(), "#/");
  assert.deepEqual(parse(href.home()), { kind: "home" });
  assert.notEqual(href.home(), href.issue("2026-11-12"));
});

test("旧的分章 hash 仍解析为同一期全文页，只带滚动目标", () => {
  assert.deepEqual(parse("#/2026-11-12/onchain"), { kind: "issue", date: "2026-11-12", chapter: "onchain", section: null });
  assert.deepEqual(parse("#/2026-11-12/onchain/fng"), { kind: "issue", date: "2026-11-12", chapter: "onchain", section: "fng" });
  assert.deepEqual(parse("#/2026-11-12/%E0%A4%A"), { kind: "issue", date: "2026-11-12", chapter: "%E0%A4%A", section: null });
  assert.equal(href.chapter("2026-11-12", "onchain", "fng"), "#/2026-11-12/onchain/fng");
});

test("小节锚点带章前缀，与同名章不冲突", () => {
  const ids = anchorsOf(chapters, anchorId);
  assert.deepEqual(ids, ["overview", "overview--highlights", "overview--notices", "trench", "trench--trench", "trench--bots"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("深链接落点：节 → 章 → 顶部", () => {
  assert.equal(resolveTarget(chapters, "trench", "bots", anchorId), "trench--bots");
  assert.equal(resolveTarget(chapters, "trench", "nope", anchorId), "trench");
  assert.equal(resolveTarget(chapters, "trench", null, anchorId), "trench");
  assert.equal(resolveTarget(chapters, "nope", "bots", anchorId), null);
  assert.equal(resolveTarget(chapters, null, null, anchorId), null);
});

test("目录高亮：越过阅读线的最后一项；页底高亮最后一项", () => {
  const tops = [
    { id: "a", top: -400 },
    { id: "b", top: 80 },
    { id: "c", top: 300 },
  ];
  assert.equal(activeAnchor(tops, 120), "b");
  assert.equal(activeAnchor(tops, 50), "a");
  assert.equal(activeAnchor([{ id: "a", top: 500 }], 120), null);
  assert.equal(activeAnchor(tops, 120, true), "c");
  assert.equal(activeAnchor([], 120, true), null);
});

test("目录是一列：每章后紧跟它的全部小节，覆盖本期全部内容", () => {
  const items = tocItems(chapters, anchorId);
  assert.deepEqual(
    items.map((t) => [t.level, t.id, t.title]),
    [
      [1, "overview", "今日要点"],
      [2, "overview--highlights", "要点"],
      [2, "overview--notices", "修订与提示"],
      [1, "trench", "Trench 与链上"],
      [2, "trench--trench", "Trench 热度"],
      [2, "trench--bots", "交易机器人"],
    ],
  );
  // 目录项与页面锚点一一对应，点击跳到的 hash 能被解析回同一处
  assert.deepEqual(items.map((t) => t.id), anchorsOf(chapters, anchorId));
  for (const t of items) {
    const r = parse(href.chapter("2026-11-12", t.chapter, t.section ?? undefined));
    assert.equal(r.kind, "issue");
    if (r.kind === "issue") assert.equal(resolveTarget(chapters, r.chapter, r.section, anchorId), t.id);
  }
});

test("主页只列已有的期次，按日期倒序，最新一期标记", () => {
  assert.deepEqual(homeEntries([]), []);
  assert.deepEqual(homeEntries([{ date: "2026-11-12" }]), [{ date: "2026-11-12", latest: true }]);
  const list = homeEntries([{ date: "2026-11-10" }, { date: "2026-11-12" }, { date: "2026-11-11" }]);
  assert.deepEqual(
    list.map((r) => [r.date, r.latest]),
    [
      ["2026-11-12", true],
      ["2026-11-11", false],
      ["2026-11-10", false],
    ],
  );
});
