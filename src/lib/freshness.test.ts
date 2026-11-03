// The page's four states, checked against the rules in docs/data-flow.md.
// Run with: npm test

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIVVY, freshness, type FreshnessInput } from "./freshness.ts";

const NOW = Date.parse("2026-11-02T18:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const healthy: FreshnessInput = {
  loaded: true,
  latestRun: { ran_at: minsAgo(1), ok: true },
  lastGoodRunAt: minsAgo(1),
  readingAt: minsAgo(10),
  now: NOW,
};

describe("freshness", () => {
  it("loading until the first query returns", () => {
    assert.equal(freshness({ ...healthy, loaded: false }).state, "loading");
  });

  it("fresh: worker ran a minute ago, reading is 10 min old", () => {
    assert.deepEqual(freshness(healthy), { state: "fresh", reason: "ok" });
  });

  it("fresh right up to three missed runs (6 min)", () => {
    assert.equal(freshness({ ...healthy, lastGoodRunAt: minsAgo(6) }).state, "fresh");
  });

  it("stale: no successful run for more than 6 min (cron stopped)", () => {
    const f = freshness({ ...healthy, latestRun: { ran_at: minsAgo(7), ok: true }, lastGoodRunAt: minsAgo(7) });
    assert.deepEqual(f, { state: "stale", reason: "worker-behind" });
  });

  it("stale: worker is running but the reading is over 35 min old (source stuck)", () => {
    assert.deepEqual(freshness({ ...healthy, readingAt: minsAgo(36) }), { state: "stale", reason: "reading-old" });
  });

  it("stale: the worker has never run", () => {
    assert.deepEqual(freshness({ ...healthy, latestRun: null, lastGoodRunAt: null, readingAt: null }), { state: "stale", reason: "never-ran" });
  });

  it("down: the latest run failed, even if an earlier one worked", () => {
    const f = freshness({ ...healthy, latestRun: { ran_at: minsAgo(0), ok: false }, lastGoodRunAt: minsAgo(2) });
    assert.deepEqual(f, { state: "down", reason: "last-run-failed" });
  });

  it("back to fresh as soon as the next run works", () => {
    assert.equal(freshness({ ...healthy, latestRun: { ran_at: minsAgo(0), ok: true }, lastGoodRunAt: minsAgo(0) }).state, "fresh");
  });
});

describe("freshness for Divvy (tighter limits)", () => {
  const divvy: FreshnessInput = { ...healthy, limits: DIVVY, readingAt: minsAgo(1) };

  it("fresh: ran a minute ago, feed updated a minute ago", () => {
    assert.equal(freshness(divvy).state, "fresh");
  });

  it("stale after 3 missed runs (4 min), which would still be fresh for weather", () => {
    assert.deepEqual(freshness({ ...divvy, lastGoodRunAt: minsAgo(4) }), { state: "stale", reason: "worker-behind" });
    assert.equal(freshness({ ...healthy, lastGoodRunAt: minsAgo(4) }).state, "fresh");
  });

  it("stale when the feed's last_updated stops moving for over 5 min", () => {
    assert.deepEqual(freshness({ ...divvy, readingAt: minsAgo(6) }), { state: "stale", reason: "reading-old" });
  });

  it("down when the latest Divvy run failed", () => {
    assert.equal(freshness({ ...divvy, latestRun: { ran_at: minsAgo(0), ok: false } }).state, "down");
  });
});
