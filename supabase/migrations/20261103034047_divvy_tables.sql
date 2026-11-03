-- Divvy, the second live source (see docs/data-flow.md → Second source).
--
-- Who writes what:
--   stations, location_stations  seeded here; nobody writes to them from the app
--   station_status, divvy_runs    only the poll-divvy worker (secret key, bypasses RLS)
-- Everything here is public bike-share data, so guests and signed-in people can read
-- it, and nobody can write it from the app.

-- ---------------------------------------------------------------------------
-- stations: the Divvy docks we watch. The 2 nearest real docks to each location,
-- chosen from station_information on Nov 2, 2026. "Public Rack" entries (plain
-- racks, silent since June 2025) and docks silent for over a week are left out.
-- ---------------------------------------------------------------------------
create table public.stations (
  id        text primary key,          -- GBFS station_id
  name      text not null,
  lat       double precision not null,
  lon       double precision not null,
  capacity  int not null check (capacity > 0)
);

insert into public.stations (id, name, lat, lon, capacity) values
  ('a3a547b8-a135-11e9-9cda-0a87ae2ba916', '63rd St Beach', 41.78091096424803, -87.57632374763489, 15),
  ('a3b1c47b-a135-11e9-9cda-0a87ae2ba916', 'Central Ave & Harrison St', 41.872993, -87.764499, 11),
  ('a3b1ca28-a135-11e9-9cda-0a87ae2ba916', 'Central Ave & Madison St', 41.880121, -87.763238, 11),
  ('080ab938-2c1b-4fcf-a83d-74c5ae6ff305', 'Cottage Grove Ave & 111th Pl', 41.69170975847015, -87.61000156402588, 15),
  ('7dc58bb9-24de-4544-9a12-c3975139370f', 'Doty Ave & 111th St', 41.69501044938143, -87.59871482849121, 15),
  ('a3aac4f9-a135-11e9-9cda-0a87ae2ba916', 'DuSable Lake Shore Dr & Diversey Pkwy', 41.932588, -87.636427, 23),
  ('a3a6d371-a135-11e9-9cda-0a87ae2ba916', 'DuSable Lake Shore Dr & Wellington Ave', 41.9366884494997, -87.63682901859283, 15),
  ('2265362184138796866', 'Inner Lakeshore Dr & Waveland Ave', 41.95031, -87.64477, 15),
  ('2239011021643536028', 'Obama Presidential Center', 41.786419, -87.586462, 22),
  ('a3a845b0-a135-11e9-9cda-0a87ae2ba916', 'Pine Grove Ave & Waveland Ave', 41.94947274088333, -87.64645278453827, 23),
  ('a3a528d0-a135-11e9-9cda-0a87ae2ba916', 'Stony Island Ave & 64th St', 41.778881, -87.586647, 11),
  ('a3ae78ab-a135-11e9-9cda-0a87ae2ba916', 'Warren Park East', 42.00454962194, -87.6806661451, 11),
  ('a3ae82e0-a135-11e9-9cda-0a87ae2ba916', 'Warren Park West', 42.001785, -87.688829, 11),
  ('2197048925058850020', 'Woodlawn Ave & 103rd St', 41.70738, -87.59404, 4);

-- ---------------------------------------------------------------------------
-- location_stations: which docks serve which course or range, nearest first
-- ---------------------------------------------------------------------------
create table public.location_stations (
  location_id  text not null references public.locations (id) on delete cascade,
  station_id   text not null references public.stations (id) on delete cascade,
  distance_m   int not null check (distance_m >= 0),   -- straight line
  rank         smallint not null check (rank >= 1),
  primary key (location_id, station_id),
  unique (location_id, rank)
);

