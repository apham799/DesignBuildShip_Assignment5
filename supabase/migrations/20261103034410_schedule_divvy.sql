-- Supabase Cron calls poll-divvy every minute, matching the Divvy feed's 60 s ttl
-- (see docs/data-flow.md → Second source). Its own job, so the weather schedule
-- (odd minutes) and this one fail and recover independently. URL and key come from
-- the same Vault secrets as the weather job.

select cron.schedule(
  'poll-divvy',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/poll-divvy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body    := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 30000
  );
  $$
);
