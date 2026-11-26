-- 0004_refunds.sql
--
-- Refunds the credit of an AI message when the AI call failed before any reply
-- was sent (for example a provider 429 or 503).
--   credit_refunds    one row per refunded chat request (request id), so a refund
--                     can never happen twice for the same request
--   refund_credits()  adds the credits back and writes a "refund" ledger row
--
-- Only the server (service_role, with the Supabase secret key) can run it.
-- Needs 0001_users_and_credits.sql. Does not change earlier migrations.

-- ---------------------------------------------------------------- table

create table public.credit_refunds (
  request_id text primary key check (length(request_id) between 8 and 100),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.credit_refunds enable row level security;

-- no policies and no privileges for the browser roles: server only
revoke all on public.credit_refunds from anon, authenticated;

-- ---------------------------------------------------------------- refund_credits

-- Adds `amount` credits back to the user once per request id and writes a
-- "refund" ledger row, in one transaction.
-- Returns {"result": "refunded" | "already_refunded", "balance": ...}.
-- The amount is limited to 1..100 so a mistake in the caller cannot mint credits.
create function public.refund_credits(user_id uuid, request_id text, amount integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
  new_balance integer;
begin
  if refund_credits.user_id is null or refund_credits.request_id is null then
    raise exception 'user_id and request_id are required' using errcode = '22023';
  end if;

  if refund_credits.amount is null or refund_credits.amount < 1 or refund_credits.amount > 100 then
    raise exception 'amount must be between 1 and 100' using errcode = '22023';
  end if;

  -- the primary key makes the second refund for the same request a no-op
  insert into public.credit_refunds (request_id, user_id, amount)
  values (refund_credits.request_id, refund_credits.user_id, refund_credits.amount)
  on conflict on constraint credit_refunds_pkey do nothing;

  get diagnostics inserted = row_count;

  if inserted = 0 then
    select balance into new_balance from public.credit_balances as b where b.user_id = refund_credits.user_id;
    return jsonb_build_object('result', 'already_refunded', 'balance', new_balance);
  end if;

  insert into public.credit_balances as b (user_id, balance)
  values (refund_credits.user_id, refund_credits.amount)
  on conflict on constraint credit_balances_pkey do update set balance = b.balance + excluded.balance
  returning b.balance into new_balance;

  insert into public.credit_ledger (user_id, change, reason)
  values (refund_credits.user_id, refund_credits.amount, 'refund');

  return jsonb_build_object('result', 'refunded', 'balance', new_balance);
end;
$$;

revoke all on function public.refund_credits(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid, text, integer) to service_role;
