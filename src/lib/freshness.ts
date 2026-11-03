// How someone knows the data is current (docs/data-flow.md → Freshness).
// Two clocks per source: the worker's (its last good run) and the data's (the
// source's own timestamp). Same rule for both sources, different limits. Pure, so
// it can be tested; the page calls it on a timer, so it turns stale even when no
// Realtime events arrive.

export type FreshnessState = "loading" | "fresh" | "stale" | "down";

export type Limits = { staleRunMs: number; staleReadingMs: number };

// Weather: the worker runs every 2 min, so 3 missed runs is 6 min. Open-Meteo
// publishes every 15 min; two missed readings plus slack for publishing late is 35.
export const WEATHER: Limits = { staleRunMs: 6 * 60_000, staleReadingMs: 35 * 60_000 };
// Divvy: the worker runs every minute, so 3 missed runs is 3 min. The feed updates
// every 60 s, so a last_updated over 5 min old means the feed itself is stuck.
export const DIVVY: Limits = { staleRunMs: 3 * 60_000, staleReadingMs: 5 * 60_000 };

// Kept for the condition card's "old reading" label.
export const STALE_READING_MS = WEATHER.staleReadingMs;

export type FreshnessInput = {
  loaded: boolean;
  latestRun: { ran_at: string; ok: boolean } | null;
  lastGoodRunAt: string | null;
  readingAt: string | null; // the source's newest timestamp on the page
  now: number;
  limits?: Limits; // defaults to WEATHER
};

export type Freshness = {
  state: FreshnessState;
  // Why it's in that state, for the banner.
  reason: "loading" | "ok" | "never-ran" | "worker-behind" | "reading-old" | "last-run-failed";
};

export function freshness({ loaded, latestRun, lastGoodRunAt, readingAt, now, limits = WEATHER }: FreshnessInput): Freshness {
  if (!loaded) return { state: "loading", reason: "loading" };
  if (latestRun && !latestRun.ok) return { state: "down", reason: "last-run-failed" };
  if (!lastGoodRunAt || !readingAt) return { state: "stale", reason: "never-ran" };
  if (now - Date.parse(lastGoodRunAt) > limits.staleRunMs) return { state: "stale", reason: "worker-behind" };
  if (now - Date.parse(readingAt) > limits.staleReadingMs) return { state: "stale", reason: "reading-old" };
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
