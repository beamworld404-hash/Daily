import { Fragment, type ReactNode } from "react";
import { toneClass, toneSegments } from "@/lib/tone";

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** 外链：新窗口打开、不带来源页 */
export function Ext({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** 纯文本里的关键数字（恐惧贪婪、Trench、涨跌、占比）按含义着色 */
function Toned({ text, at }: { text: string; at: number }) {
  return (
    <>
      {toneSegments(text).map((s, i) =>
        s.tone ? (
          <span key={`${at}-${i}`} className={toneClass(s.tone)}>
            {s.text}
          </span>
        ) : (
          <Fragment key={`${at}-${i}`}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

/** 纯文本，把 [文字](https://…) 渲染为外链、关键数字着色；其余内容由 React 转义 */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    out.push(<Toned key={`t${last}`} text={text.slice(last, at)} at={last} />);
    out.push(
      <Ext key={at} href={m[2]}>
        {m[1]}
      </Ext>,
    );
    last = at + m[0].length;
  }
  out.push(<Toned key={`t${last}`} text={text.slice(last)} at={last} />);
  return <Fragment>{out}</Fragment>;
}
