-- Guest trial: signed-out visitors (anon) see the same live conditions as everyone
-- else. These three tables hold only public weather, place names and worker health,
-- so there is nothing private to protect. follows is unchanged: signed in only, own
-- rows only. A guest's follows live in their browser tab until they sign up.
--
-- Realtime checks the same grants and policies, so guests get live updates too.

grant select on public.locations, public.conditions, public.worker_runs to anon;

drop policy "signed in can read locations"   on public.locations;
drop policy "signed in can read conditions"  on public.conditions;
drop policy "signed in can read worker runs" on public.worker_runs;

create policy "anyone can read locations"   on public.locations   for select to anon, authenticated using (true);
create policy "anyone can read conditions"  on public.conditions  for select to anon, authenticated using (true);
create policy "anyone can read worker runs" on public.worker_runs for select to anon, authenticated using (true);
