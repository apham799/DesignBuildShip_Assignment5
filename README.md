# Can I Play Right Now?

Live golf conditions at Chicago's public courses and ranges. A worker on Supabase checks the weather every 2 minutes and saves only what changed. Each signed-in golfer follows the places they play and watches a live verdict update on its own: go play, playable with a caveat, or not now.

Design, Build, Ship (MPCS 51238), Assignment 5: Live Data System. It carries forward the golf app from Assignments 3–4 (Bucket List).

- **Live app:** _Vercel URL goes here_
- **Data-flow chart** (made before the code): [`docs/data-flow.md`](docs/data-flow.md)

## How it works

```
Open-Meteo ──every 2 min──▶ Worker ──only what changed──▶ Postgres ──Realtime──▶ Page
(no key)                   Edge Function,                 conditions,             Next.js on Vercel,
                           Supabase Cron                  worker_runs, follows    Clerk sign-in
```

1. **Source**: [Open-Meteo](https://open-meteo.com/) current conditions for 8 locations in one batched request. It publishes a new reading every 15 minutes.
2. **Worker**: `supabase/functions/poll-conditions`. Supabase Cron calls it every 2 minutes. It validates the response, compares it with what's stored, and upserts only the rows that differ. Every run adds a row to `worker_runs` (when it ran, whether it worked, how many rows changed), including failed runs.
3. **Database**: `locations` (seeded), `conditions` (one row per location), `worker_runs`, and `follows`. RLS is on for every table, and follows are visible only to their owner.
4. **Page**: subscribes to `conditions` and `worker_runs` over Supabase Realtime with the Clerk session token, so it updates without a refresh.
5. **Guest trial**: signed out, the same live page runs with just the publishable key. Guests follow places in their browser tab, and signing up copies those follows into their account. Guests can read only the public weather tables; `follows` refuses them.

## Freshness

The page shows two clocks: when the worker last checked, and how old the reading is. It's in one of four states:

| State | When |
|---|---|
| Loading | The first query hasn't returned yet |
| Fresh | The worker checked in the last 6 min (3 runs) and the reading is under 35 min old |
| Stale | Either clock is older than that. A timer on the page catches this even when no events arrive |
| Down | The worker's latest run failed. The error is shown, along with when the last good check was |

## Tests

```
npm test
```

- **Worker** (`worker.test.ts`): runs the real worker on two Open-Meteo responses saved on Nov 1, 2026, at the 23:30 and 23:45 readings, against a fake database. It checks:
  - the first run saves all 8 rows, with the right values and UTC times
  - the same reading again writes **nothing** but still records the run
  - the next reading updates the changed rows
  - a one-location change upserts exactly one row
  - an outage, a renamed field, reordered locations, a missing location, or a failed write all record a failed run and save nothing
- **Freshness** (`freshness.test.ts`): the four page states at their boundaries.

## Run locally

Create `.env.local` with:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Then run `npm install` and `npm run dev`. The Supabase secret key is never in this file. Only the worker uses it, and Supabase provides it on its own servers.

## Stack

Next.js 16, Tailwind CSS 4, Clerk, Supabase (Postgres, Realtime, Edge Functions, Cron) and Open-Meteo. The worker is Deno code, so `supabase/` is excluded from `tsconfig.json` and ESLint.
