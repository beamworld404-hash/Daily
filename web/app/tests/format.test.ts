// 运行：npm test（Node 22.6+ 原生 TypeScript 类型擦除）
import { test } from "node:test";
import assert from "node:assert/strict";
import { changePct, mmdd, moved, pct, usd, usdParts, zhDay, zhWeekday } from "../src/lib/format.ts";

test("usd 与旧版日报 formatUsd 输出逐一一致", () => {
  const cases: [number, string][] = [
    [300012, "$300.01K"],
    [288990.01, "$288.99K"],
    [85167.01, "$85.17K"],
    [172487, "$172.49K"],
    [179035, "$179.04K"],
    [1844534, "$1.84M"],
    [5737132, "$5.74M"],
    [1050352557.4107416, "$1.05B"],
    [1181347.8717953796, "$1.18M"],
    [1000, "$1.00K"],
    [999.5, "$999.50"],
    [0, "$0.00"],
    [-2500, "-$2.50K"],
  ];
  for (const [v, want] of cases) assert.equal(usd(v), want, String(v));
});

test("usdParts 拆出的数字与单位能拼回 usd()", () => {
  for (const v of [300012, 1844534, 999.5, 1050352557.41]) {
    const p = usdParts(v);
    assert.equal(`${p.sign}$${p.text}${p.unit}`, usd(v));
  }
});

test("变化率与占 ATH 比例和旧版日报一致", () => {
  assert.equal(pct(changePct(300012, 288990.01)), "3.81%");
  assert.equal(pct(Math.abs(changePct(172487, 179035))), "3.66%");
  assert.equal(pct((300012 / 1844534) * 100), "16.26%");
  assert.equal(pct((172487 / 5737132) * 100), "3.01%");
});

test("日期与升降文字", () => {
  assert.equal(mmdd("2026-11-10"), "11-10");
  assert.equal(zhDay("2026-11-12"), "2026 年 11 月 12 日");
  assert.equal(zhWeekday("2026-11-12"), "星期四");
  assert.equal(moved(-1, "点"), "降 1 点");
  assert.equal(moved(1, "分"), "升 1 分");
  assert.equal(moved(0, "分"), "持平");
});
