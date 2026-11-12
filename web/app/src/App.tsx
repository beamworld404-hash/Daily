import { reports } from "@/lib/reports";

/** 临时占位：affectUI 已移除，新界面见后续提交。 */
export function App() {
  const r = reports[0];
  return (
    <main>
      <h1>关注清单日报</h1>
      {r ? <p>{r.date} {r.edition}：{r.summary}</p> : <p>还没有日报。</p>}
    </main>
  );
}
