import { DataTable, LinkColumnIcon, NumberColumnIcon, TagColumnIcon, TextColumnIcon } from "@/components/ui/data-table";
import { usd } from "@/lib/format";
import { Ext, Rich } from "@/lib/rich";
import type { Report } from "@/lib/types";
import { Callout, Card, Note, Section, Tag } from "./parts";

/* ---------------- Defined 新池 ---------------- */

export function Defined({ d }: { d: NonNullable<Report["defined"]> }) {
  const narrated = d.tokens.map((t, i) => ({ ...t, rank: i + 1 })).filter((t) => t.narrative);
  const bare = d.tokens.filter((t) => !t.narrative);
  return (
    <div className="stack">
      <Section id="defined" kicker={`Defined / Codex · ${d.fetched_at}`} title={d.title} caption={d.caption}>
        {d.changes && <Callout tone="info" title="榜单变化" text={d.changes} />}
        <DataTable
          title={`新池观察榜 · 前 ${d.tokens.length}`}
          editable={false}
          tagTones={Object.fromEntries(d.tokens.filter((t) => t.status).map((t) => [t.status!, t.status === "新上" ? "green" : "blue"]))}
          columns={[
            { key: "rank", label: "名次", type: "number", icon: <NumberColumnIcon />, width: "100px" },
            { key: "symbol", label: "代币", type: "title", icon: <TextColumnIcon />, width: "150px" },
            { key: "chain", label: "链", type: "text", width: "80px" },
            { key: "status", label: "榜单变动", type: "tag", icon: <TagColumnIcon />, width: "140px" },
            { key: "volume", label: "24h 交易量", type: "number", icon: <NumberColumnIcon />, format: usd },
            { key: "liquidity", label: "流动性", type: "number", icon: <NumberColumnIcon />, format: usd },
            { key: "url", label: "Defined 页面", type: "link", icon: <LinkColumnIcon />, width: "220px" },
          ]}
          rows={d.tokens.map((t, i) => ({
            id: `${i}-${t.symbol}`,
            rank: i + 1,
            symbol: t.symbol,
            chain: t.chain ?? "",
            status: t.status ?? "",
            volume: t.volume_24h_usd,
            liquidity: t.liquidity_usd,
            url: t.url,
          }))}
        />
      </Section>
      <Section id="narratives" title="叙事" caption="只写有可核实资料的代币。">
        {narrated.length > 0 && (
          <div className="cards cards--wide">
            {narrated.map((t) => (
              <Card
                key={`${t.rank}-${t.symbol}`}
                title={
                  <>
                    <span className="rank">{t.rank}</span>
                    <Ext href={t.url}>{t.symbol}</Ext>
                  </>
                }
                meta={t.status && <Tag tone={t.status === "新上" ? "good" : "info"}>{t.status}</Tag>}
              >
                <p>
                  <Rich text={t.narrative!} />
                </p>
              </Card>
            ))}
          </div>
        )}
        {bare.length > 0 && (
          <p className="muted">
            {narrated.length === 0 ? "本期榜单均无可核实叙事。" : `暂无可核实叙事：${bare.map((t) => t.symbol).join("、")}。`}
          </p>
        )}
        {d.method && (
          <details className="disclosure">
            <summary>筛选方法</summary>
            <Note text={d.method} />
          </details>
        )}
      </Section>
    </div>
  );
}

/* ---------------- 社区与代码 ---------------- */

export function Community({ rd, gh }: { rd?: Report["reddit"]; gh?: Report["github"] }) {
  return (
    <div className="stack">
      {rd && (
        <Section
          id="reddit"
          kicker="Reddit"
          title={rd.subreddit}
          aside={
            <span className="sec__aside">
              {rd.since ? `自上次正式早报（${rd.since}）以来 · ` : ""}
              {rd.posts.length} 篇新帖 · <Ext href={rd.url}>打开 ↗</Ext>
            </span>
          }
        >
          {rd.summary && (
            <Card title="摘要">
              <p>
                <Rich text={rd.summary} />
              </p>
            </Card>
          )}
          {rd.posts.length > 0 ? (
            <DataTable
              title="新帖"
              editable={false}
              columns={[
                { key: "title", label: "标题", type: "title", icon: <TextColumnIcon /> },
                { key: "author", label: "作者", type: "text", width: "220px" },
                { key: "comments", label: "评论", type: "text", width: "80px" },
                { key: "url", label: "链接", type: "link", icon: <LinkColumnIcon />, width: "200px" },
              ]}
              rows={rd.posts.map((p, i) => ({
                id: String(i),
                title: p.title,
                author: p.author,
                comments: p.comments === null ? "--" : String(p.comments),
                url: p.url,
              }))}
            />
          ) : (
            <p className="muted">本窗口无新帖。</p>
          )}
          {rd.note && <Note text={rd.note} />}
        </Section>
      )}
      {gh && (
        <Section id="github" kicker="GitHub" title={gh.org} aside={<Tag tone={gh.updated ? "good" : "neutral"}>{gh.updated ? "有更新" : "无更新"}</Tag>}>
          <Card>
            <p>
              <Rich text={gh.text} /> <Ext href={gh.url}>github.com/{gh.org} ↗</Ext>
            </p>
          </Card>
        </Section>
      )}
    </div>
  );
}

