// The Divvy worker's logic, kept free of Supabase and Deno imports so the test can
// run it on saved GBFS responses with a fake database (worker.test.ts).
// index.ts wires it to the real database on Supabase's servers.

// One row of public.station_status, as the worker writes it.
export type StationRow = {
  station_id: string;
  bikes: number;
  ebikes: number;
  docks: number;
  is_renting: boolean;
  is_returning: boolean;
  is_reporting: boolean;
  reported_at: string; // ISO UTC
};

// One row of public.divvy_runs (ran_at is filled in by the database).
export type RunRecord = {
  ok: boolean;
  rows_changed: number;
  source_time: string | null;
  error: string | null;
  duration_ms: number;
};

export interface Store {
  loadStationIds(): Promise<string[]>;
  loadStatus(): Promise<StationRow[]>;
  upsertStatus(rows: StationRow[]): Promise<void>;
  recordRun(run: RunRecord): Promise<void>;
}

export type FetchJson = (url: string) => Promise<unknown>;

// GBFS 2.3, the version Divvy (Lyft) serves with e-bike counts per station.
export const SOURCE_URL = "https://gbfs.lyft.com/gbfs/2.3/chi/en/station_status.json";

// A dock that hasn't reported in this long is treated as offline.
const REPORTING_MS = 30 * 60_000;

type Json = Record<string, unknown>;

function num(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${what} is missing or not a number`);
  return value;
}

// GBFS 2.x says booleans, but Lyft sends 1 / 0. Accept both.
function flag(value: unknown, what: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error(`${what} is missing or not a flag`);
}

// Keeps only our docks, out of the whole city's ~2,000. Throws, with a message that
// ends up in divvy_runs.error, if the feed isn't the shape we planned for.
export function parseFeed(body: unknown, ids: string[]): { rows: StationRow[]; sourceTime: string; missing: string[] } {
  const feed = body as Json | null;
  const lastUpdated = num(feed?.last_updated, "last_updated");
  const stations = (feed?.data as Json | undefined)?.stations;
  if (!Array.isArray(stations)) throw new Error("data.stations is missing");

  const byId = new Map((stations as Json[]).map((s) => [s.station_id, s]));
  const missing = ids.filter((id) => !byId.has(id));
  // A dock or two can be removed; most of them vanishing means the feed changed.
  if (ids.length - missing.length < Math.ceil(ids.length / 2)) {
    throw new Error(`only ${ids.length - missing.length} of our ${ids.length} docks are in the feed`);
  }

  const rows = ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const s = byId.get(id)!;
      const where = `${id}:`;
      const reported = num(s.last_reported, `${where} last_reported`) * 1000;
      return {
        station_id: id,
        bikes: num(s.num_bikes_available, `${where} num_bikes_available`),
        // Not in the GBFS core spec; Lyft adds it. Missing means none.
        ebikes: s.num_ebikes_available === undefined ? 0 : num(s.num_ebikes_available, `${where} num_ebikes_available`),
        docks: num(s.num_docks_available, `${where} num_docks_available`),
        is_renting: flag(s.is_renting, `${where} is_renting`),
        is_returning: flag(s.is_returning, `${where} is_returning`),
        // Measured against the feed's own clock, so a saved response tests the same way.
        is_reporting: lastUpdated * 1000 - reported < REPORTING_MS,
        reported_at: new Date(reported).toISOString(),
      };
    });

  return { rows, sourceTime: new Date(lastUpdated * 1000).toISOString(), missing };
}

// Docks report about every minute even when nothing changes, so reported_at is left
// out of the comparison. Otherwise every dock would be rewritten (and pushed to every
// open page) every minute.
const COMPARED = ["bikes", "ebikes", "docks", "is_renting", "is_returning", "is_reporting"] as const;

export function changedRows(stored: StationRow[], incoming: StationRow[]): StationRow[] {
  const byId = new Map(stored.map((r) => [r.station_id, r]));
  return incoming.filter((row) => {
    const old = byId.get(row.station_id);
    return !old || COMPARED.some((k) => old[k] !== row[k]);
  });
}

export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Divvy HTTP ${res.status}: ${res.statusText}`);
  return await res.json();
};

// One run: fetch, save what changed, record the run. Always records the run, even
// when something fails, so the page can show Divvy as down.
export async function runOnce(store: Store, fetch: FetchJson, now: () => number = Date.now): Promise<RunRecord> {
  const started = now();
  let run: RunRecord;
  try {
    const [ids, stored] = await Promise.all([store.loadStationIds(), store.loadStatus()]);
    const { rows, sourceTime, missing } = parseFeed(await fetch(SOURCE_URL), ids);
    const changed = changedRows(stored, rows);
    if (changed.length > 0) await store.upsertStatus(changed);

    run = { ok: true, rows_changed: changed.length, source_time: sourceTime, error: null, duration_ms: now() - started };
    console.log(
      `poll-divvy ok: ${rows.length} docks, feed ${sourceTime}, ${changed.length} changed` +
        `${changed.length ? ` (${changed.map((r) => `${r.station_id.slice(0, 8)} bikes=${r.bikes} docks=${r.docks}`).join("; ")})` : ""}` +
        `${missing.length ? `, ${missing.length} missing from feed (${missing.join(", ")})` : ""}, ${run.duration_ms}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run = { ok: false, rows_changed: 0, source_time: null, error: message, duration_ms: now() - started };
    console.error(`poll-divvy FAILED after ${run.duration_ms}ms: ${message}`);
  }

  await store.recordRun(run);
  return run;
}
