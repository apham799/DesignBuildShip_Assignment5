// Runs the Divvy worker on two real GBFS responses saved on Nov 2, 2026, 3 minutes
// apart (10:25 and 10:28 PM Chicago), trimmed to our 14 docks plus 3 others, with
// a fake database that records every write. Run with: npm test

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runOnce, type FetchJson, type RunRecord, type StationRow, type Store } from "./worker.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const FEED_0325 = fixture("divvy-0325.json");
const FEED_0328 = fixture("divvy-0328.json");

// The 14 docks seeded in the divvy_tables migration.
const IDS = [
  "a3a547b8-a135-11e9-9cda-0a87ae2ba916", // 63rd St Beach
  "a3b1c47b-a135-11e9-9cda-0a87ae2ba916", // Central Ave & Harrison St
  "a3b1ca28-a135-11e9-9cda-0a87ae2ba916", // Central Ave & Madison St
  "080ab938-2c1b-4fcf-a83d-74c5ae6ff305", // Cottage Grove Ave & 111th Pl
  "7dc58bb9-24de-4544-9a12-c3975139370f", // Doty Ave & 111th St
  "a3aac4f9-a135-11e9-9cda-0a87ae2ba916", // DuSable Lake Shore Dr & Diversey Pkwy
  "a3a6d371-a135-11e9-9cda-0a87ae2ba916", // DuSable Lake Shore Dr & Wellington Ave
  "2265362184138796866", // Inner Lakeshore Dr & Waveland Ave
  "2239011021643536028", // Obama Presidential Center
  "a3a845b0-a135-11e9-9cda-0a87ae2ba916", // Pine Grove Ave & Waveland Ave
  "a3a528d0-a135-11e9-9cda-0a87ae2ba916", // Stony Island Ave & 64th St
  "a3ae78ab-a135-11e9-9cda-0a87ae2ba916", // Warren Park East
  "a3ae82e0-a135-11e9-9cda-0a87ae2ba916", // Warren Park West
  "2197048925058850020", // Woodlawn Ave & 103rd St
];
const DIVERSEY = "a3aac4f9-a135-11e9-9cda-0a87ae2ba916";
const STONY_ISLAND = "a3a528d0-a135-11e9-9cda-0a87ae2ba916";

function fakeStore(stored: StationRow[] = [], ids = IDS) {
  const upserts: StationRow[][] = [];
  const runs: RunRecord[] = [];
  const store: Store = {
    loadStationIds: async () => ids,
    loadStatus: async () => stored,
    upsertStatus: async (rows) => void upserts.push(rows),
    recordRun: async (run) => void runs.push(run),
  };
  return { store, upserts, runs };
}

const source = (body: unknown): FetchJson => async () => structuredClone(body);
type Feed = { last_updated: number; data: { stations: Record<string, unknown>[] } };
const edit = (feed: Feed, fn: (f: Feed) => void) => {
  const copy = structuredClone(feed);
  fn(copy);
  return copy;
};

async function firstRun(feed = FEED_0325) {
  const db = fakeStore();
  await runOnce(db.store, source(feed));
  return db.upserts[0];
}

