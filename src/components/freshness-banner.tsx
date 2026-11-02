import { ago, clock, type Freshness } from "@/lib/freshness";
import type { RealtimeStatus } from "@/lib/use-live-conditions";
import type { WorkerRun } from "@/lib/types";
import { cx, ErrorIcon, Spinner } from "@/components/ui";

// The one place that says how current the page is. Both clocks are always shown in
// words, never by color alone: when the worker last checked, and how old the
// reading is. Stale uses the warning color; Down uses red (errors only) with an icon.

type Props = {
  freshness: Freshness;
  status: RealtimeStatus;
  latestRun: WorkerRun | null;
  lastGoodRun: WorkerRun | null;
  readingAt: string | null;
  now: number;
};

const tone = {
  loading: "border-rule bg-surface",
  fresh: "border-success/40 bg-success-tint",
  stale: "border-warning/40 bg-warning-tint",
  down: "border-error/40 bg-error-tint",
} as const;

function LiveDot() {
  return (
    <span aria-hidden className="relative flex size-3">
      <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-3 rounded-full bg-success" />
    </span>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-5 shrink-0 text-warning" aria-hidden>
      <path d="M8 1.5 L15 14 H1 Z" fill="currentColor" />
      <rect x="7.2" y="5.5" width="1.6" height="4.5" rx="0.5" fill="#fff" />
      <rect x="7.2" y="11" width="1.6" height="1.6" rx="0.5" fill="#fff" />
    </svg>
  );
}

export function FreshnessBanner({ freshness, status, latestRun, lastGoodRun, readingAt, now }: Props) {
  const { state, reason } = freshness;
  const checked = lastGoodRun ? `Checked ${ago(lastGoodRun.ran_at, now)}` : "Not checked yet";
  const reading = readingAt ? `reading from ${clock(readingAt)} (${ago(readingAt, now)})` : "no reading yet";

  let title: string;
  let detail: string;
  if (state === "loading") {
    title = "Loading live conditions…";
    detail = "Connecting to the weather feed.";
  } else if (state === "down") {
    title = "Live updates are down";
    detail = `The last check failed ${latestRun ? ago(latestRun.ran_at, now) : ""}. ${
      lastGoodRun ? `What you see is from the last good check, ${ago(lastGoodRun.ran_at, now)}.` : "There's no good reading yet."
    } It will retry automatically every 2 minutes.`;
  } else if (state === "stale") {
    title = reason === "never-ran" ? "Waiting for the first reading" : "These conditions may be out of date";
    detail =
      reason === "worker-behind"
        ? `${checked}; it normally checks every 2 minutes. Look outside before you head out.`
        : reason === "reading-old"
          ? `The weather service hasn't published a new reading since ${readingAt ? clock(readingAt) : "earlier"}. Readings normally arrive every 15 minutes.`
          : "The weather check runs every 2 minutes. This page will fill in by itself.";
  } else {
    title = "Live";
    detail = `${checked} · ${reading}. New readings arrive every 15 minutes.`;
  }

  return (
    <section
      aria-labelledby="freshness-title"
      className={cx("flex items-start gap-3 rounded-lg border-2 p-4", tone[state])}
    >
      {/* Announces only a change of state, not every tick of "3 min ago". */}
      <p className="sr-only" aria-live="polite">
        {state === "loading" ? "" : `Conditions: ${title}`}
      </p>
      <div className="mt-1">
        {state === "loading" && <Spinner className="size-5 text-muted" />}
        {state === "fresh" && <LiveDot />}
        {state === "stale" && <WarnIcon />}
        {state === "down" && <ErrorIcon className="size-5 text-error" />}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <h2 id="freshness-title" className={cx("text-body font-semibold", state === "down" && "text-error")}>
          {title}
        </h2>
        <p className="text-body text-ink">{detail}</p>
        {state === "down" && latestRun?.error && <p className="text-label text-muted">Error: {latestRun.error}</p>}
        {status === "reconnecting" && state !== "loading" && (
          <p className="text-label text-muted">Reconnecting to live updates… the page refreshes itself when it&apos;s back.</p>
        )}
      </div>
    </section>
  );
}
