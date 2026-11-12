import { Fragment, type ReactNode } from "react";

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** 外链：新窗口打开、不带来源页 */
export function Ext({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** 纯文本，只把 [文字](https://…) 渲染为外链；其余内容由 React 转义 */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    out.push(text.slice(last, at));
    out.push(
      <Ext key={at} href={m[2]}>
        {m[1]}
      </Ext>,
    );
    last = at + m[0].length;
  }
  out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
