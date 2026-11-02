import type { ReactNode } from "react";
import { cx } from "./cx";

type CardProps = {
  children: ReactNode;
  tone?: "plain" | "cream" | "green";
  className?: string;
  as?: "section" | "article" | "div" | "li";
  labelledBy?: string;
};

// White card with the Clubhouse drop shadow. "cream" is the accent card (focus,
// scorecard header). "green" is for the one thing to do next.
export function Card({ children, tone = "plain", className, as: Tag = "div", labelledBy }: CardProps) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cx(
        "rounded-lg border p-5 shadow-card",
        tone === "plain" && "border-rule bg-surface",
        tone === "cream" && "border-cream-deep bg-cream",
        tone === "green" && "border-green-deep bg-green text-on-green",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="text-display">{value}</dd>
      {detail && <dd className="text-body text-muted">{detail}</dd>}
    </div>
  );
}

type BadgeTone = "neutral" | "green" | "brass" | "warning";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-center text-label",
        tone === "neutral" && "border-rule bg-surface text-ink",
        tone === "green" && "border-success/30 bg-success-tint text-success",
        tone === "brass" && "border-brass/50 bg-cream text-ink",
        tone === "warning" && "border-warning/30 bg-warning-tint text-warning",
      )}
    >
      {children}
    </span>
  );
}

// A brass rule with a flag, the small Clubhouse ornament that separates sections.
export function Ornament({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("flex items-center gap-2 text-brass", className)}>
      <span className="h-px flex-1 bg-brass/60" />
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
        <rect x="4" y="2" width="1.5" height="12" />
        <path d="M5.5 2.5 L12 5 L5.5 7.5 Z" />
      </svg>
      <span className="h-px flex-1 bg-brass/60" />
    </div>
  );
}
