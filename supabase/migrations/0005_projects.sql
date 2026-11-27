-- 0005_projects.sql
--
-- Projects saved online (the chat and its files), one row per project per user.
--
-- The browser uses only the publishable key; Row Level Security below lets a
-- logged-in user read and change only their own rows (user_id = auth.uid()).
--
-- Limits (the same numbers as app/lib/projects/limits.ts):
--   * at most 2,000,000 bytes per project (size_bytes, computed here, not trusted
--     from the browser)
--   * at most 50 projects per user
-- Last write wins: an update with an older updated_at than the saved row is
-- skipped, so a slow or stale browser never overwrites newer work.

-- ---------------------------------------------------------------- table

create table public.projects (
  id text not null check (length(id) between 1 and 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (length(title) <= 300),
  messages jsonb not null default '[]'::jsonb,
  files jsonb not null default '{}'::jsonb,
  size_bytes integer not null default 0 check (size_bytes >= 0 and size_bytes <= 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index projects_user_id_updated_at_idx on public.projects (user_id, updated_at desc);

-- ---------------------------------------------------------------- row level security

alter table public.projects enable row level security;

create policy "Users read their own projects"
  on public.projects for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own projects"
  on public.projects for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users change their own projects"
  on public.projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own projects"
  on public.projects for delete to authenticated
  using ((select auth.uid()) = user_id);

-- guests (anon) get nothing; logged-in users only the four actions above
revoke all on public.projects from anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;

-- ---------------------------------------------------------------- size, limit and last write wins

create function public.projects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- the real size; the check on size_bytes then refuses anything over 2,000,000 bytes
  new.size_bytes := octet_length(new.messages::text) + octet_length(new.files::text);

  if tg_op = 'INSERT' then
    -- an upsert of an existing project is not a new project
    if not exists (select 1 from public.projects p where p.user_id = new.user_id and p.id = new.id)
       and (select count(*) from public.projects p where p.user_id = new.user_id) >= 50 then
      raise exception 'project limit reached (50)' using errcode = 'P0001';
    end if;

    return new;
  end if;

  -- UPDATE: the row and its owner never change, created_at stays
  new.user_id := old.user_id;
  new.id := old.id;
  new.created_at := old.created_at;

  -- last write wins: skip an update that is older than what is saved
  if new.updated_at < old.updated_at then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.projects_before_write() from public, anon, authenticated;

create trigger projects_before_write
  before insert or update on public.projects
  for each row execute function public.projects_before_write();
