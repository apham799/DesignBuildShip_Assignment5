// Runs the worker on two real Open-Meteo responses saved on Nov 1, 2026 (the 23:30
// and 23:45 readings, Chicago time), with a fake database that records every write.
// Run with: npm test

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runOnce, type ConditionRow, type FetchJson, type Location, type RunRecord, type Store } from "./worker.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const READING_2330 = fixture("open-meteo-2330.json");
const READING_2345 = fixture("open-meteo-2345.json");

// Same ids, coordinates and order as the locations seed in the migration.
const LOCATIONS: Location[] = [
  { id: "jackson-park", lat: 41.7793, lon: -87.5806 },
  { id: "harborside", lat: 41.6946, lon: -87.5884 },
  { id: "sydney-marovitz", lat: 41.9519, lon: -87.6411 },
  { id: "columbus-park", lat: 41.8764, lon: -87.7685 },
  { id: "robert-a-black", lat: 42.0049, lon: -87.6817 },
  { id: "diversey-driving-range", lat: 41.9338, lon: -87.6351 },
  { id: "harborside-practice-facility", lat: 41.6933, lon: -87.5942 },
  { id: "jackson-park-driving-range", lat: 41.7846, lon: -87.5787 },
];

// A fake database: starts with `stored` rows and remembers every write.
function fakeStore(stored: ConditionRow[] = []) {
  const upserts: ConditionRow[][] = [];
  const runs: RunRecord[] = [];
  const store: Store = {
    loadLocations: async () => LOCATIONS,
    loadConditions: async () => stored,
    upsertConditions: async (rows) => void upserts.push(rows),
    recordRun: async (run) => void runs.push(run),
  };
  return { store, upserts, runs };
}

const source = (body: unknown): FetchJson => async () => structuredClone(body);
const quiet = () => {
  // Keep the worker's log lines out of the test output.
  console.log = () => {};
  console.error = () => {};
};

// What a row looks like coming back out of Postgres: "+00:00" timestamps.
const asPostgres = (r: ConditionRow): ConditionRow => ({
  ...r,
  observed_at: r.observed_at.replace(".000Z", "+00:00"),
  sunset: r.sunset.replace(".000Z", "+00:00"),
});

async function firstRun(body = READING_2330) {
  const db = fakeStore();
  await runOnce(db.store, source(body));
  return db.upserts[0];
}

describe("poll-conditions worker", () => {
  quiet();

  it("first run: saves every location, with the values from the response", async () => {
    const db = fakeStore();
    const run = await runOnce(db.store, source(READING_2330));

    assert.equal(db.upserts.length, 1);
    assert.equal(db.upserts[0].length, 8);
    assert.deepEqual(
      db.upserts[0].find((r) => r.location_id === "jackson-park"),
      {
        location_id: "jackson-park",
        observed_at: "2026-11-02T05:30:00.000Z", // 23:30 Chicago (UTC-6) → UTC
        temp_f: 54.3,
        feels_like_f: 50.7,
        precip_in: 0,
        weather_code: 0,
        wind_mph: 6.9,
        gust_mph: 13.2,
        wind_dir_deg: 165,
        is_day: false,
        sunset: "2026-11-01T22:44:00.000Z", // 16:44 Chicago
      },
    );
    assert.deepEqual(db.runs, [{ ok: true, rows_changed: 8, source_time: "2026-11-02T05:30:00.000Z", error: null, duration_ms: run.duration_ms }]);
  });

  it("same reading again: writes nothing, but still records the run", async () => {
    const stored = (await firstRun()).map(asPostgres);
    const db = fakeStore(stored);
    await runOnce(db.store, source(READING_2330));

    assert.equal(db.upserts.length, 0, "no upsert, so Realtime sends nothing");
    assert.equal(db.runs.length, 1);
    assert.equal(db.runs[0].ok, true);
    assert.equal(db.runs[0].rows_changed, 0);
  });

  it("next 15-min reading: saves the rows that changed, with the new values", async () => {
    const stored = (await firstRun()).map(asPostgres);
    const db = fakeStore(stored);
    await runOnce(db.store, source(READING_2345));

    assert.equal(db.upserts[0].length, 8, "every location's reading moved on");
    const marovitz = db.upserts[0].find((r) => r.location_id === "sydney-marovitz")!;
    assert.equal(marovitz.observed_at, "2026-11-02T05:45:00.000Z");
    assert.equal(marovitz.gust_mph, 15.9); // was 10.7 at 23:30
    assert.equal(db.runs[0].rows_changed, 8);
  });

  it("only one location differs: upserts only that one", async () => {
    const stored = (await firstRun(READING_2345)).map(asPostgres);
    stored[3] = { ...stored[3], gust_mph: 99 }; // columbus-park
    const db = fakeStore(stored);
    await runOnce(db.store, source(READING_2345));

    assert.deepEqual(db.upserts[0].map((r) => r.location_id), ["columbus-park"]);
    assert.equal(db.runs[0].rows_changed, 1);
  });

  it("source is down: writes no conditions and records a failed run", async () => {
    const db = fakeStore();
    const down: FetchJson = async () => {
      throw new Error("Open-Meteo HTTP 503: Service Unavailable");
    };
    const run = await runOnce(db.store, down);

    assert.equal(db.upserts.length, 0);
    assert.equal(run.ok, false);
    assert.equal(run.error, "Open-Meteo HTTP 503: Service Unavailable");
    assert.equal(run.source_time, null);
    assert.equal(db.runs.length, 1, "the failure is recorded, so the page can show Down");
  });

  it("a field is renamed: fails loudly instead of saving blanks", async () => {
    const renamed = structuredClone(READING_2330);
    for (const item of renamed) {
      item.current.wind_gust_10m = item.current.wind_gusts_10m;
      delete item.current.wind_gusts_10m;
    }
    const db = fakeStore();
    const run = await runOnce(db.store, source(renamed));

    assert.equal(db.upserts.length, 0);
    assert.equal(run.ok, false);
    assert.match(run.error!, /jackson-park: current\.wind_gusts_10m is missing/);
  });

  it("locations come back out of order: refuses to save them on the wrong course", async () => {
    const shuffled = structuredClone(READING_2330).reverse();
    const db = fakeStore();
    const run = await runOnce(db.store, source(shuffled));

    assert.equal(db.upserts.length, 0);
    assert.match(run.error!, /out of order or wrong location/);
  });

  it("a location is missing: refuses to save a partial batch", async () => {
    const db = fakeStore();
    const run = await runOnce(db.store, source(READING_2330.slice(0, 7)));

    assert.equal(db.upserts.length, 0);
    assert.equal(run.error, "expected 8 locations, got 7");
  });

  it("the database write fails: the run is recorded as failed", async () => {
    const db = fakeStore();
    db.store.upsertConditions = async () => {
      throw new Error("upsert conditions: permission denied");
    };
    const run = await runOnce(db.store, source(READING_2330));

    assert.equal(run.ok, false);
    assert.equal(db.runs[0].error, "upsert conditions: permission denied");
  });
});