/* ---------------- X 摘要 ---------------- */

export function XDigest({ x }: { x: NonNullable<Report["x_digest"]> }) {
  return (
    <div className="stack">
      <Section id="x" kicker={x.window ? `X · ${x.window}` : "X"} title="关注账号 X 摘要" caption={x.caption}>
        {x.mainline && <Callout tone="info" title="今日主线" text={x.mainline} />}
        <div className="cards cards--wide">
          {x.accounts?.map((a) => (
            <Card
              key={a.handle}
              title={
                <span className="acct">
                  <span className="acct__avatar" aria-hidden="true">
                    {a.name.slice(0, 1)}
                  </span>
                  <span>
                    {a.name}
                    <Ext className="acct__handle" href={`https://x.com/${a.handle}`}>
                      @{a.handle}
                    </Ext>
                  </span>
                </span>
              }
              meta={`${a.items.length} 条`}
            >
              <ul className="xitems">
                {a.items.map((it, i) => (
                  <li key={i}>
                    <h4>
                      {it.title}
                      {it.truncated && <Tag tone="warn">截断</Tag>}
                      {it.unverified && <Tag tone="bad">未核实</Tag>}
                    </h4>
                    <p>
                      <Rich text={it.detail} />
                    </p>
                    <p className="src">
                      {it.url && <Ext href={it.url}>原帖 ↗</Ext>}
                      {it.links?.map((l) => (
                        <Ext key={l.url} href={l.url}>
                          {l.label} ↗
                        </Ext>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
              {a.note && (
                <p className="readnote">
                  <b>读法</b>
                  <Rich text={a.note} />
                </p>
              )}
            </Card>
          ))}
        </div>
      </Section>
      {x.tools && x.tools.length > 0 && (
        <Section id="tools" title="工具">
          <div className="cards">
            {x.tools.map((t) => (
              <Card key={t.title} title={t.title}>
                <p>
                  <Rich text={t.detail} />
                </p>
                {t.links && (
                  <p className="src">
                    {t.links.map((l) => (
                      <Ext key={l.url} href={l.url}>
                        {l.label} ↗
                      </Ext>
                    ))}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ---------------- 取数与来源 ---------------- */

const STATUS = {
  ok: { icon: "✓", label: "完成", tone: "good" },
  partial: { icon: "◐", label: "部分", tone: "warn" },
  skipped: { icon: "–", label: "未取", tone: "neutral" },
  failed: { icon: "✕", label: "失败", tone: "bad" },
} as const;

export function Methods({ m, coverage }: { m: Report["methods"]; coverage: string }) {
  const tally = m.checklist.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
  const summary = (Object.keys(STATUS) as (keyof typeof STATUS)[])
    .filter((k) => tally[k])
    .map((k) => `${STATUS[k].label} ${tally[k]}`)
    .join(" · ");
  return (
    <div className="stack">
      <Section id="methods" kicker="审计" title="取数与来源" caption={`覆盖窗口：${coverage}`}>
        <Card title="各数据源状态" meta={summary}>
          <ul className="checks">
            {m.checklist.map((c, i) => {
              const s = STATUS[c.status];
              return (
                <li key={i} data-tone={s.tone}>
                  <span className="checks__icon" aria-hidden="true">
                    {s.icon}
                  </span>
                  <div>
                    <strong>{c.text}</strong> <Tag tone={s.tone}>{s.label}</Tag>
                    {c.meta && (
                      <p>
                        <Rich text={c.meta} />
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        {m.properties && m.properties.length > 0 && (
          <Card title="本次取数">
            <dl className="props">
              {m.properties.map((p) => (
                <div key={p.label}>
                  <dt>{p.label}</dt>
                  <dd>
                    <Rich text={p.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
        {m.sources && m.sources.length > 0 && (
          <details className="disclosure" open>
            <summary>各数据源口径</summary>
            <Card>
              <dl className="props">
                {m.sources.map((s) => (
                  <div key={s.title}>
                    <dt>{s.title}</dt>
                    <dd>
                      <Rich text={s.detail} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </details>
        )}
      </Section>
      {m.links && m.links.length > 0 && (
        <Section id="links" title="来源入口">
          <ul className="linkcards">
            {m.links.map((l) => (
              <li key={l.url}>
                <Ext href={l.url}>
                  <strong>{l.title}</strong>
                  <span>{l.site} ↗</span>
                </Ext>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