describe("poll-divvy worker", () => {
  console.log = () => {};
  console.error = () => {};

  it("first run: saves our 14 docks out of the 17 in the feed, with the right counts", async () => {
    const db = fakeStore();
    const run = await runOnce(db.store, source(FEED_0325));

    assert.equal(db.upserts[0].length, 14, "the 3 docks we don't watch are filtered out");
    assert.deepEqual(
      db.upserts[0].find((r) => r.station_id === DIVERSEY),
      {
        station_id: DIVERSEY,
        bikes: 14,
        ebikes: 4,
        docks: 5,
        is_renting: true, // Lyft sends 1
        is_returning: true,
        is_reporting: true,
        reported_at: "2026-11-03T03:23:39.000Z",
      },
    );
    assert.deepEqual(db.runs, [{ ok: true, rows_changed: 14, source_time: "2026-11-03T03:24:41.000Z", error: null, duration_ms: run.duration_ms }]);
  });

  it("a dock silent for 2 days is saved as not reporting (and not renting)", async () => {
    const stony = (await firstRun()).find((r) => r.station_id === STONY_ISLAND)!;
    assert.equal(stony.is_reporting, false);
    assert.equal(stony.is_renting, false);
  });

  it("3 minutes later: only Diversey changed counts, so only Diversey is written", async () => {
    // In the real feed, 12 of our 14 docks sent a new last_reported between these two
    // responses, but only Diversey's counts moved (5 open docks -> 4).
    const db = fakeStore(await firstRun());
    await runOnce(db.store, source(FEED_0328));

    assert.deepEqual(db.upserts[0].map((r) => r.station_id), [DIVERSEY]);
    assert.equal(db.upserts[0][0].docks, 4);
    assert.equal(db.runs[0].rows_changed, 1);
  });

  it("same feed again: writes nothing, but still records the run", async () => {
    const db = fakeStore(await firstRun());
    await runOnce(db.store, source(FEED_0325));

    assert.equal(db.upserts.length, 0, "no upsert, so Realtime sends nothing");
    assert.equal(db.runs[0].ok, true);
    assert.equal(db.runs[0].rows_changed, 0);
  });

  it("a dock goes offline (no report for 31 min): that row is written", async () => {
    const stored = await firstRun();
    const offline = edit(FEED_0325, (f) => {
      const s = f.data.stations.find((x) => x.station_id === DIVERSEY)!;
      s.last_reported = f.last_updated - 31 * 60;
    });
    const db = fakeStore(stored);
    await runOnce(db.store, source(offline));

    assert.deepEqual(db.upserts[0].map((r) => [r.station_id, r.is_reporting]), [[DIVERSEY, false]]);
  });

  it("one of our docks is removed from the feed: skips it and saves the rest", async () => {
    const removed = edit(FEED_0325, (f) => {
      f.data.stations = f.data.stations.filter((x) => x.station_id !== DIVERSEY);
    });
    const db = fakeStore();
    const run = await runOnce(db.store, source(removed));

    assert.equal(run.ok, true);
    assert.equal(db.upserts[0].length, 13);
  });

  it("most of our docks vanish: refuses to save a partial picture", async () => {
    const gutted = edit(FEED_0325, (f) => {
      f.data.stations = f.data.stations.slice(0, 5);
    });
    const db = fakeStore();
    const run = await runOnce(db.store, source(gutted));

    assert.equal(db.upserts.length, 0);
    assert.equal(run.ok, false);
    assert.match(run.error!, /of our 14 docks are in the feed/);
  });

  it("a field is renamed: fails loudly instead of saving blanks", async () => {
    const renamed = edit(FEED_0325, (f) => {
      for (const s of f.data.stations) {
        s.num_docks_free = s.num_docks_available;
        delete s.num_docks_available;
      }
    });
    const db = fakeStore();
    const run = await runOnce(db.store, source(renamed));

    assert.equal(db.upserts.length, 0);
    assert.match(run.error!, /num_docks_available is missing/);
  });

  it("the feed is down: writes nothing and records a failed run", async () => {
    const db = fakeStore();
    const run = await runOnce(db.store, async () => {
      throw new Error("Divvy HTTP 503: Service Unavailable");
    });

    assert.equal(db.upserts.length, 0);
    assert.equal(run.ok, false);
    assert.equal(run.source_time, null);
    assert.equal(db.runs.length, 1, "the failure is recorded, so the page can show Divvy as down");
  });

  it("not a GBFS response at all: fails with a clear error", async () => {
    const run = await runOnce(fakeStore().store, source({ message: "Not Found" }));
    assert.equal(run.error, "last_updated is missing or not a number");
  });
});
