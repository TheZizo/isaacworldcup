-- World Cup 2026 Predictions — Supabase schema
-- Run this whole file in the Supabase SQL editor (Dashboard -> SQL editor -> New query).

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id integer primary key,
  match_no integer not null,
  stage text not null,
  grp text,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  points integer not null default 1,
  result text check (result in ('home','draw','away'))
);

create table if not exists public.predictions (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id integer not null references public.matches(id) on delete cascade,
  pick text not null check (pick in ('home','draw','away')),
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

-- ---------- Auto-create a profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

-- profiles: everyone signed in can read names; you can edit only your own row.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- matches: everyone signed in can read; only admins can set results.
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select to authenticated using (true);
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- predictions: you see your own anytime, and everyone's once a match kicks off.
-- You can only insert/update your own pick BEFORE kick-off (auto-lock).
drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.matches m where m.id = match_id and m.kickoff < now())
);
drop policy if exists predictions_insert on public.predictions;
create policy predictions_insert on public.predictions for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
);
drop policy if exists predictions_update on public.predictions;
create policy predictions_update on public.predictions for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff > now())
  );

-- ---------- Leaderboard (bypasses RLS so totals cover everyone) ----------
create or replace function public.get_leaderboard()
returns table(user_id uuid, display_name text, points bigint, correct bigint)
language sql security definer set search_path = public as $$
  select pr.id, pr.display_name,
    coalesce(sum(case when p.pick = m.result and m.result is not null then m.points else 0 end), 0)::bigint as points,
    coalesce(sum(case when p.pick = m.result and m.result is not null then 1 else 0 end), 0)::bigint as correct
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  left join public.matches m on m.id = p.match_id
  group by pr.id, pr.display_name
  order by points desc, correct desc, pr.display_name asc;
$$;

-- ---------- Grants ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.predictions to authenticated;
grant select, update on public.matches to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;

