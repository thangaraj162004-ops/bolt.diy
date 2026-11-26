-- 0003_plans.sql
--
-- Plans (Pro, Ultra) bought in USD. A plan purchase adds its credits AND sets
-- the user's plan for 30 days (extended when bought again while active).
--   profiles.plan, profiles.plan_until   the current plan and when it ends
--   payments.plan, payments.currency     what an order bought, and in which currency
--   payments.amount_paise -> amount_minor  the amount in the currency's smallest unit
--
-- Older rupee orders (from 0002) keep working: they get currency 'INR' and no
-- plan, so paying one still adds its credits exactly once and changes no plan.
-- Needs 0001_users_and_credits.sql and 0002_payments.sql.

-- ---------------------------------------------------------------- profiles

alter table public.profiles
  add column plan text check (plan in ('pro', 'ultra')),
  add column plan_until timestamptz;

-- RLS from 0001 still applies: users read their own profile; no browser writes.

-- ---------------------------------------------------------------- payments

alter table public.payments rename column amount_paise to amount_minor;

alter table public.payments
  add column currency text not null default 'INR' check (currency in ('INR', 'USD')),
  add column plan text check (plan in ('pro', 'ultra'));

-- new orders must say their currency; only the rows that existed before get 'INR'
alter table public.payments alter column currency drop default;

-- ---------------------------------------------------------------- grant_credits_for_payment

-- Same contract as in 0002, plus the plan:
--   * one transaction; the order row is locked first;
--   * a payment adds its credits only once (verify and webhook can both arrive);
--   * an order with a plan also sets profiles.plan and moves profiles.plan_until
--     30 days on: from the current end if the plan is still active, else from now.
--     Buying the other plan while one is active switches to it and extends the end.
-- Returns {"result", "user_id", "credits", "balance", "plan", "plan_until"}.
create or replace function public.grant_credits_for_payment(order_id text, payment_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  p public.payments%rowtype;
  new_balance integer;
  current_plan text;
  current_until timestamptz;
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
      select plan, plan_until into current_plan, current_until from public.profiles where id = p.user_id;

      return jsonb_build_object(
        'result', 'already_granted', 'user_id', p.user_id, 'credits', p.credits, 'balance', new_balance,
        'plan', current_plan, 'plan_until', current_until
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

  if p.plan is not null then
    -- the profile normally exists (signup trigger); if not, it is created without the email
    insert into public.profiles as pr (id, plan, plan_until)
    values (p.user_id, p.plan, now() + interval '30 days')
    on conflict (id) do update
      set plan = excluded.plan,
          plan_until = greatest(coalesce(pr.plan_until, now()), now()) + interval '30 days';
  end if;

  select plan, plan_until into current_plan, current_until from public.profiles where id = p.user_id;

  return jsonb_build_object(
    'result', 'granted', 'user_id', p.user_id, 'credits', p.credits, 'balance', new_balance,
    'plan', current_plan, 'plan_until', current_until
  );
end;
$$;

-- create or replace keeps the grants from 0002; restate them so this file is complete
revoke all on function public.grant_credits_for_payment(text, text) from public, anon, authenticated;
grant execute on function public.grant_credits_for_payment(text, text) to service_role;
