import type { ReactNode } from "react";
import type { CheckStatus, ListedToken, Report } from "@/lib/types";
import { arrow, changePct, mmdd, moved, num, pct, usd, zhDay, zhWeekday } from "@/lib/format";
import { Ext, Rich } from "@/lib/rich";
import { Columns, Note, Pill, Table, Term } from "@/components/ui";
import { dirTone, fngTone, heatTone, toneClass, trenchTone } from "@/lib/tone";

/** 一章 = 全文页里的一个二级标题；一节 = 章下的三级标题。章、节都是左侧整期目录的一项 */
export type Section = { id: string; title: string; body: ReactNode };
export type Chapter = {
  id: string;
  title: string;
  /** 一句话概括，全部由当期数据算出（全文页不显示，保留给日后列表 / 摘要用） */
  desc: string;
  pill?: string;
  lead?: ReactNode;
  sections: Section[];
};

const STATUS: Record<CheckStatus, string> = { ok: "成功", partial: "部分", skipped: "跳过", failed: "失败" };

function overview(r: Report): Chapter {
  const sections: Section[] = [
    {
      id: "highlights",
      title: "要点",
      body: (
        <ul className="bullets">
          {r.highlights.map((h, i) => (
            <li key={i}>
              <Rich text={h} />
            </li>
          ))}
        </ul>
      ),
    },
  ];
  if (r.notices?.length)
    sections.push({
      id: "notices",
      title: "修订与提示",
      body: r.notices.map((n, i) => (
        <Note key={i} title={n.title} tone={n.tone}>
          <p>
            <Rich text={n.text} />
          </p>
        </Note>
      )),
    });
  sections.push({
    id: "coverage",
    title: "覆盖范围",
    body: (
      <>
        <p>
          <Rich text={r.coverage} />
        </p>
        <p className="meta">
          出报时间 {r.issued_at}（北京时间）· {zhWeekday(r.date)}
        </p>
      </>
    ),
  });
  return {
    id: "overview",
    title: "今日要点",
    desc: `导语与 ${r.highlights.length} 条要点${r.notices?.length ? `，含 ${r.notices.length} 条提示` : ""}`,
    pill: r.notices?.[0]?.title,
    // 导语（r.summary）由全文页期首显示，这里不再重复
    sections,
  };
}

