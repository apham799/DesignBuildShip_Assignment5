-- Move the worker off the top of the hour. In the first 8 hours, 3 of 242 runs timed
-- out at exactly :00:10 (21:00, 22:00, 00:00 UTC): Open-Meteo is slowest on the hour,
-- when many clients poll at once. Odd minutes (:01, :03, … :59) never land on :00 and
-- still pick up each 15-min reading within 2 minutes. Same job name, so this replaces
-- the schedule from *_schedule_worker.sql. The HTTP timeout goes from 15 s to 30 s,
-- to cover the worker's own 20 s wait for Open-Meteo.

select cron.schedule(
  'poll-conditions',
  '1-59/2 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/poll-conditions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    body    := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 30000
  );
  $$
);