-- ---------- Seed: all 104 matches ----------
insert into public.matches (id, match_no, stage, grp, home, away, kickoff, points) values
(1, 1, 'Group Stage', 'A', 'Mexico', 'South Africa', '2026-06-11T19:00:00Z', 1),
(2, 2, 'Group Stage', 'A', 'South Korea', 'Czech Republic', '2026-06-12T02:00:00Z', 1),
(3, 3, 'Group Stage', 'B', 'Canada', 'Bosnia & Herzegovina', '2026-06-12T19:00:00Z', 1),
(4, 4, 'Group Stage', 'D', 'USA', 'Paraguay', '2026-06-13T01:00:00Z', 1),
(5, 5, 'Group Stage', 'B', 'Qatar', 'Switzerland', '2026-06-13T19:00:00Z', 1),
(6, 6, 'Group Stage', 'C', 'Brazil', 'Morocco', '2026-06-13T22:00:00Z', 1),
(7, 7, 'Group Stage', 'C', 'Haiti', 'Scotland', '2026-06-14T01:00:00Z', 1),
(8, 8, 'Group Stage', 'D', 'Australia', 'Turkey', '2026-06-14T04:00:00Z', 1),
(9, 9, 'Group Stage', 'E', 'Germany', 'Curacao', '2026-06-14T17:00:00Z', 1),
(10, 10, 'Group Stage', 'F', 'Netherlands', 'Japan', '2026-06-14T20:00:00Z', 1),
(11, 11, 'Group Stage', 'E', 'Ivory Coast', 'Ecuador', '2026-06-14T23:00:00Z', 1),
(12, 12, 'Group Stage', 'F', 'Sweden', 'Tunisia', '2026-06-15T02:00:00Z', 1),
(13, 13, 'Group Stage', 'H', 'Spain', 'Cape Verde', '2026-06-15T16:00:00Z', 1),
(14, 14, 'Group Stage', 'G', 'Belgium', 'Egypt', '2026-06-15T19:00:00Z', 1),
(15, 15, 'Group Stage', 'H', 'Saudi Arabia', 'Uruguay', '2026-06-15T22:00:00Z', 1),
(16, 16, 'Group Stage', 'G', 'Iran', 'New Zealand', '2026-06-16T01:00:00Z', 1),
(17, 17, 'Group Stage', 'I', 'France', 'Senegal', '2026-06-16T19:00:00Z', 1),
(18, 18, 'Group Stage', 'I', 'Iraq', 'Norway', '2026-06-16T22:00:00Z', 1),
(19, 19, 'Group Stage', 'J', 'Argentina', 'Algeria', '2026-06-17T01:00:00Z', 1),
(20, 20, 'Group Stage', 'J', 'Austria', 'Jordan', '2026-06-17T04:00:00Z', 1),
(21, 21, 'Group Stage', 'K', 'Portugal', 'DR Congo', '2026-06-17T17:00:00Z', 1),
(22, 22, 'Group Stage', 'L', 'England', 'Croatia', '2026-06-17T20:00:00Z', 1),
(23, 23, 'Group Stage', 'L', 'Ghana', 'Panama', '2026-06-17T23:00:00Z', 1),
(24, 24, 'Group Stage', 'K', 'Uzbekistan', 'Colombia', '2026-06-18T02:00:00Z', 1),
(25, 25, 'Group Stage', 'A', 'Czech Republic', 'South Africa', '2026-06-18T16:00:00Z', 1),
(26, 26, 'Group Stage', 'B', 'Switzerland', 'Bosnia & Herzegovina', '2026-06-18T19:00:00Z', 1),
(27, 27, 'Group Stage', 'B', 'Canada', 'Qatar', '2026-06-18T22:00:00Z', 1),
(28, 28, 'Group Stage', 'A', 'Mexico', 'South Korea', '2026-06-19T01:00:00Z', 1),
(29, 29, 'Group Stage', 'D', 'USA', 'Australia', '2026-06-19T19:00:00Z', 1),
(30, 30, 'Group Stage', 'C', 'Scotland', 'Morocco', '2026-06-19T22:00:00Z', 1),
(31, 31, 'Group Stage', 'C', 'Brazil', 'Haiti', '2026-06-20T00:30:00Z', 1),
(32, 32, 'Group Stage', 'D', 'Turkey', 'Paraguay', '2026-06-20T03:00:00Z', 1),
(33, 33, 'Group Stage', 'F', 'Netherlands', 'Sweden', '2026-06-20T17:00:00Z', 1),
(34, 34, 'Group Stage', 'E', 'Germany', 'Ivory Coast', '2026-06-20T20:00:00Z', 1),
(35, 35, 'Group Stage', 'E', 'Ecuador', 'Curacao', '2026-06-21T00:00:00Z', 1),
(36, 36, 'Group Stage', 'F', 'Tunisia', 'Japan', '2026-06-21T04:00:00Z', 1),
(37, 37, 'Group Stage', 'H', 'Spain', 'Saudi Arabia', '2026-06-21T16:00:00Z', 1),
(38, 38, 'Group Stage', 'G', 'Belgium', 'Iran', '2026-06-21T19:00:00Z', 1),
(39, 39, 'Group Stage', 'H', 'Uruguay', 'Cape Verde', '2026-06-21T22:00:00Z', 1),
(40, 40, 'Group Stage', 'G', 'New Zealand', 'Egypt', '2026-06-22T01:00:00Z', 1),
(41, 41, 'Group Stage', 'J', 'Argentina', 'Austria', '2026-06-22T17:00:00Z', 1),
(42, 42, 'Group Stage', 'I', 'France', 'Iraq', '2026-06-22T21:00:00Z', 1),
(43, 43, 'Group Stage', 'I', 'Norway', 'Senegal', '2026-06-23T00:00:00Z', 1),
(44, 44, 'Group Stage', 'J', 'Jordan', 'Algeria', '2026-06-23T03:00:00Z', 1),
(45, 45, 'Group Stage', 'K', 'Portugal', 'Uzbekistan', '2026-06-23T17:00:00Z', 1),
(46, 46, 'Group Stage', 'L', 'England', 'Ghana', '2026-06-23T20:00:00Z', 1),
(47, 47, 'Group Stage', 'L', 'Panama', 'Croatia', '2026-06-23T23:00:00Z', 1),
(48, 48, 'Group Stage', 'K', 'Colombia', 'DR Congo', '2026-06-24T02:00:00Z', 1),
(49, 49, 'Group Stage', 'B', 'Switzerland', 'Canada', '2026-06-24T19:00:00Z', 1),
(50, 50, 'Group Stage', 'B', 'Bosnia & Herzegovina', 'Qatar', '2026-06-24T19:00:00Z', 1),
(51, 51, 'Group Stage', 'C', 'Morocco', 'Haiti', '2026-06-24T22:00:00Z', 1),
(52, 52, 'Group Stage', 'C', 'Scotland', 'Brazil', '2026-06-24T22:00:00Z', 1),
(53, 53, 'Group Stage', 'A', 'South Africa', 'South Korea', '2026-06-25T01:00:00Z', 1),
(54, 54, 'Group Stage', 'A', 'Czech Republic', 'Mexico', '2026-06-25T01:00:00Z', 1),
(55, 55, 'Group Stage', 'E', 'Curacao', 'Ivory Coast', '2026-06-25T20:00:00Z', 1),
(56, 56, 'Group Stage', 'E', 'Ecuador', 'Germany', '2026-06-25T20:00:00Z', 1),
(57, 57, 'Group Stage', 'F', 'Tunisia', 'Netherlands', '2026-06-25T23:00:00Z', 1),
(58, 58, 'Group Stage', 'F', 'Japan', 'Sweden', '2026-06-25T23:00:00Z', 1),
(59, 59, 'Group Stage', 'D', 'Turkey', 'USA', '2026-06-26T02:00:00Z', 1),
(60, 60, 'Group Stage', 'D', 'Paraguay', 'Australia', '2026-06-26T02:00:00Z', 1),
(61, 61, 'Group Stage', 'I', 'Norway', 'France', '2026-06-26T19:00:00Z', 1),
(62, 62, 'Group Stage', 'I', 'Senegal', 'Iraq', '2026-06-26T19:00:00Z', 1),
(63, 63, 'Group Stage', 'H', 'Cape Verde', 'Saudi Arabia', '2026-06-27T00:00:00Z', 1),
(64, 64, 'Group Stage', 'H', 'Uruguay', 'Spain', '2026-06-27T00:00:00Z', 1),
(65, 65, 'Group Stage', 'G', 'New Zealand', 'Belgium', '2026-06-27T03:00:00Z', 1),
(66, 66, 'Group Stage', 'G', 'Egypt', 'Iran', '2026-06-27T03:00:00Z', 1),
(67, 67, 'Group Stage', 'L', 'Panama', 'England', '2026-06-27T21:00:00Z', 1),
(68, 68, 'Group Stage', 'L', 'Croatia', 'Ghana', '2026-06-27T21:00:00Z', 1),
(69, 69, 'Group Stage', 'K', 'Colombia', 'Portugal', '2026-06-27T23:30:00Z', 1),
(70, 70, 'Group Stage', 'K', 'DR Congo', 'Uzbekistan', '2026-06-27T23:30:00Z', 1),
(71, 71, 'Group Stage', 'J', 'Algeria', 'Austria', '2026-06-28T02:00:00Z', 1),
(72, 72, 'Group Stage', 'J', 'Jordan', 'Argentina', '2026-06-28T02:00:00Z', 1),
(73, 73, 'Round of 32', null, 'Runner-up A', 'Runner-up B', '2026-06-28T19:00:00Z', 2),
(76, 76, 'Round of 32', null, 'Winner C', 'Runner-up F', '2026-06-29T17:00:00Z', 2),
(74, 74, 'Round of 32', null, 'Winner E', '3rd A/B/C/D/F', '2026-06-29T20:30:00Z', 2),
(75, 75, 'Round of 32', null, 'Winner F', 'Runner-up C', '2026-06-30T01:00:00Z', 2),
(78, 78, 'Round of 32', null, 'Runner-up E', 'Runner-up I', '2026-06-30T17:00:00Z', 2),
(77, 77, 'Round of 32', null, 'Winner I', '3rd C/D/F/G/H', '2026-06-30T21:00:00Z', 2),
(79, 79, 'Round of 32', null, 'Winner A', '3rd C/E/F/H/I', '2026-07-01T01:00:00Z', 2),
(80, 80, 'Round of 32', null, 'Winner L', '3rd E/H/I/J/K', '2026-07-01T16:00:00Z', 2),
(82, 82, 'Round of 32', null, 'Winner G', '3rd A/E/H/I/J', '2026-07-01T20:00:00Z', 2),
(81, 81, 'Round of 32', null, 'Winner D', '3rd B/E/F/I/J', '2026-07-02T00:00:00Z', 2),
(84, 84, 'Round of 32', null, 'Winner H', 'Runner-up J', '2026-07-02T19:00:00Z', 2),
(83, 83, 'Round of 32', null, 'Runner-up K', 'Runner-up L', '2026-07-02T23:00:00Z', 2),
(85, 85, 'Round of 32', null, 'Winner B', '3rd E/F/G/I/J', '2026-07-03T03:00:00Z', 2),
(88, 88, 'Round of 32', null, 'Runner-up D', 'Runner-up G', '2026-07-03T18:00:00Z', 2),
(86, 86, 'Round of 32', null, 'Winner J', 'Runner-up H', '2026-07-03T22:00:00Z', 2),
(87, 87, 'Round of 32', null, 'Winner K', '3rd D/E/I/J/L', '2026-07-04T01:30:00Z', 2),
(90, 90, 'Round of 16', null, 'Winner M73', 'Winner M75', '2026-07-04T17:00:00Z', 3),
(89, 89, 'Round of 16', null, 'Winner M74', 'Winner M77', '2026-07-04T21:00:00Z', 3),
(91, 91, 'Round of 16', null, 'Winner M76', 'Winner M78', '2026-07-05T20:00:00Z', 3),
(92, 92, 'Round of 16', null, 'Winner M79', 'Winner M80', '2026-07-06T00:00:00Z', 3),
(93, 93, 'Round of 16', null, 'Winner M83', 'Winner M84', '2026-07-06T19:00:00Z', 3),
(94, 94, 'Round of 16', null, 'Winner M81', 'Winner M82', '2026-07-07T00:00:00Z', 3),
(95, 95, 'Round of 16', null, 'Winner M86', 'Winner M88', '2026-07-07T16:00:00Z', 3),
(96, 96, 'Round of 16', null, 'Winner M85', 'Winner M87', '2026-07-07T20:00:00Z', 3),
(97, 97, 'Quarter-final', null, 'Winner M89', 'Winner M90', '2026-07-09T20:00:00Z', 4),
(98, 98, 'Quarter-final', null, 'Winner M93', 'Winner M94', '2026-07-10T19:00:00Z', 4),
(99, 99, 'Quarter-final', null, 'Winner M91', 'Winner M92', '2026-07-11T21:00:00Z', 4),
(100, 100, 'Quarter-final', null, 'Winner M95', 'Winner M96', '2026-07-12T01:00:00Z', 4),
(101, 101, 'Semi-final', null, 'Winner M97', 'Winner M98', '2026-07-14T19:00:00Z', 5),
(102, 102, 'Semi-final', null, 'Winner M99', 'Winner M100', '2026-07-15T19:00:00Z', 5),
(103, 103, 'Third-place play-off', null, 'Loser M101', 'Loser M102', '2026-07-18T21:00:00Z', 6),
(104, 104, 'Final', null, 'Winner M101', 'Winner M102', '2026-07-19T19:00:00Z', 7)
on conflict (id) do nothing;