function onchain(r: Report): Chapter | null {
  const { fng, revenue } = r;
  if (!fng && !revenue) return null;
  const sections: Section[] = [];
  const bits: string[] = [];
  if (fng) {
    const d = fng.previous ? fng.latest.value - fng.previous.value : null;
    bits.push(`恐惧与贪婪 ${fng.latest.value}（${fng.latest.class_zh}）`);
    sections.push({
      id: "fng",
      title: "恐惧与贪婪指数",
      body: (
        <>
          <div className="figures">
            <div className="figure">
              <p className="figure-label">{mmdd(fng.latest.date)} 读数</p>
              <p className="figure-value">
                <span className={toneClass(fngTone(fng.latest.value))}>{fng.latest.value}</span>
                <span className="figure-unit">/ 100</span>
              </p>
              <p className={`figure-sub ${toneClass(fngTone(fng.latest.value))}`}>{fng.latest.class_zh}</p>
            </div>
            {fng.previous && d !== null ? (
              <div className="figure">
                <p className="figure-label">较 {mmdd(fng.previous.date)}</p>
                <p className={`figure-value ${toneClass(dirTone(d))}`}>{moved(d, "点")}</p>
                <p className="figure-sub">
                  前值{" "}
                  <span className={toneClass(fngTone(fng.previous.value))}>
                    {fng.previous.value}（{fng.previous.class_zh}）
                  </span>
                </p>
              </div>
            ) : null}
          </div>
          <p className="meta">来源：{fng.source}</p>
        </>
      ),
    });
  }
  if (revenue) {
    const ticks = revenue.dates.map(mmdd);
    for (const p of revenue.protocols) {
      const latest = p.values[p.values.length - 1];
      const prev = p.values[p.values.length - 2];
      bits.push(`${p.name} ${usd(latest)}`);
      const delta = prev ? changePct(latest, prev) : null;
      sections.push({
        id: `rev-${p.name.toLowerCase()}`,
        title: `${p.name} 日收入`,
        body: (
          <>
            <p>
              UTC {revenue.dates[revenue.dates.length - 1]} 收入{" "}
              <strong className={`term${delta !== null ? ` ${toneClass(dirTone(delta))}` : ""}`}>{usd(latest)}</strong>
              {delta !== null ? (
                <>
                  ，较前一日{" "}
                  <span className={toneClass(dirTone(delta))}>
                    {arrow(delta)} {pct(Math.abs(delta))}
                  </span>
                </>
              ) : null}
              {p.ath ? (
                <>
                  ，占历史最高 {usd(p.ath.usd)}（{p.ath.date}）的{" "}
                  <span className={toneClass(heatTone((latest / p.ath.usd) * 100))}>{pct((latest / p.ath.usd) * 100)}</span>
                </>
              ) : null}
              。
            </p>
            <Columns
              label={`${p.name} 日收入`}
              format={usd}
              tone={delta !== null ? dirTone(delta) : undefined}
              points={revenue.dates.map((d, i) => ({ key: d, tick: ticks[i], value: p.values[i] }))}
            />
            {p.url ? (
              <p className="meta">
                <Ext href={p.url}>在 DefiLlama 查看 {p.name}</Ext>
              </p>
            ) : null}
          </>
        ),
      });
    }
    sections.push({
      id: "rev-notes",
      title: "收入口径",
      body: (
        <>
          {revenue.caption ? <p>{revenue.caption}</p> : null}
          {revenue.notes?.length ? (
            <ul className="bullets">
              {revenue.notes.map((n, i) => (
                <li key={i}>
                  <Rich text={n} />
                </li>
              ))}
            </ul>
          ) : null}
          <p className="meta">来源：{revenue.source}</p>
        </>
      ),
    });
  }
  return { id: "onchain", title: "情绪与收入", desc: bits.join(" · "), sections };
}

