// How someone knows the data is current (docs/data-flow.md → Freshness).
// Two clocks: the worker's (last run, every 2 min) and the data's (Open-Meteo's
// reading slot, every 15 min). Pure, so it can be tested; the page calls it on a
// timer, so it turns stale even when no Realtime events arrive.

export type FreshnessState = "loading" | "fresh" | "stale" | "down";

export const RUN_EVERY_MS = 2 * 60_000;
// Three missed runs.
export const STALE_RUN_MS = 3 * RUN_EVERY_MS;
// Two missed 15-min readings, plus a little slack for Open-Meteo publishing late.
export const STALE_READING_MS = 35 * 60_000;

export type FreshnessInput = {
  loaded: boolean;
  latestRun: { ran_at: string; ok: boolean } | null;
  lastGoodRunAt: string | null;
  readingAt: string | null; // the newest observed_at on the page
  now: number;
};

export type Freshness = {
  state: FreshnessState;
  // Why it's in that state, for the banner.
  reason: "loading" | "ok" | "never-ran" | "worker-behind" | "reading-old" | "last-run-failed";
};

export function freshness({ loaded, latestRun, lastGoodRunAt, readingAt, now }: FreshnessInput): Freshness {
  if (!loaded) return { state: "loading", reason: "loading" };
  if (latestRun && !latestRun.ok) return { state: "down", reason: "last-run-failed" };
  if (!lastGoodRunAt || !readingAt) return { state: "stale", reason: "never-ran" };
  if (now - Date.parse(lastGoodRunAt) > STALE_RUN_MS) return { state: "stale", reason: "worker-behind" };
  if (now - Date.parse(readingAt) > STALE_READING_MS) return { state: "stale", reason: "reading-old" };
  return { state: "fresh", reason: "ok" };
}

// "just now", "40 sec ago", "3 min ago", "2 hr ago"
export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

// "11:45 AM", Chicago time, since every location is in Chicago.
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
