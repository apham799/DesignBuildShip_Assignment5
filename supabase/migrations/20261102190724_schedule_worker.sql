-- Supabase Cron calls the worker every 2 minutes (see docs/data-flow.md → Cadence).
--
-- The project URL and the secret key come from Vault at run time, so neither is in
-- this file or the repo. Two Vault secrets must exist (added by hand, not by migration):
--   project_url  https://<project-ref>.supabase.co
--   secret_key   the project's default secret key (sb_secret_…)
-- The worker (withSupabase({ auth: 'secret' })) accepts the key on the apikey header.

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