function trench(r: Report): Chapter | null {
  const t = r.tehc;
  if (!t) return null;
  const sections: Section[] = [];
  const bits: string[] = [];
  if (t.trench) {
    const tr = t.trench;
    bits.push(`Trench ${tr.score}（${tr.label_zh ?? tr.label}）`);
    sections.push({
      id: "trench",
      title: "Trench 热度",
      body: (
        <>
          <div className="figures">
            <div className="figure">
              <p className="figure-label">{mmdd(tr.date)} 分数</p>
              <p className="figure-value">
                <span className={toneClass(trenchTone(tr.score, tr.label))}>{tr.score}</span>
                <span className="figure-unit">/ 100</span>
              </p>
              <p className={`figure-sub ${toneClass(trenchTone(tr.score, tr.label))}`}>
                {tr.label_zh ?? tr.label}（{tr.label}）
              </p>
            </div>
          </div>
          {tr.note ? <p><Rich text={tr.note} /></p> : null}
          {tr.history?.length ? (
            <Columns
              label="Trench 分数"
              format={String}
              tone={trenchTone(tr.score, tr.label)}
              points={tr.history.map((h) => ({ key: h.date, tick: mmdd(h.date), value: h.score }))}
            />
          ) : null}
          {tr.components?.length ? (
            <>
              <Table
                caption="Trench 分项"
                rows={tr.components}
                columns={[
                  { label: "分项", cell: (c) => c.name },
                  { label: "数值", cell: (c) => (c.usd !== undefined ? usd(c.usd) : c.count !== undefined ? num(c.count) : "--"), num: true },
                  { label: "历史分位", cell: (c) => <span className={toneClass(heatTone(c.percentile))}>{c.percentile}</span>, num: true },
                ]}
              />
              {tr.components_note ? <p className="meta">{tr.components_note}</p> : null}
            </>
          ) : null}
        </>
      ),
    });
  }
  if (t.launchpads) {
    const lp = t.launchpads;
    if (lp.total) bits.push(`发射台 ${usd(lp.total.volume_usd)}`);
    sections.push({
      id: "launchpads",
      title: "发射台",
      body: (
        <>
          {lp.total ? (
            <p>
              合计成交额 <strong className="term">{usd(lp.total.volume_usd)}</strong>，新发射 {num(lp.total.launches)} 个。
            </p>
          ) : null}
          <Table
            caption="发射台"
            rows={lp.rows}
            columns={[
              { label: "发射台", cell: (x) => x.name },
              { label: "成交额", cell: (x) => usd(x.volume_usd), num: true },
              { label: "新发射", cell: (x) => num(x.launches), num: true },
            ]}
          />
          {lp.caption ? <p className="meta">{lp.caption}</p> : null}
        </>
      ),
    });
  }
  if (t.bots) {
    const b = t.bots;
    if (b.total) bits.push(`机器人 ${usd(b.total.volume_usd)}`);
    sections.push({
      id: "bots",
      title: "交易机器人",
      body: (
        <>
          {b.total ? (
            <p>
              合计成交额 <strong className="term">{usd(b.total.volume_usd)}</strong>，手续费 {usd(b.total.fees_usd)}。
            </p>
          ) : null}
          <Table
            caption="交易机器人"
            rows={b.rows}
            columns={[
              { label: "机器人", cell: (x) => x.name },
              { label: "成交额", cell: (x) => usd(x.volume_usd), num: true },
              { label: "手续费", cell: (x) => usd(x.fees_usd), num: true },
            ]}
          />
          {b.warning ? (
            <Note title="口径不同" tone="warning">
              <p>
                <Rich text={b.warning} />
              </p>
            </Note>
          ) : null}
          {b.caption ? <p className="meta">{b.caption}</p> : null}
        </>
      ),
    });
  }
  if (t.chains) {
    const rows = t.chains.rows;
    // 日期与多数不一致的链单独标注
    const counts = new Map<string, number>();
    for (const c of rows) if (c.date) counts.set(c.date, (counts.get(c.date) ?? 0) + 1);
    const major = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    sections.push({
      id: "chains",
      title: "各链概况",
      body: (
        <>
          <Table
            caption="各链概况"
            rows={rows}
            columns={[
              {
                label: "链",
                cell: (c) => (
                  <>
                    {c.name}
                    {c.date && major && c.date !== major ? (
                      <>
                        {" "}
                        <Pill tone="muted">截至 {mmdd(c.date)}</Pill>
                      </>
                    ) : null}
                  </>
                ),
              },
              { label: "DEX 成交额", cell: (c) => usd(c.dex_volume_usd), num: true },
              { label: "活跃钱包", cell: (c) => num(c.wallets), num: true },
            ]}
          />
          {t.chains.caption ? <p className="meta">{t.chains.caption}</p> : null}
        </>
      ),
    });
  }
  if (t.caption || t.source)
    sections.push({
      id: "tehc-source",
      title: "数据状态",
      body: (
        <>
          {t.caption ? <p>{t.caption}</p> : null}
          {t.source ? <p className="meta">来源：{t.source}</p> : null}
        </>
      ),
    });
  return { id: "trench", title: "Trench 与链上", desc: bits.join(" · "), sections };
}

/** 代币榜列表：Defined（旧期）与 DexScreener（新期）共用 */
function tokenList(tokens: (ListedToken & { dex?: string; pair_created_at?: string })[]) {
  return (
    <ol className="entries">
      {tokens.map((t, i) => (
        <li key={t.url} className="entry">
          <div className="entry-head">
            <span className="entry-rank">{i + 1}</span>
            <Ext href={t.url} className="entry-title">
              {t.symbol}
            </Ext>
            {t.chain ? <span className="entry-chain">{t.chain}</span> : null}
            {t.status ? <Pill tone={t.status === "新上" ? "accent" : "muted"}>{t.status}</Pill> : null}
          </div>
          <p className="entry-meta">
            流动性 {usd(t.liquidity_usd)} · 24h 成交额 {usd(t.volume_24h_usd)}
            {t.dex ? ` · ${t.dex}` : ""}
            {t.pair_created_at ? ` · 交易对创建于 ${t.pair_created_at}` : ""}
          </p>
          <p className="entry-body">{t.narrative ? <Rich text={t.narrative} /> : "暂无可核实的项目资料。"}</p>
        </li>
      ))}
    </ol>
  );
}

