/** 日报数据（schema_version 1）。权威校验在 web/dailysite/validate.py，这里只描述形状。 */

export type Link = { label: string; url: string };
export type NoticeTone = "info" | "warning" | "danger";
export type CheckStatus = "ok" | "partial" | "skipped" | "failed";

export type FngPoint = { date: string; value: number; class_en?: string; class_zh: string };

export type Protocol = {
  name: string;
  url?: string;
  values: number[];
  ath?: { usd: number; date: string };
};

export type Report = {
  schema_version: 1;
  date: string;
  edition: string;
  issued_at: string;
  coverage: string;
  summary: string;
  highlights: string[];
  notices?: { tone: NoticeTone; title: string; text: string }[];
  fng?: { source: string; latest: FngPoint; previous?: FngPoint };
  revenue?: { source: string; caption?: string; dates: string[]; protocols: Protocol[]; notes?: string[] };
  tehc?: {
    source?: string;
    caption?: string;
    trench?: {
      date: string;
      score: number;
      label: string;
      label_zh?: string;
      note?: string;
      history?: { date: string; score: number }[];
      components?: { name: string; usd?: number; count?: number; percentile: number }[];
      components_note?: string;
    };
    launchpads?: {
      caption?: string;
      total?: { volume_usd: number; launches: number };
      rows: { name: string; volume_usd: number; launches: number }[];
    };
    bots?: {
      caption?: string;
      total?: { volume_usd: number; fees_usd: number };
      rows: { name: string; volume_usd: number; fees_usd: number }[];
      warning?: string;
    };
    chains?: {
      caption?: string;
      rows: { name: string; dex_volume_usd: number; wallets: number; date?: string }[];
    };
  };
  defined?: {
    title: string;
    fetched_at: string;
    caption?: string;
    changes?: string;
    tokens: {
      symbol: string;
      chain?: string;
      url: string;
      liquidity_usd: number;
      volume_24h_usd: number;
      status?: string;
      narrative: string | null;
    }[];
    method?: string;
  };
  reddit?: {
    subreddit: string;
    url: string;
    since?: string;
    summary?: string;
    note?: string;
    posts: { title: string; url: string; author: string; comments: number | null }[];
  };
  github?: { org: string; url: string; updated: boolean; text: string };
  x_digest?: {
    caption?: string;
    window?: string;
    mainline?: string;
    accounts?: {
      name: string;
      handle: string;
      note?: string;
      items: { title: string; detail: string; url?: string; links?: Link[]; truncated?: boolean; unverified?: boolean }[];
    }[];
    tools?: { title: string; detail: string; links?: Link[] }[];
  };
  methods: {
    properties?: { label: string; value: string }[];
    checklist: { text: string; status: CheckStatus; meta?: string }[];
    sources?: { title: string; detail: string }[];
    links?: { title: string; site?: string; url: string }[];
  };
};
