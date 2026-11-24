-- 0001_users_and_credits.sql
--
-- Users and test credits.
--   profiles         one row per user (id = auth.users.id)
--   credit_balances  the current balance of each user
--   credit_ledger    every change to a balance, with a reason
--
-- A new signup gets a profile, a balance of 20 test credits and a ledger row
-- "signup bonus". The browser can only READ its own rows; balances change only
-- through public.spend_credits (and the signup trigger), never by a direct write.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.credit_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0)
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  change integer not null check (change <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_id_created_at_idx on public.credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;

-- a logged-in user can read only their own rows
create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users read their own balance"
  on public.credit_balances for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own ledger"
  on public.credit_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert, update or delete policies: with RLS on, every direct write from the
-- browser (anon or authenticated) is refused. The privileges are removed as well.
revoke all on public.profiles, public.credit_balances, public.credit_ledger from anon, authenticated;
grant select on public.profiles, public.credit_balances, public.credit_ledger to authenticated;

-- ---------------------------------------------------------------- signup trigger

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.credit_balances (user_id, balance)
  values (new.id, 20);

  insert into public.credit_ledger (user_id, change, reason)
  values (new.id, 20, 'signup bonus');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- spend_credits

-- Spends credits of the logged-in user (auth.uid(); no user id can be passed in).
-- The check and the subtraction are one UPDATE, so two calls at the same time can
-- never take the balance below zero. Returns the new balance; raises an error
-- (and changes nothing) when the amount is invalid or the balance is too low.
-- It is SECURITY DEFINER only because the browser roles cannot write balances.
create function public.spend_credits(amount integer, reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_balance integer;
begin
  if caller is null then
    raise exception 'not logged in' using errcode = '28000';
  end if;

  if spend_credits.amount is null or spend_credits.amount <= 0 then
    raise exception 'amount must be a positive whole number' using errcode = '22023';
  end if;

  if spend_credits.reason is null or length(trim(spend_credits.reason)) = 0 or length(spend_credits.reason) > 200 then
    raise exception 'reason must be 1 to 200 characters' using errcode = '22023';
  end if;

  update public.credit_balances as b
     set balance = b.balance - spend_credits.amount
   where b.user_id = caller
     and b.balance >= spend_credits.amount
  returning b.balance into new_balance;

  if not found then
    raise exception 'not enough credits' using errcode = 'P0001';
  end if;

  insert into public.credit_ledger (user_id, change, reason)
  values (caller, -spend_credits.amount, trim(spend_credits.reason));

  return new_balance;
end;
$$;

revoke all on function public.spend_credits(integer, text) from public, anon;
grant execute on function public.spend_credits(integer, text) to authenticated;