function defined(r: Report): Chapter | null {
  const d = r.defined;
  if (!d) return null;
  const sections: Section[] = [{ id: "tokens", title: "榜单", body: tokenList(d.tokens) }];
  if (d.changes) sections.push({ id: "changes", title: "与上一榜对比", body: <p><Rich text={d.changes} /></p> });
  sections.push({
    id: "defined-method",
    title: "取榜方法",
    body: (
      <>
        {d.caption ? <p>{d.caption}</p> : null}
        {d.method ? <p>{d.method}</p> : null}
        <p className="meta">抓取时间 {d.fetched_at}</p>
      </>
    ),
  });
  return {
    id: "defined",
    title: "Defined 新池",
    desc: `前 ${d.tokens.length}：${d.tokens.map((t) => t.symbol).join("、")}`,
    lead: <p>{d.title}</p>,
    sections,
  };
}

/** DexScreener 官方 API 榜（替代 Defined）。章标题按实际榜义，不叫「新池」 */
function dexscreener(r: Report): Chapter | null {
  const d = r.dexscreener;
  if (!d) return null;
  const sections: Section[] = [{ id: "tokens", title: "榜单", body: tokenList(d.tokens) }];
  if (d.changes) sections.push({ id: "changes", title: "与上一榜对比", body: <p><Rich text={d.changes} /></p> });
  sections.push({
    id: "dexscreener-method",
    title: "取榜方法",
    body: (
      <>
        <p>{d.caption}</p>
        <p>{d.method}</p>
        <p className="meta">抓取时间 {d.fetched_at}</p>
      </>
    ),
  });
  return {
    id: "dexscreener",
    title: "DexScreener 最新资料代币",
    desc: `前 ${d.tokens.length}：${d.tokens.map((t) => t.symbol).join("、")}`,
    lead: <p>{d.title}</p>,
    sections,
  };
}

