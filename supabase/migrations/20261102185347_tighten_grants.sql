-- Supabase's default privileges give authenticated every privilege on new public
-- tables, so the narrower grants in create_tables added nothing. RLS already blocks
-- writes without a policy, but TRUNCATE and TRIGGER aren't covered by RLS, so take
-- everything away and grant back only what the app uses.

revoke all on public.locations, public.conditions, public.worker_runs, public.follows from authenticated;

grant select on public.locations, public.conditions, public.worker_runs to authenticated;
grant select, insert, delete on public.follows to authenticated;
