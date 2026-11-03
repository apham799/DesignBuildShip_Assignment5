import type React from "react";
import { ago, type Freshness } from "@/lib/freshness";
import type { NearbyStation, StationStatus } from "@/lib/types";
import { cx, ErrorIcon, Skeleton } from "@/components/ui";

// "Bike there?" on each card: the nearest Divvy docks, open docks first (can I park
// when I arrive?), then bikes (can I ride home?). Every state is spelled out in
// words, not color alone.

type Props = {
  locationName: string;
  nearby: NearbyStation[];
  status: Record<string, StationStatus>;
  justChanged: Set<string>;
  freshness: Freshness;
  lastGoodRunAt: string | null;
  unavailable: boolean;
  now: number;
};

// Straight-line distance at an easy walk (80 m a minute), rounded up a little.
const walk = (m: number) => `${Math.max(1, Math.round(m / 80))} min walk`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function DockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-5 shrink-0 text-green" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="11" r="2.6" />
      <circle cx="12" cy="11" r="2.6" />
      <path d="M4 11 L7 5.5 H10.5 L12 11 M7 5.5 L8.5 11 H4 M6 3.5 H8" />
    </svg>
  );
}

// What one dock means for a golfer right now.
function describe(s: StationStatus): { headline: string; detail: string; tone: "ok" | "warn" | "muted" } {
  if (!s.is_reporting) return { headline: "Not reporting", detail: "This dock has gone quiet. Its counts may be wrong.", tone: "muted" };
  if (!s.is_renting && !s.is_returning) return { headline: "Closed", detail: "Not renting or taking bikes right now.", tone: "muted" };
  const ebikes = s.ebikes > 0 ? ` (${s.ebikes} e-bike${s.ebikes === 1 ? "" : "s"})` : "";
  const bikes = s.is_renting ? `${plural(s.bikes, "bike")}${ebikes} to ride home` : "Not renting bikes";
  if (!s.is_returning) return { headline: "Not taking bikes", detail: bikes, tone: "warn" };
  if (s.docks === 0) return { headline: "Full: no open docks", detail: bikes, tone: "warn" };
  return { headline: plural(s.docks, "open dock"), detail: bikes, tone: "ok" };
}

// "≈170 m" / "≈1.5 km", straight line.
const distance = (m: number) => (m < 1000 ? `≈${Math.round(m / 10) * 10} m` : `≈${(m / 1000).toFixed(1)} km`);

// Collapsed by default (a native <details>, so it works with the keyboard and screen
// readers announce it as expandable). The summary line still carries the one thing
// worth knowing at a glance, the nearest dock, and never hides a Divvy problem:
// unavailable, down and stale show in the summary too.
export function DivvySection({ locationName, nearby, status, justChanged, freshness, lastGoodRunAt, unavailable, now }: Props) {
  if (!nearby.length) return null;

  const nearest = nearby[0];
  const nearestStatus = status[nearest.station.id];
  const anyChanged = nearby.some((n) => justChanged.has(n.station.id));

  let summary: React.ReactNode;
  if (unavailable) {
    summary = (
      <span className="flex items-center gap-1.5 text-error">
        <ErrorIcon className="size-4" />
        unavailable right now
      </span>
    );
  } else if (freshness.state === "down") {
    summary = (
      <span className="flex items-center gap-1.5 text-error">
        <ErrorIcon className="size-4" />
        updates are down
      </span>
    );
  } else if (!nearestStatus) {
    summary = <span className="text-muted">loading…</span>;
  } else {
    const d = describe(nearestStatus);
    summary = (
      <span className={cx(d.tone === "warn" ? "text-warning" : "text-muted")}>
        nearest: <span className={cx("font-semibold", d.tone === "ok" && "text-ink")}>{d.headline.toLowerCase()}</span>, {distance(nearest.distance_m)}
        {freshness.state === "stale" && <span className="text-warning"> · may be out of date</span>}
      </span>
    );
  }

  return (
    <details className="group border-t border-rule pt-3">
      <summary
        className={cx(
          "-mx-2 flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-label transition-colors hover:bg-cream [&::-webkit-details-marker]:hidden",
          anyChanged && "bg-cream ring-2 ring-brass/60",
        )}
      >
        {/* A down chevron, the usual sign for "this opens below". */}
        <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-green" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6 L8 10.5 L12.5 6" />
        </svg>
        <DockIcon />
        <span className="font-semibold text-ink">
          Bike there with Divvy<span className="sr-only"> to {locationName}</span>
        </span>
        <span aria-hidden className="text-muted">·</span>
        {summary}
        {anyChanged && <span className="text-muted">· just updated</span>}
      </summary>

      <div className="flex flex-col gap-2 pt-2">
        {unavailable ? (
          <p className="text-body">Divvy counts couldn&apos;t be loaded. Weather above is unaffected.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {nearby.map(({ station, distance_m }) => {
              const s = status[station.id];
              const d = s ? describe(s) : null;
              return (
                <li
                  key={station.id}
                  className={cx(
                    "flex flex-col rounded-md px-2 py-1.5 transition-[box-shadow,background-color] duration-700",
                    justChanged.has(station.id) && "bg-cream ring-2 ring-brass/60",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    {d ? (
                      <span className={cx("text-body font-semibold", d.tone === "warn" && "text-warning", d.tone === "muted" && "text-muted")}>
                        {d.headline}
                      </span>
                    ) : (
                      <Skeleton className="h-5 w-28" />
                    )}
                    <span className="shrink-0 text-label text-muted">
                      {distance(distance_m)} · {walk(distance_m)}
                    </span>
                  </div>
                  <span className="text-label text-muted">
                    {station.name}
                    {d ? ` · ${d.detail}` : ""}
                    {s && justChanged.has(station.id) ? " · just updated" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!unavailable && freshness.state === "stale" && (
          <p className="text-label text-warning">
            Divvy counts may be out of date{lastGoodRunAt ? `: last checked ${ago(lastGoodRunAt, now)}` : ""}.
          </p>
        )}
        {!unavailable && freshness.state === "down" && (
          <p className="flex items-center gap-1.5 text-label text-error">
            <ErrorIcon className="size-4" />
            Divvy updates are down{lastGoodRunAt ? `; these counts are from ${ago(lastGoodRunAt, now)}` : ""}.
          </p>
        )}
      </div>
    </details>
  );
}
