// 运行：npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirTone, fngTone, heatTone, toneSegments, trenchTone } from "../src/lib/tone.ts";

test("恐惧与贪婪按 Alternative.me 五档着色", () => {
  const cases: [number, string][] = [
    [0, "xfear"], [24, "xfear"], [25, "fear"], [28, "fear"], [46, "fear"],
    [47, "neutral"], [54, "neutral"], [55, "greed"], [75, "greed"], [76, "xgreed"], [100, "xgreed"],
  ];
  for (const [v, want] of cases) assert.equal(fngTone(v), want, String(v));
});

test("涨跌、冷热", () => {
  assert.equal(dirTone(3.5), "up");
  assert.equal(dirTone(-1), "down");
  assert.equal(dirTone(0), "flat");
  assert.equal(heatTone(3.01), "cold");
  assert.equal(heatTone(50), "mild");
  assert.equal(heatTone(73), "hot");
  assert.equal(trenchTone(37, "cold"), "cold");
  assert.equal(trenchTone(70, "冷"), "cold");
  assert.equal(trenchTone(70), "hot");
});

const toned = (s: string) => toneSegments(s).filter((x) => x.tone).map((x) => [x.text, x.tone]);

test("正文关键数字：样例要点逐条", () => {
  assert.deepEqual(toned("恐惧贪婪指数 28（恐惧），较上一日降 1 点。"), [["28（恐惧）", "fear"], ["降 1 点", "down"]]);
  assert.deepEqual(toned("Trench 11-10 为 37（冷），较 11-09 的 36 升 1 分。"), [["37（冷）", "cold"], ["升 1 分", "up"]]);
  assert.deepEqual(toned("FOMO 收入 $300.01K，占历史最高 16.26%；GMGN $172.49K，占 3.01%。"), [["16.26%", "cold"], ["3.01%", "cold"]]);
  assert.deepEqual(toned("较 11-11 的 29 下降 1 点"), [["下降 1 点", "down"]]);
});

test("日期不被误当成分数着色：完整日期后的分数才着色", () => {
  // 2026-11-13 期要点原句：曾把「2026」的「202」按 Trench 冷热着成红色
  assert.deepEqual(toned("TehcScreener Trench 2026-11-11 为 38（冷），较 11-10 的 31 上升 7 分。"), [
    ["38（冷）", "cold"],
    ["上升 7 分", "up"],
  ]);
  assert.deepEqual(toned("Trench 2026-11-11"), []);
  // 恐惧贪婪写法不支持中间夹日期：宁可整段不着色，也不能把「202」当读数
  assert.deepEqual(toned("恐惧贪婪指数 2026-11-12 为 20（极度恐惧）"), []);
  assert.deepEqual(toned("Trench 1234"), []);
});

test("切分后能原样拼回，没有关键数字时整段不着色", () => {
  for (const s of ["恐惧与贪婪 80（极度贪婪），升 5 点", "r/Monad 有 3 篇新帖", "", "升级到 v2"]) {
    assert.equal(toneSegments(s).map((x) => x.text).join(""), s);
  }
  assert.deepEqual(toned("r/Monad 有 3 篇新帖；升级到 v2"), []);
  assert.deepEqual(toned("恐惧与贪婪 80（极度贪婪）"), [["80（极度贪婪）", "xgreed"]]);
});
