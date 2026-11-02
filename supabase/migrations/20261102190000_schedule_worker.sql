-- Supabase Cron calls the worker every 2 minutes (see docs/data-flow.md → Cadence).
--
-- pg_cron runs the schedule inside Postgres; pg_net sends the HTTP request.
-- The project URL and the secret key come from Vault at run time, so neither is in
-- this file or the repo. Before this job can succeed, two Vault secrets must exist:
--   project_url  https://<project-ref>.supabase.co
--   secret_key   the project's secret key (sb_secret_…), added by hand in the SQL editor
-- The worker (withSupabase({ auth: 'secret' })) accepts the key on the apikey header.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'poll-conditions',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/poll-conditions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body    := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 15000
  );
  $$
);
