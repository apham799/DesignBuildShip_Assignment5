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

export function DivvySection({ locationName, nearby, status, justChanged, freshness, lastGoodRunAt, unavailable, now }: Props) {
  const headingId = `divvy-${locationName.replace(/\W+/g, "-").toLowerCase()}`;
  if (!nearby.length) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 border-t border-rule pt-4">
      <h4 id={headingId} className="flex items-center gap-2 text-label text-muted">
        <DockIcon />
        Bike there with Divvy
      </h4>

      {unavailable ? (
        <p className="flex items-center gap-2 text-body text-error">
          <ErrorIcon className="size-4" />
          Divvy counts are unavailable right now.
        </p>
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
                    ≈{distance_m < 1000 ? `${Math.round(distance_m / 10) * 10} m` : `${(distance_m / 1000).toFixed(1)} km`} · {walk(distance_m)}
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
    </section>
  );
}
