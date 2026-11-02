# Can I Play Right Now?: project context

Design, Build, Ship (MPCS 51238), Assignment 5, "Live Data System". This carries the Assignment 4 golf app (Bucket List) forward into a live system. A worker polls current weather at the Chicago courses and outdoor ranges from A4. Each signed-in golfer follows the places they play and watches a live playability verdict update without refreshing.

The data-flow chart, made before any code, is in `docs/data-flow.md`. Keep it in sync when the flow changes.

## Stack
- Next.js 16 + Tailwind CSS 4, deployed on Vercel's free Hobby plan from GitHub (`apham799/DesignBuildShip_Assignment5`).
- **Clerk** for sign-in. Development keys only.
- **Supabase**: Postgres, Realtime, and the worker. It's connected to Clerk through third-party auth, and RLS is on for **every** table.
- **Worker**: the Supabase Edge Function `poll-conditions` (Deno, TypeScript), in `supabase/functions/`. **Supabase Cron** calls it every 2 minutes.
- **Source**: Open-Meteo `/v1/forecast?current=…`, no key, one batched request for all locations.
- Worker tests use Node's built-in test runner (`npm test`). No test framework is added.

## Hard constraints
- Keys live in `.env.local`, Vercel env vars and Supabase Vault, never in code or commits. The agent may not read `.env*` (deny rule in `.claude/settings.json`). The student creates `.env.local` and the Vault secret by hand.
- The secret key is used **only** by the worker, on Supabase's servers (`withSupabase({ auth: 'secret' })`). It never goes in the browser, a `NEXT_PUBLIC_` variable, or the repo.
- The page talks to Supabase with the Clerk session token, so RLS applies to every query and every Realtime event.
- Schema changes are written as migrations in `supabase/migrations/`, never as one-off edits in the dashboard.
- `supabase` is in the `tsconfig.json` `exclude` list. The worker is Deno code, and the Next.js build must not type-check it.
- **Save only what changed.** The worker compares each new reading to the stored row and upserts only the rows that differ. Realtime bills every change sent to every open page.
- Stay on free tiers. Open-Meteo allows 10,000 calls/day. Count one batched request as one call per location, so 8 locations every 2 min = 5,760/day. Don't poll faster without redoing that math.
- Don't add packages, services or tables we don't need. Push back if one is suggested.
- Commit in small steps that show progress.

## Data model (all in `public`, all with RLS)

**`locations`**: reference data, seeded by migration. The worker reads coordinates from here.
`id text pk`, `name`, `kind ('course' | 'range')`, `area`, `lat`, `lon`, `sort int`. Everyone signed in can read it. Nobody writes to it from the app.

**`conditions`**: the latest reading, one row per location. Only the worker writes to it.
`location_id pk → locations`, `observed_at` (Open-Meteo's 15-min slot), `temp_f`, `feels_like_f`, `precip_in`, `weather_code`, `wind_mph`, `gust_mph`, `wind_dir_deg`, `is_day`, `sunset`, `updated_at`. Everyone signed in can read it. It's in the Realtime publication.

**`worker_runs`**: one row per run, whether it worked or failed.
`id`, `ran_at`, `ok`, `rows_changed`, `source_time`, `error`, `duration_ms`. Everyone signed in can read it. It's in the Realtime publication, so the page can see that the worker is down.

**`follows`**: what each person follows.
`user_id text default (auth.jwt() ->> 'sub')`, `location_id → locations`, `created_at`, pk `(user_id, location_id)`. RLS: select, insert and delete only where `(select auth.jwt() ->> 'sub') = user_id`.

## Realtime checklist (all three or the page silently gets nothing)
1. The table is in the `supabase_realtime` publication.
2. `grant select … to authenticated`.
3. An RLS `select` policy lets the signed-in person read the row.

## Freshness states (see `docs/data-flow.md`)
- **Loading**: the first query hasn't returned yet.
- **Fresh**: the last successful run was ≤ 6 min ago **and** the reading is ≤ 35 min old.
- **Stale**: either clock is older than that. The page checks this on its own timer, so it goes stale even when no events arrive.
- **Down**: the latest `worker_runs` row has `ok = false`.

## Design rules (Clubhouse, carried over from A3/A4)
- Page and card backgrounds are **white**. Cream and tan are accents only. Keep club green, brass and the soft drop shadows.
- **Two typefaces** (Fraunces for headings and big numbers, Libre Franklin for body and UI) and **four text roles** (`display`, `heading`, `body`, `label`). Body text is 16px minimum, labels 14px minimum.
- Muted text has ≥ 7:1 contrast on white. **Red is for errors only**, always paired with an icon. The Down state uses it; Stale uses the warning color.
- Live changes are announced politely (`aria-live="polite"`). Motion respects `prefers-reduced-motion`.
- Everything works with the keyboard and has visible focus rings.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
