-- Runs the club list import automatically: on the 1st and 15th of each month at 05:00 (UTC).
-- Run this ONCE in the Supabase SQL editor, after the sync-clubs function has been deployed.
--
-- The function ignores a second call within 12 hours and leaves the list alone if either website
-- looks different from what it expects, so this is safe to leave running.
--
-- To change how often: edit the five-part schedule below and run the file again (it replaces the old one).
-- To stop it:  select cron.unschedule('ynepf-sync-clubs');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ynepf-sync-clubs',
  '0 5 1,15 * *',
  $job$
    select net.http_post(
      url := 'https://altuwgzzouwhrsdnzadj.supabase.co/functions/v1/sync-clubs',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $job$
);
