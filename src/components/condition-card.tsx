import type React from "react";
import { ago, clock, STALE_READING_MS } from "@/lib/freshness";
import { DivvySection } from "@/components/divvy-section";
import { verdict, type Level } from "@/lib/playability";
import type { Condition, Location } from "@/lib/types";
import { compass, compassWords, describeWeather } from "@/lib/weather";
import { Badge, Button, Card, cx, Skeleton } from "@/components/ui";
import { WeatherIcon } from "@/components/weather-icon";

// One followed course or range: the live verdict first, then the numbers behind it.

const levelBadge: Record<Level, { tone: "green" | "warning" | "neutral"; label: string }> = {
  go: { tone: "green", label: "Go play" },
  caution: { tone: "warning", label: "Playable" },
  no: { tone: "neutral", label: "Not now" },
};

function Reading({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="font-display text-2xl font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="text-label text-muted">{detail}</dd>}
    </div>
  );
}

type Props = {
  location: Location;
  condition: Condition | undefined;
  justChanged: boolean;
  now: number;
  onUnfollow: () => void;
  // Divvy: everything the "Bike there" section needs, minus the location name.
  divvy: Omit<React.ComponentProps<typeof DivvySection>, "locationName" | "now">;
};

export function ConditionCard({ location, condition: c, justChanged, now, onUnfollow, divvy }: Props) {
  const headingId = `loc-${location.id}`;
  const old = c ? now - Date.parse(c.observed_at) > STALE_READING_MS : false;
  const v = c ? verdict(c, location.kind, now) : null;

  return (
    <Card
      as="li"
      labelledBy={headingId}
      className={cx(
        "flex flex-col gap-4 transition-[box-shadow,border-color] duration-700",
        justChanged && "border-brass shadow-lift ring-2 ring-brass/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 id={headingId} className="text-heading">
            {location.name}
          </h3>
          <p className="text-label text-muted">
            {location.kind === "course" ? "Course" : "Range"} · {location.area}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onUnfollow} aria-label={`Unfollow ${location.name}`}>
          Unfollow
        </Button>
      </div>

      {!c || !v ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Waiting for the first reading for {location.name}</span>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <WeatherIcon code={c.weather_code} night={!c.is_day} className="size-12" />
            <div className="flex flex-col gap-1">
              <Badge tone={levelBadge[v.level].tone}>{levelBadge[v.level].label}</Badge>
              <p className="text-body font-semibold">{v.headline}</p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3">
            <Reading label="Temp" value={`${Math.round(c.temp_f)}°F`} detail={`Feels ${Math.round(c.feels_like_f)}°`} />
            <Reading
              label="Wind"
              value={`${Math.round(c.wind_mph)} mph`}
              detail={`Gusts ${Math.round(c.gust_mph)} · from ${compass(c.wind_dir_deg)}`}
            />
            <Reading label="Sky" value={describeWeather(c.weather_code)} detail={c.precip_in > 0 ? `${c.precip_in.toFixed(2)} in rain` : "Dry"} />
          </dl>
          <p className="sr-only">Wind from the {compassWords(c.wind_dir_deg)}.</p>

          <ul className="flex list-disc flex-col gap-1 pl-5 text-body">
            {v.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <p className={cx("text-label", old ? "text-warning" : "text-muted")}>
            {old ? "Old reading: " : "Reading from "}
            {clock(c.observed_at)}
            {justChanged ? " · just updated" : ` · saved ${ago(c.updated_at, now)}`}
          </p>
        </>
      )}

      <DivvySection locationName={location.name} now={now} {...divvy} />
    </Card>
  );
}