insert into public.location_stations (location_id, station_id, distance_m, rank) values
  ('jackson-park', 'a3a547b8-a135-11e9-9cda-0a87ae2ba916', 397, 1),
  ('jackson-park', 'a3a528d0-a135-11e9-9cda-0a87ae2ba916', 504, 2),
  ('harborside', '7dc58bb9-24de-4544-9a12-c3975139370f', 858, 1),
  ('harborside', '2197048925058850020', 1496, 2),
  ('sydney-marovitz', '2265362184138796866', 351, 1),
  ('sydney-marovitz', 'a3a845b0-a135-11e9-9cda-0a87ae2ba916', 518, 2),
  ('columbus-park', 'a3b1c47b-a135-11e9-9cda-0a87ae2ba916', 503, 1),
  ('columbus-park', 'a3b1ca28-a135-11e9-9cda-0a87ae2ba916', 601, 2),
  ('robert-a-black', 'a3ae78ab-a135-11e9-9cda-0a87ae2ba916', 94, 1),
  ('robert-a-black', 'a3ae82e0-a135-11e9-9cda-0a87ae2ba916', 683, 2),
  ('diversey-driving-range', 'a3aac4f9-a135-11e9-9cda-0a87ae2ba916', 174, 1),
  ('diversey-driving-range', 'a3a6d371-a135-11e9-9cda-0a87ae2ba916', 352, 2),
  ('harborside-practice-facility', '7dc58bb9-24de-4544-9a12-c3975139370f', 420, 1),
  ('harborside-practice-facility', '080ab938-2c1b-4fcf-a83d-74c5ae6ff305', 1324, 2),
  ('jackson-park-driving-range', 'a3a547b8-a135-11e9-9cda-0a87ae2ba916', 455, 1),
  ('jackson-park-driving-range', '2239011021643536028', 675, 2);

-- ---------------------------------------------------------------------------
-- station_status: the latest counts, one row per dock
-- ---------------------------------------------------------------------------
create table public.station_status (
  station_id    text primary key references public.stations (id) on delete cascade,
  bikes         int not null check (bikes >= 0),     -- classic + e-bikes available
  ebikes        int not null check (ebikes >= 0),
  docks         int not null check (docks >= 0),     -- open docks to return a bike
  is_renting    boolean not null,
  is_returning  boolean not null,
  is_reporting  boolean not null,                    -- last report < 30 min old
  reported_at   timestamptz not null,                -- last_reported when the counts last changed
  updated_at    timestamptz not null default now()   -- when the worker last wrote this row
);

-- ---------------------------------------------------------------------------
-- divvy_runs: one row per poll-divvy run. Separate from worker_runs on purpose:
-- the page reads the latest worker_runs row as the weather worker's clock.
-- ---------------------------------------------------------------------------
create table public.divvy_runs (
  id            bigint generated always as identity primary key,
  ran_at        timestamptz not null default now(),
  ok            boolean not null,
  rows_changed  int not null default 0 check (rows_changed >= 0),
  source_time   timestamptz,               -- the feed's last_updated; null if it failed
  error         text,
  duration_ms   int
);

create index divvy_runs_ran_at_idx on public.divvy_runs (ran_at desc);

-- ---------------------------------------------------------------------------
-- RLS, grants, Realtime
-- ---------------------------------------------------------------------------
alter table public.stations          enable row level security;
alter table public.location_stations enable row level security;
alter table public.station_status    enable row level security;
alter table public.divvy_runs        enable row level security;

create policy "anyone can read stations"          on public.stations          for select to anon, authenticated using (true);
create policy "anyone can read location stations" on public.location_stations for select to anon, authenticated using (true);
create policy "anyone can read station status"    on public.station_status    for select to anon, authenticated using (true);
create policy "anyone can read divvy runs"        on public.divvy_runs        for select to anon, authenticated using (true);

-- Supabase's default privileges grant everything on new tables; take it back first.
revoke all on public.stations, public.location_stations, public.station_status, public.divvy_runs from anon, authenticated;
grant select on public.stations, public.location_stations, public.station_status, public.divvy_runs to anon, authenticated;

alter publication supabase_realtime add table public.station_status, public.divvy_runs;
