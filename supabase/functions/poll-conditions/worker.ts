// The worker's logic, kept free of Supabase and Deno imports so the test can run it
// on a saved Open-Meteo response with a fake database (worker.test.ts).
// index.ts wires it to the real database on Supabase's servers.

export type Location = { id: string; lat: number; lon: number };

// One row of public.conditions, as the worker writes it.
export type ConditionRow = {
  location_id: string;
  observed_at: string; // ISO UTC
  temp_f: number;
  feels_like_f: number;
  precip_in: number;
  weather_code: number;
  wind_mph: number;
  gust_mph: number;
  wind_dir_deg: number;
  is_day: boolean;
  sunset: string; // ISO UTC
};

// One row of public.worker_runs (ran_at is filled in by the database).
export type RunRecord = {
  ok: boolean;
  rows_changed: number;
  source_time: string | null;
  error: string | null;
  duration_ms: number;
};

// What the worker needs from the database. The real one is in index.ts.
export interface Store {
  loadLocations(): Promise<Location[]>;
  loadConditions(): Promise<ConditionRow[]>;
  upsertConditions(rows: ConditionRow[]): Promise<void>;
  recordRun(run: RunRecord): Promise<void>;
}

export type FetchJson = (url: string) => Promise<unknown>;

// Open-Meteo field → our column. Ten variables, so one request counts as one call per location.
const CURRENT = {
  temperature_2m: "temp_f",
  apparent_temperature: "feels_like_f",
  precipitation: "precip_in",
  weather_code: "weather_code",
  wind_speed_10m: "wind_mph",
  wind_gusts_10m: "gust_mph",
  wind_direction_10m: "wind_dir_deg",
  is_day: "is_day",
} as const;

// Open-Meteo snaps coordinates to its grid (up to 0.033° here), so allow some slack.
// A reordered or missing location is off by far more than this.
const COORD_TOLERANCE = 0.1;

export function sourceUrl(locations: Location[]): string {
  const params = new URLSearchParams({
    latitude: locations.map((l) => l.lat).join(","),
    longitude: locations.map((l) => l.lon).join(","),
    current: Object.keys(CURRENT).join(","),
    daily: "sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "America/Chicago",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

// Open-Meteo times are local wall-clock ("2026-11-01T23:45") plus an offset in seconds.
function toUtc(local: unknown, offsetSeconds: number, what: string): string {
  if (typeof local !== "string") throw new Error(`${what} is missing`);
  const ms = Date.parse(`${local}:00Z`) - offsetSeconds * 1000;
  if (Number.isNaN(ms)) throw new Error(`${what} is not a time: ${local}`);
  return new Date(ms).toISOString();
}

function num(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${what} is missing or not a number`);
  return value;
}

type Json = Record<string, unknown>;

// Turns the response into one row per location. Throws, with a message that ends up
// in worker_runs.error, if the response isn't the shape we planned for.
export function parseResponse(body: unknown, locations: Location[]): ConditionRow[] {
  const items = Array.isArray(body) ? (body as Json[]) : [body as Json];
  if (items.length !== locations.length) {
    throw new Error(`expected ${locations.length} locations, got ${items.length}`);
  }

  return items.map((item, i) => {
    const loc = locations[i];
    const where = `${loc.id}:`;
    const lat = num(item?.latitude, `${where} latitude`);
    const lon = num(item?.longitude, `${where} longitude`);
    if (Math.abs(lat - loc.lat) > COORD_TOLERANCE || Math.abs(lon - loc.lon) > COORD_TOLERANCE) {
      throw new Error(`${where} response is for ${lat},${lon}, out of order or wrong location`);
    }

    const offset = num(item.utc_offset_seconds, `${where} utc_offset_seconds`);
    const current = item.current as Json | undefined;
    if (!current) throw new Error(`${where} current is missing`);
    const daily = item.daily as { sunset?: unknown[] } | undefined;

    const v = (field: keyof typeof CURRENT) => num(current[field], `${where} current.${field}`);
    return {
      location_id: loc.id,
      observed_at: toUtc(current.time, offset, `${where} current.time`),
      temp_f: v("temperature_2m"),
      feels_like_f: v("apparent_temperature"),
      precip_in: v("precipitation"),
      weather_code: v("weather_code"),
      wind_mph: v("wind_speed_10m"),
      gust_mph: v("wind_gusts_10m"),
      wind_dir_deg: v("wind_direction_10m"),
      is_day: v("is_day") === 1,
      sunset: toUtc(daily?.sunset?.[0], offset, `${where} daily.sunset`),
    };
  });
}

// Postgres hands back timestamps as "…+00:00" and real columns as 4-byte floats, so
// compare times as instants and numbers with a little slack instead of with ===.
function same(a: ConditionRow, b: ConditionRow): boolean {
  return (Object.keys(b) as (keyof ConditionRow)[]).every((k) => {
    const x = a[k];
    const y = b[k];
    if (k === "observed_at" || k === "sunset") return Date.parse(x as string) === Date.parse(y as string);
    if (typeof y === "number") return typeof x === "number" && Math.abs(x - y) < 1e-3;
    return x === y;
  });
}

// Only the rows that are new or differ from what's stored. Everything else is
// left alone, so Realtime sends nothing for it.
export function changedRows(stored: ConditionRow[], incoming: ConditionRow[]): ConditionRow[] {
  const byId = new Map(stored.map((r) => [r.location_id, r]));
  return incoming.filter((row) => {
    const old = byId.get(row.location_id);
    return !old || !same(old, row);
  });
}

export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = (body as Json | null)?.reason ?? res.statusText;
    throw new Error(`Open-Meteo HTTP ${res.status}: ${reason}`);
  }
  return body;
};

// One run: fetch, save what changed, record the run. Always records the run, even
// when something fails, so the page can show "down".
export async function runOnce(store: Store, fetch: FetchJson, now: () => number = Date.now): Promise<RunRecord> {
  const started = now();
  let run: RunRecord;
  try {
    const locations = await store.loadLocations();
    const [body, stored] = await Promise.all([fetch(sourceUrl(locations)), store.loadConditions()]);
    const incoming = parseResponse(body, locations);
    const changed = changedRows(stored, incoming);
    if (changed.length > 0) await store.upsertConditions(changed);

    run = { ok: true, rows_changed: changed.length, source_time: incoming[0].observed_at, error: null, duration_ms: now() - started };
    console.log(
      `poll-conditions ok: ${incoming.length} locations, reading ${run.source_time}, ` +
        `${changed.length} changed${changed.length ? ` (${changed.map((r) => r.location_id).join(", ")})` : ""}, ${run.duration_ms}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run = { ok: false, rows_changed: 0, source_time: null, error: message, duration_ms: now() - started };
    console.error(`poll-conditions FAILED after ${run.duration_ms}ms: ${message}`);
  }

  await store.recordRun(run);
  return run;
}
