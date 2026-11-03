# Data flow: "Can I Play Right Now?"

Drafted before any code (Assignment 5, step 3). Live golf conditions for the Chicago courses and ranges from Assignment 4.

```mermaid
flowchart LR
    subgraph Source["Open-Meteo (no key)"]
        OM["/v1/forecast?current=…<br/>8 locations, 1 batched request<br/>new reading every 15 min"]
    end

    subgraph Supabase
        CRON["Supabase Cron<br/>every 2 min, odd minutes"]
        W["Edge Function<br/><b>poll-conditions</b><br/>(Deno, secret key)"]
        subgraph DB["Postgres (RLS on every table)"]
            LOC[("locations<br/>seeded by migration")]
            CON[("conditions<br/>1 row per location")]
            RUNS[("worker_runs<br/>1 row per run")]
            FOL[("follows<br/>user_id + location_id")]
        end
        RT["Realtime<br/>(publication: conditions, worker_runs)"]
    end

    subgraph Vercel
        PAGE["Next.js page<br/>Clerk sign-in, or guest trial"]
    end

    TAB[("guest's follows<br/>sessionStorage, this tab only")]

    CRON -- "HTTP POST" --> W
    W -- "read coordinates" --> LOC
    W -- "GET current conditions" --> OM
    OM -- "JSON array, 1 object per location" --> W
    W -- "upsert ONLY changed rows" --> CON
    W -- "insert: ran_at, ok, rows_changed, error" --> RUNS
    CON -- "UPDATE events" --> RT
    RUNS -- "INSERT events" --> RT
    RT -- "websocket push<br/>(only rows RLS lets the user read)" --> PAGE
    PAGE -- "follow / unfollow<br/>(Clerk token → RLS)" --> FOL
    PAGE -- "guest follow / unfollow" --> TAB
    TAB -. "copied into follows on sign-in" .-> FOL
    PAGE -- "initial load" --> CON
```

## What each part sends to the next

| From → To | What is sent | Shape |
|---|---|---|
| Cron → Worker | A trigger, nothing else | `POST /functions/v1/poll-conditions` |
| Worker → Open-Meteo | Comma-separated lat/lon for 8 locations | `current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day&daily=sunset` |
| Open-Meteo → Worker | An array with one object per location, **in the same order as requested** | `current.time` is the 15-min reading slot, e.g. `2026-11-01T23:45` |
| Worker → `conditions` | Only the locations whose values differ from what is stored | upsert on `location_id` |
| Worker → `worker_runs` | One row each run, whether it worked or failed | `ran_at, ok, rows_changed, source_time, error, duration_ms` |
| Realtime → Page | Each changed `conditions` row and each new `worker_runs` row | Postgres change payload |
| Page → `follows` | Which locations this person follows | `user_id` filled from the Clerk token, never sent by the app |
| Page → tab (guest) | A guest's follows, in `sessionStorage` | `["jackson-park", …]`. On sign-in they're upserted into `follows` (duplicates skipped), then cleared |

**Who can read what.** `locations`, `conditions` and `worker_runs` hold only public weather and worker health, so guests (the `anon` role, publishable key) can read them, including over Realtime. `follows` is signed-in only, with each person limited to their own rows. A guest's requests to it get `401 permission denied`.

## Freshness (two clocks)

- **Worker clock**: the latest `worker_runs.ran_at`. It shows the worker is alive. It should tick every 2 min.
- **Data clock**: `conditions.observed_at`, Open-Meteo's reading slot. It should advance every 15 min.

| State | Rule |
|---|---|
| Loading | Initial query hasn't returned yet |
| Fresh | Last run worked within ~6 min (3 runs) **and** the reading is less than 35 min old |
| Stale | No successful run in more than 6 min, **or** the reading is more than 35 min old (2 missed slots) |
| Down | The most recent `worker_runs` row has `ok = false` |

## What would break if one part changed

- **Open-Meteo reorders or drops a location**: the response has no ids, only order, so readings would land on the wrong course. The worker checks the count, and that each returned coordinate is within 0.1° of the one requested, before writing. Open-Meteo snaps coordinates to its grid, by up to 0.033° for these locations.
- **Open-Meteo renames a field** (e.g. `wind_gusts_10m`): the parsed value is `undefined`. The worker validates every field, so the run is recorded with `ok = false` and the page shows **Down** instead of blanks.
- **Worker rewrites every row each run**: Realtime would push about 8 messages to every open page every 2 minutes, even when nothing changed, which uses up the free quota. Saving only changed rows prevents that.
- **A table is left out of the Realtime publication, or its RLS read policy is missing**: the page silently gets nothing. Both are set in migrations.
- **Cron stops**: no new `worker_runs` rows arrive. The page uses its own timer to mark the data **Stale** after 6 min.

## Cadence and quotas

- Open-Meteo free tier: 10,000 calls/day. It isn't documented whether one 8-location request counts as 8 calls, so assume it does. Every 2 min is 720 runs × 8 = **5,760/day**. Every 1 min would be 11,520/day, over the limit.
- Supabase Edge Functions: 720 runs/day × 30 days = **21,600 of 500,000** monthly calls.
- New readings appear about 15 s after each 15-min mark, so the page lags the source by at most about 2 min.

