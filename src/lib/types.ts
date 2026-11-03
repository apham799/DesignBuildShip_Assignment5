// Rows as the page reads them from Supabase (see supabase/migrations).

export type Location = {
  id: string;
  name: string;
  kind: "course" | "range";
  area: string;
  sort: number;
};

export type Condition = {
  location_id: string;
  observed_at: string;
  temp_f: number;
  feels_like_f: number;
  precip_in: number;
  weather_code: number;
  wind_mph: number;
  gust_mph: number;
  wind_dir_deg: number;
  is_day: boolean;
  sunset: string;
  updated_at: string;
};

export type WorkerRun = {
  id: number;
  ran_at: string;
  ok: boolean;
  rows_changed: number;
  source_time: string | null;
  error: string | null;
  duration_ms: number | null;
};

// Divvy (see supabase/migrations/*_divvy_tables.sql).

export type Station = { id: string; name: string; capacity: number };

// A dock near a location, nearest first.
export type NearbyStation = { station: Station; distance_m: number; rank: number };

export type StationStatus = {
  station_id: string;
  bikes: number;
  ebikes: number;
  docks: number;
  is_renting: boolean;
  is_returning: boolean;
  is_reporting: boolean;
  reported_at: string;
  updated_at: string;
};

// Same shape as worker_runs; source_time is the feed's last_updated.
export type DivvyRun = WorkerRun;
