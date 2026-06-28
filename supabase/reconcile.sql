-- World Cup 2026 -- reconcile the database to the CLAIM-FLOW model the app uses.
-- 100% SAFE: there is NO drop table, NO delete, NO update to any vote.
-- It only (re)creates helper functions and access rules. Run the whole file once
-- in Supabase -> SQL editor.

-- 1) Helpers: resolve the current login to its roster profile, and admin check.
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where auth_id = auth.uid() limit 1),
    false
  );
$$;

-- 2) Claim: link the current Google login to an existing, unclaimed roster name.
create or replace function public.claim_profile(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where auth_id = auth.uid()) then
    raise exception 'You already have a profile';
  end if;
  update public.profiles set auth_id = auth.uid()
  where id = p_id and auth_id is null;
  if not found then
    raise exception 'That name has already been claimed';
  end if;
end; $$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.claim_profile(uuid) to authenticated;

-- 3) Everyone signed in can read the roster (needed for the claim screen).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- Players can update their OWN profile; admins can manage all profiles.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth_id = auth.uid()) with check (auth_id = auth.uid());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4) Remove the stray login-ID prediction policies added during earlier fixes.
--    (The claim-flow self/admin policies below do the real work.)
drop policy if exists predictions_insert on public.predictions;
drop policy if exists predictions_update on public.predictions;
drop policy if exists predictions_delete on public.predictions;

-- 5) Clean, single set of prediction rules -- all keyed off the roster profile.
drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions
  for select to authenticated using (
    user_id = public.current_profile_id()
    or public.is_admin()
    or exists (select 1 from public.matches m where m.id = match_id and m.kickoff < now())
  );

drop policy if exists predictions_self_insert on public.predictions;
create policy predictions_self_insert on public.predictions
  for insert to authenticated with check (
    user_id = public.current_profile_id()
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
  );

drop policy if exists predictions_self_update on public.predictions;
create policy predictions_self_update on public.predictions
  for update to authenticated
  using (user_id = public.current_profile_id())
  with check (
    user_id = public.current_profile_id()
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
  );

drop policy if exists predictions_admin on public.predictions;
create policy predictions_admin on public.predictions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6) Only admins can set match results.
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 7) Sanity check.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('profiles','predictions','matches')
order by tablename, policyname;