## What the logs showed (first 8 hours, 242 runs)

- **4 failed runs, all from Open-Meteo.** Each was recorded in `worker_runs`, and the next run recovered.
  - **3 timeouts at exactly :00:10 past the hour** (21:00, 22:00, 00:00 UTC). Open-Meteo is slowest on the hour. The fix was to run on odd minutes (`1-59/2`) so the worker never polls at :00, and to raise its wait from 10 s to 20 s.
  - **1 `HTTP 429: Daily API request limit exceeded`** at 20:10 UTC, after only a few hundred of our calls. Most likely the limit counts per IP, and Edge Functions share outgoing IPs with other projects. We can't control that. The page shows **Down** with the error, and the next run fixes it.
- **Open-Meteo revises readings between its 15-min slots.** 32 runs saved changes while `current.time` stayed the same. That's about once per slot, at any minute, usually all 8 locations together. These are real changes from the source, so saving them is correct. It isn't a comparison bug: a bug would rewrite rows on every run, and runs with no change saved 0 rows.


---

# Second source: Divvy bikes ("Bike there?")

Planned before any Divvy code, on branch `feature/divvy`. Each card answers one more question: can I bike there, and is there an open dock when I arrive?

```mermaid
flowchart LR
    subgraph Source2["Divvy GBFS 2.3 (Lyft, no key)"]
        GB["station_status.json<br/>2,079 stations, ~880 KB<br/>refreshes every 60 s (ttl)"]
    end

    subgraph Supabase
        CRON2["Supabase Cron<br/>every minute"]
        W2["Edge Function<br/><b>poll-divvy</b><br/>(Deno, secret key)"]
        subgraph DB2["Postgres (RLS on every table)"]
            ST[("stations<br/>13 docks, seeded")]
            LS[("location_stations<br/>2 nearest docks per location")]
            SS[("station_status<br/>1 row per dock")]
            DR[("divvy_runs<br/>1 row per run")]
        end
        RT2["Realtime<br/>(publication: station_status, divvy_runs)"]
    end

    PAGE2["Next.js page<br/>Divvy section on each card"]

    CRON2 -- "HTTP POST" --> W2
    W2 -- "read our 13 station ids" --> ST
    W2 -- "GET whole city" --> GB
    GB -- "JSON: data.stations[]" --> W2
    W2 -- "keep our 13, upsert ONLY changed" --> SS
    W2 -- "insert: ran_at, ok, rows_changed, error" --> DR
    SS -- "UPDATE events" --> RT2
    DR -- "INSERT events" --> RT2
    RT2 -- "websocket push" --> PAGE2
    PAGE2 -- "initial load" --> LS
```

## Decisions and why

| Decision | Why |
|---|---|
| **Its own worker** (`poll-divvy`) and its own Cron job | If Divvy is down, weather still says Fresh, and the reverse. Each source has its own freshness line. |
| **Its own runs table** (`divvy_runs`), not a `source` column on `worker_runs` | The deployed page reads the latest `worker_runs` row as the weather clock. A Divvy run there would mislabel weather freshness on production while this branch is being built. |
| **Every minute** | Matches the feed's 60 s `ttl`. About 43,200 calls/month, plus 21,600 for weather, out of 500,000. |
| **Stations seeded by migration**, 2 nearest real docks per location | Docks rarely move, so the worker only needs `station_status` and never the 680 KB `station_information`. Leaves out the 848 "Public Rack" entries (plain racks that last reported in June 2025) and docks silent for over a week. Every location has a real dock within about 860 m; Columbus Park's nearest is 503 m away, past several racks. |
| **Compare counts, not `last_reported`** | Docks report about every minute even when nothing changes. Comparing `last_reported` would rewrite all 13 rows every minute: 13 Realtime messages per open page per minute, enough to use up the free Realtime quota. The worker stores `is_reporting` instead (last report under 30 min old), which only flips when a dock actually goes offline. |
| **Open docks shown first** | Biking *to* the course, the question is whether you can dock. Bikes and e-bikes come second, for the ride home. |

## What would break if one part changed

- **A dock is removed from the feed**: the worker skips it and logs it. If fewer than half our docks are found, the run fails, and the page shows Divvy as **Down** instead of showing blanks.
- **GBFS 2.3 is retired** (Lyft also serves 1.1): the URL returns 404, every run is recorded as failed, and the Divvy line shows **Down**. Weather is unaffected.
- **The feed stops updating** (`last_updated` frozen): the worker still succeeds, but the page compares `last_updated` with now and shows Divvy as **Stale** after 5 min.

## Divvy freshness

| State | Rule |
|---|---|
| Fresh | Last good run ≤ 3 min ago (3 missed runs) **and** feed `last_updated` ≤ 5 min old |
| Stale | Either clock is older than that |
| Down | The latest `divvy_runs` row failed |

## First look at the feed (Nov 2, 10:25 PM Chicago)

Two calls 193 s apart: **57 of 2,079** stations changed counts city-wide. Near our courses, one changed: DuSable Lake Shore Dr & Diversey went from 5 open docks to 4. The feed is live but quiet at night. Daytime will be much busier.
