-- World Cup 2026 Predictions -- permission RESET
-- Run this WHOLE file once in the Supabase SQL editor (Dashboard -> SQL editor -> New query -> paste -> Run).
-- It makes the rules identical and consistent for EVERYONE and restores the
-- admin's ability to enter any player's vote. Safe to run more than once.

-- 1) Helper: am I an admin? (security definer => no recursion through RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) Wipe any old / drifted prediction policies so there is ONE clean set.
drop policy if exists predictions_select   on public.predictions;
drop policy if exists predictions_see_own   on public.predictions;
drop policy if exists predictions_insert    on public.predictions;
drop policy if exists predictions_update    on public.predictions;
drop policy if exists predictions_delete    on public.predictions;

-- SELECT: you ALWAYS see your own picks; everyone sees all picks once a match
-- has kicked off; admins can see everything (needed for the vote editor).
create policy predictions_select on public.predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.matches m where m.id = match_id and m.kickoff < now())
  );

-- INSERT: you can add YOUR OWN pick before kick-off; admins can add anyone's anytime.
create policy predictions_insert on public.predictions
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
    )
  );

-- UPDATE: you can change YOUR OWN pick before kick-off; admins can change anyone's anytime.
create policy predictions_update on public.predictions
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
    )
  );

-- DELETE: you can clear YOUR OWN pick before kick-off; admins can clear anyone's anytime.
create policy predictions_delete on public.predictions
  for delete to authenticated
  using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
    )
  );

-- 3) Make sure only admins can set match results (recreated for consistency).
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 4) Grants (no-ops if already present).
grant select, insert, update, delete on public.predictions to authenticated;
grant select, update on public.matches to authenticated;

-- 5) Sanity check -- should list the 5 prediction policies + matches_update.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('predictions', 'matches')
order by tablename, policyname;
