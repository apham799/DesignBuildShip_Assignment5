-- pg_cron runs schedules inside Postgres; pg_net lets SQL send HTTP requests.
-- Together they are Supabase Cron calling the worker (see *_schedule_worker.sql).
create extension if not exists pg_cron;
create extension if not exists pg_net;
