import type { ReactNode } from "react";
import type { NoticeTone } from "@/lib/types";
import { Rich } from "@/lib/rich";

/** 一节：小标题（来源）+ 标题 + 说明；正文放 affectUI 组件 */
export function Section({
  id,
  kicker,
  title,
  caption,
  aside,
  children,
}: {
  id: string;
  kicker?: string;
  title: string;
  caption?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sec" id={id} aria-labelledby={`${id}-h`}>
      <header className="sec__head">
        <div className="sec__titles">
          {kicker && <p className="sec__kicker">{kicker}</p>}
          <h2 id={`${id}-h`}>{title}</h2>
        </div>
        {aside}
      </header>
      {caption && (
        <p className="sec__cap">
          <Rich text={caption} />
        </p>
      )}
      <div className="sec__body">{children}</div>
    </section>
  );
}

const ICON: Record<NoticeTone, string> = { info: "i", warning: "!", danger: "✕" };

/** 提示条：修订、口径警告、主线判断。始终可见，不可关闭 */
export function Callout({ tone, title, text }: { tone: NoticeTone; title: string; text: string }) {
  return (
    <aside className="callout" data-tone={tone} role="note">
      <span className="callout__icon" aria-hidden="true">
        {ICON[tone]}
      </span>
      <div>
        <strong>{title}</strong>
        <p>
          <Rich text={text} />
        </p>
      </div>
    </aside>
  );
}

export type TagTone = "neutral" | "good" | "warn" | "bad" | "info";

/** 文字标签：状态不只靠颜色 */
export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span className="tag" data-tone={tone}>
      {children}
    </span>
  );
}

/** 灰色托盘 + 白卡：与 affectUI 卡片同一视觉，用于没有对应组件的纯文字内容 */
export function Card({ title, meta, children, className }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={["tray", className].filter(Boolean).join(" ")}>
      {(title || meta) && (
        <div className="tray__head">
          {title && <h3 className="tray__title">{title}</h3>}
          {meta && <span className="tray__meta">{meta}</span>}
        </div>
      )}
      <div className="tray__card">{children}</div>
    </div>
  );
}

export function Note({ text }: { text: string }) {
  return (
    <p className="note">
      <Rich text={text} />
    </p>
  );
}
