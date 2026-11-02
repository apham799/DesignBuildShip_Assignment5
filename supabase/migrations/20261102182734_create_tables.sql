-- Can I Play Right Now?: the four tables (see AGENTS.md → Data model).
--
-- Who writes what:
--   locations    seeded here; nobody writes to it from the app
--   conditions   only the worker (secret key, bypasses RLS)
--   worker_runs  only the worker
--   follows      each signed-in person, for their own rows only
--
-- Realtime needs three things for a table, or the page silently gets nothing:
--   1. the table in the supabase_realtime publication
--   2. select granted to authenticated
--   3. an RLS select policy that lets the signed-in person read the row
-- conditions and worker_runs get all three, at the bottom of this file.

-- ---------------------------------------------------------------------------
-- locations: where the worker fetches weather. Order (sort) is the order of the
-- batched Open-Meteo request, and the response comes back in the same order.
-- ---------------------------------------------------------------------------
create table public.locations (
  id     text primary key,
  name   text not null,
  kind   text not null check (kind in ('course', 'range')),
  area   text not null,
  lat    double precision not null,
  lon    double precision not null,
  sort   int not null unique
);

insert into public.locations (id, name, kind, area, lat, lon, sort) values
  ('jackson-park',                 'Jackson Park',                   'course', 'South Side · 18 holes',                41.7793, -87.5806, 1),
  ('harborside',                   'Harborside International',       'course', 'Far South Side · Port & Starboard, 36 holes', 41.6946, -87.5884, 2),
  ('sydney-marovitz',              'Sydney R. Marovitz',             'course', 'North Side lakefront · 9 holes',       41.9519, -87.6411, 3),
  ('columbus-park',                'Columbus Park',                  'course', 'West Side · 9 holes',                  41.8764, -87.7685, 4),
  ('robert-a-black',               'Robert A. Black',                'course', 'Far North Side · 9 holes',             42.0049, -87.6817, 5),
  ('diversey-driving-range',       'Diversey Driving Range',         'range',  'Lincoln Park · covered, heated bays',  41.9338, -87.6351, 6),
  ('harborside-practice-facility', 'Harborside Practice Facility',   'range',  'Far South Side · outdoor range',       41.6933, -87.5942, 7),
  ('jackson-park-driving-range',   'Jackson Park Driving Range',     'range',  'South Side · outdoor range',           41.7846, -87.5787, 8);

-- ---------------------------------------------------------------------------
-- conditions: the latest reading, one row per location
-- ---------------------------------------------------------------------------
create table public.conditions (
  location_id   text primary key references public.locations (id) on delete cascade,
  observed_at   timestamptz not null,       -- Open-Meteo's 15-min reading slot
  temp_f        real not null,
  feels_like_f  real not null,
  precip_in     real not null,              -- precipitation in the last 15 min
  weather_code  smallint not null,          -- WMO code
  wind_mph      real not null,
  gust_mph      real not null,
  wind_dir_deg  smallint not null,
  is_day        boolean not null,
  sunset        timestamptz not null,
  updated_at    timestamptz not null default now()  -- when the worker last wrote this row
);

-- ---------------------------------------------------------------------------
-- worker_runs: one row per run, whether it worked or not
-- ---------------------------------------------------------------------------
create table public.worker_runs (
  id            bigint generated always as identity primary key,
  ran_at        timestamptz not null default now(),
  ok            boolean not null,
  rows_changed  int not null default 0 check (rows_changed >= 0),
  source_time   timestamptz,               -- the reading slot the source returned; null if it failed
  error         text,                      -- null when ok
  duration_ms   int
);

create index worker_runs_ran_at_idx on public.worker_runs (ran_at desc);

-- ---------------------------------------------------------------------------
-- follows: what each person follows
-- ---------------------------------------------------------------------------
create table public.follows (
  user_id      text not null default (auth.jwt() ->> 'sub'),
  location_id  text not null references public.locations (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.locations   enable row level security;
alter table public.conditions  enable row level security;
alter table public.worker_runs enable row level security;
alter table public.follows     enable row level security;

-- Shared live data: anyone signed in can read it. There are no insert, update or
-- delete policies, so only the worker's secret key (which bypasses RLS) can write.
create policy "signed in can read locations"   on public.locations   for select to authenticated using (true);
create policy "signed in can read conditions"  on public.conditions  for select to authenticated using (true);
create policy "signed in can read worker runs" on public.worker_runs for select to authenticated using (true);

-- Personal choices: each person sees and changes only their own rows.
create policy "read own follows"   on public.follows for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
create policy "add own follows"    on public.follows for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "remove own follows" on public.follows for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- ---------------------------------------------------------------------------
-- Grants: signed-out visitors (anon) get nothing; signed-in people get only what
-- the policies above allow.
-- ---------------------------------------------------------------------------
revoke all on public.locations, public.conditions, public.worker_runs, public.follows from anon;
grant select on public.locations, public.conditions, public.worker_runs to authenticated;
grant select, insert, delete on public.follows to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: push changes to open pages
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.conditions, public.worker_runs;
