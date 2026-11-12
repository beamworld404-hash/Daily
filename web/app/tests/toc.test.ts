// 运行：npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorId, href, parse } from "../src/lib/route.ts";
import { activeAnchor, anchorsOf, resolveTarget } from "../src/lib/toc.ts";

const chapters = [
  { id: "overview", sections: [{ id: "highlights" }, { id: "notices" }] },
  { id: "trench", sections: [{ id: "trench" }, { id: "bots" }] },
];

test("期首与日期 hash 都打开同一期全文页", () => {
  assert.deepEqual(parse(""), { kind: "issue", date: null, chapter: null, section: null });
  assert.deepEqual(parse("#/"), { kind: "issue", date: null, chapter: null, section: null });
  assert.deepEqual(parse("#/2026-11-12"), { kind: "issue", date: "2026-11-12", chapter: null, section: null });
  assert.deepEqual(parse("#/archive"), { kind: "archive" });
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