function community(r: Report): Chapter | null {
  const { reddit, github } = r;
  if (!reddit && !github) return null;
  const sections: Section[] = [];
  const bits: string[] = [];
  if (reddit) {
    bits.push(`${reddit.subreddit} ${reddit.posts.length} 篇新帖`);
    sections.push({
      id: "reddit",
      title: reddit.subreddit,
      body: (
        <>
          {reddit.summary ? <p>{reddit.summary}</p> : null}
          {reddit.posts.length ? (
            <ul className="bullets">
              {reddit.posts.map((p) => (
                <li key={p.url}>
                  <Ext href={p.url}>{p.title}</Ext>
                  <span className="inline-meta">
                    {" "}
                    · {p.author} · 评论 {p.comments ?? "--"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>新帖 RSS 里没有新帖。</p>
          )}
          {reddit.note ? <p className="meta">{reddit.note}</p> : null}
          <p className="meta">
            {reddit.since ? `自 ${reddit.since} 起 · ` : ""}
            <Ext href={reddit.url}>打开 {reddit.subreddit}</Ext>
          </p>
        </>
      ),
    });
  }
  if (github) {
    bits.push(`${github.org} ${github.updated ? "有更新" : "暂无更新"}`);
    sections.push({
      id: "github",
      title: `GitHub · ${github.org}`,
      body: (
        <>
          <p>
            <Rich text={github.text} />
          </p>
          <p className="meta">
            <Ext href={github.url}>打开 {github.org}</Ext>
          </p>
        </>
      ),
    });
  }
  return { id: "community", title: "社区与开发", desc: bits.join(" · "), sections };
}

function xDigest(r: Report): Chapter | null {
  const x = r.x_digest;
  if (!x) return null;
  const accounts = x.accounts ?? [];
  const tools = x.tools ?? [];
  const sections: Section[] = [];
  if (x.mainline) sections.push({ id: "mainline", title: "主线", body: <p><Rich text={x.mainline} /></p> });
  for (const [i, a] of accounts.entries())
    sections.push({
      id: `acc-${i + 1}`,
      title: a.name,
      body: (
        <>
          <p className="meta">
            <Ext href={`https://x.com/${a.handle}`}>@{a.handle}</Ext>
          </p>
          <ul className="bullets">
            {a.items.map((it, j) => (
              <Term
                key={j}
                name={it.url ? <Ext href={it.url}>{it.title}</Ext> : it.title}
              >
                <Rich text={it.detail} />
                {it.links?.length ? (
                  <span className="inline-meta">
                    {" "}
                    ·{" "}
                    {it.links.map((l, k) => (
                      <span key={l.url}>
                        {k ? "、" : ""}
                        <Ext href={l.url}>{l.label}</Ext>
                      </span>
                    ))}
                  </span>
                ) : null}
                {it.truncated ? <> <Pill tone="muted">原文截断</Pill></> : null}
                {it.unverified ? <> <Pill>未核实</Pill></> : null}
              </Term>
            ))}
          </ul>
          {a.note ? <p className="meta">{a.note}</p> : null}
        </>
      ),
    });
  if (tools.length)
    sections.push({
      id: "tools",
      title: "工具与项目",
      body: (
        <ul className="bullets">
          {tools.map((t, i) => (
            <Term key={i} name={t.title}>
              <Rich text={t.detail} />
              {t.links?.length ? (
                <span className="inline-meta">
                  {" "}
                  ·{" "}
                  {t.links.map((l, k) => (
                    <span key={l.url}>
                      {k ? "、" : ""}
                      <Ext href={l.url}>{l.label}</Ext>
                    </span>
                  ))}
                </span>
              ) : null}
            </Term>
          ))}
        </ul>
      ),
    });
  return {
    id: "x",
    title: "X 关注摘要",
    desc: `${accounts.length} 个账号${tools.length ? `、${tools.length} 条工具线索` : ""}，时间线抽样`,
    lead: x.caption ? <p>{x.caption}</p> : undefined,
    sections,
  };
}

function methods(r: Report): Chapter {
  const m = r.methods;
  const counts = m.checklist.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
  const sections: Section[] = [
    {
      id: "checklist",
      title: "取数清单",
      body: (
        <ul className="checklist">
          {m.checklist.map((c, i) => (
            <li key={i} className={`check check-${c.status}`}>
              <span className="check-status">{STATUS[c.status]}</span>
              <div>
                <p className="check-text">{c.text}</p>
                {c.meta ? <p className="check-meta">{c.meta}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  if (m.properties?.length)
    sections.push({
      id: "run",
      title: "本次运行",
      body: (
        <ul className="bullets">
          {m.properties.map((p, i) => (
            <Term key={i} name={p.label}>
              {p.value}
            </Term>
          ))}
        </ul>
      ),
    });
  if (m.sources?.length)
    sections.push({
      id: "sources",
      title: "来源说明",
      body: (
        <ul className="bullets">
          {m.sources.map((s, i) => (
            <Term key={i} name={s.title}>
              <Rich text={s.detail} />
            </Term>
          ))}
        </ul>
      ),
    });
  if (m.links?.length)
    sections.push({
      id: "links",
      title: "链接",
      body: (
        <ul className="bullets">
          {m.links.map((l) => (
            <li key={l.url}>
              <Ext href={l.url}>{l.title}</Ext>
              {l.site ? <span className="inline-meta"> · {l.site}</span> : null}
            </li>
          ))}
        </ul>
      ),
    });
  const order: CheckStatus[] = ["ok", "partial", "skipped", "failed"];
  return {
    id: "methods",
    title: "取数与来源",
    desc: `${m.checklist.length} 项取数：${order.filter((s) => counts[s]).map((s) => `${STATUS[s]} ${counts[s]}`).join("，")}`,
    sections,
  };
}

/** 某一期的章节，按阅读顺序；缺省模块自动跳过 */
export function chaptersOf(r: Report): Chapter[] {
  return [overview(r), onchain(r), trench(r), defined(r), dexscreener(r), community(r), xDigest(r), methods(r)].filter(
    (c): c is Chapter => c !== null,
  );
}

export const issueTitle = (r: Report) => `${zhDay(r.date)} ${r.edition}`;
