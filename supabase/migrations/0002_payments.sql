-- 0002_payments.sql
--
-- Razorpay payments (test mode first) that buy credits.
--   payments                      one row per Razorpay order, created by the server
--   grant_credits_for_payment()   marks an order paid and adds its credits, once
--
-- The browser can only READ its own payments. Rows are written by the server
-- with the Supabase secret key (service_role); grant_credits_for_payment can
-- only be run by service_role. Needs 0001_users_and_credits.sql.

-- ---------------------------------------------------------------- table

create table public.payments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  credits integer not null check (credits > 0),
  amount_paise integer not null check (amount_paise > 0),
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,

  -- a paid order always has its payment id and time; a created one has neither
  constraint payments_paid_fields check (
    (status = 'paid' and razorpay_payment_id is not null and paid_at is not null)
    or (status = 'created' and razorpay_payment_id is null and paid_at is null)
  )
);

create index payments_user_id_created_at_idx on public.payments (user_id, created_at desc);

-- ---------------------------------------------------------------- row level security

alter table public.payments enable row level security;

create policy "Users read their own payments"
  on public.payments for select to authenticated
  using ((select auth.uid()) = user_id);

-- no insert, update or delete policies and no write privileges: no browser writes
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- ---------------------------------------------------------------- grant_credits_for_payment

-- Marks the order paid and adds its credits, all in one transaction (one function
-- call). The order row is locked first, so when the browser's verify call and the
-- webhook arrive at the same time, the second one waits and then sees "paid".
--
-- Returns {"result": "granted" | "already_granted", "user_id": ..., "credits": ..., "balance": ...}.
--   granted          credits were added now
--   already_granted  this payment was credited before; nothing changed
-- Raises an error (nothing changes) for an unknown order, or an order that was
-- already paid by a different payment.
create function public.grant_credits_for_payment(order_id text, payment_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  p public.payments%rowtype;
  new_balance integer;
begin
  if grant_credits_for_payment.order_id is null or grant_credits_for_payment.payment_id is null
     or length(trim(grant_credits_for_payment.payment_id)) = 0 then
    raise exception 'order_id and payment_id are required' using errcode = '22023';
  end if;

  select * into p
    from public.payments
   where razorpay_order_id = grant_credits_for_payment.order_id
     for update;

  if not found then
    raise exception 'unknown order' using errcode = 'P0002';
  end if;

  if p.status = 'paid' then
    if p.razorpay_payment_id = grant_credits_for_payment.payment_id then
      select balance into new_balance from public.credit_balances where user_id = p.user_id;

      return jsonb_build_object(
        'result', 'already_granted', 'user_id', p.user_id, 'credits', p.credits, 'balance', new_balance
      );
    end if;

    raise exception 'order already paid by another payment' using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'paid',
         razorpay_payment_id = grant_credits_for_payment.payment_id,
         paid_at = now()
   where id = p.id;

  insert into public.credit_balances as b (user_id, balance)
  values (p.user_id, p.credits)
  on conflict (user_id) do update set balance = b.balance + excluded.balance
  returning b.balance into new_balance;

  insert into public.credit_ledger (user_id, change, reason)
  values (p.user_id, p.credits, 'purchase');

  return jsonb_build_object('result', 'granted', 'user_id', p.user_id, 'credits', p.credits, 'balance', new_balance);
end;
$$;

revoke all on function public.grant_credits_for_payment(text, text) from public, anon, authenticated;
grant execute on function public.grant_credits_for_payment(text, text) to service_role;
