-- ==============================================================================
-- Betterverse Duo - Stage 4 Schema & Realtime Authorization
-- ==============================================================================

create table if not exists public.rooms (
  id text primary key check (id ~ '^[A-Za-z0-9]{10,64}$'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.room_memberships (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_memberships enable row level security;
revoke insert, update, delete on public.rooms, public.room_memberships from anon, authenticated;

create or replace function public.is_room_member(p_room_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_memberships
                 where room_id = p_room_id and user_id = auth.uid());
$$;
revoke all on function public.is_room_member(text) from public, anon;
grant execute on function public.is_room_member(text) to authenticated;

drop policy if exists "members read own rooms" on public.rooms;
create policy "members read own rooms" on public.rooms
  for select to authenticated using (public.is_room_member(id));

drop policy if exists "members read room memberships" on public.room_memberships;
create policy "members read room memberships" on public.room_memberships
  for select to authenticated using (public.is_room_member(room_id));

create or replace function public.create_room(p_room_id text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_room_id !~ '^[A-Za-z0-9]{10,64}$' then raise exception 'invalid_room_id'; end if;
  insert into public.rooms(id, created_by) values (p_room_id, auth.uid())
    on conflict (id) do nothing;
  insert into public.room_memberships(room_id, user_id) values (p_room_id, auth.uid())
    on conflict (room_id, user_id) do nothing;
  return p_room_id;
end $$;

create or replace function public.join_room(p_room_id text)
returns text language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.rooms where id = p_room_id for update;  -- lock: no join race
  if not found then raise exception 'room_not_found'; end if;
  if exists (select 1 from public.room_memberships
             where room_id = p_room_id and user_id = auth.uid()) then
    return p_room_id;                                           -- idempotent rejoin
  end if;
  select count(*) into v_count from public.room_memberships where room_id = p_room_id;
  if v_count >= 2 then raise exception 'room_full'; end if;
  insert into public.room_memberships(room_id, user_id) values (p_room_id, auth.uid());
  return p_room_id;
end $$;
revoke all on function public.create_room(text), public.join_room(text) from public, anon;
grant execute on function public.create_room(text), public.join_room(text) to authenticated;

-- Realtime Authorization: only room members may use the private channel "room:<id>"
drop policy if exists "room members receive" on realtime.messages;
create policy "room members receive" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast','presence')
         and public.is_room_member(replace(realtime.topic(), 'room:', '')));

drop policy if exists "room members send" on realtime.messages;
create policy "room members send" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast','presence')
         and public.is_room_member(replace(realtime.topic(), 'room:', '')));
