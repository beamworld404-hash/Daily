// 运行：npm test
//
// 回归：主页 → 点进某期不刷新就白屏。
// 根因是 HomePage 写了 `useLayoutEffect(() => window.scrollTo(0, 0), [])`：箭头函数的表达式体
// 把 scrollTo 的返回值当成了 effect 的返回值。新版 Chromium 里 scrollTo 返回 Promise，
// React 在主页卸载（hash 变成 #/日期）时把这个 Promise 当清理函数调用，抛
// 「destroy is not a function」，整棵树被卸掉。直接刷新详情页不会挂载主页，所以刷新后正常。
//
// effect 只能返回清理函数或 undefined，所以这里要求 src/ 里所有 useEffect / useLayoutEffect /
// useInsertionEffect 的回调都写成块体 `() => { ... }`，不许用表达式体隐式返回任意值。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;

/** 回调为表达式体箭头函数的 effect 调用：useXxxEffect( [async] (args) => <不是 {> */
const EXPR_BODY_EFFECT = /\buse(?:Layout|Insertion)?Effect\s*\(\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>(?!\s*\{)/g;

function offending(source: string): string[] {
  return [...source.matchAll(EXPR_BODY_EFFECT)].map((m) => {
    const line = source.slice(0, m.index).split("\n").length;
    return `${line}: ${source.split("\n")[line - 1].trim()}`;
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("检测器能抓到导致白屏的旧写法", () => {
  // 修复前 pages.tsx 里的原句，必须被判为违规
  assert.equal(offending("  useLayoutEffect(() => window.scrollTo(0, 0), []);").length, 1);
  assert.equal(offending("useEffect(() => fetchSomething(), [x]);").length, 1);
  assert.equal(offending("useEffect(async () => load(), []);").length, 1);
  // 合法写法：块体，或块体里返回清理函数
  assert.deepEqual(offending("useLayoutEffect(() => {\n  window.scrollTo(0, 0);\n}, []);"), []);
  assert.deepEqual(offending("useEffect(() => {\n  addEventListener('x', on);\n  return () => removeEventListener('x', on);\n}, []);"), []);
});

test("src/ 里所有 effect 回调都是块体，不会把 scrollTo 之类的返回值当清理函数", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.some((f) => f.endsWith("pages.tsx")), "应扫描到 components/pages.tsx");
  const bad = files.flatMap((f) => offending(readFileSync(f, "utf8")).map((l) => `${relative(SRC, f)}:${l}`));
  assert.deepEqual(bad, [], `effect 回调须写成 () => { ... }：\n${bad.join("\n")}`);
});
