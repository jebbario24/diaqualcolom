-- Migrate billing from Stripe to Paddle.
--
-- Paddle does not support pricing in MAD (Moroccan Dirham) — see
-- https://developer.paddle.com/concepts/sell/supported-currencies/ — so
-- subscription prices move to USD. This does NOT touch devis/invoicing
-- currency (businesses billing their own clients), which stays MAD/EUR/USD
-- as chosen per-document and is unrelated to how AquaLC bills its own
-- SaaS customers.
--
-- New USD pricing:
--   cps          400 MAD/doc      -> $40 one-time
--   proprietaire 200 MAD/month    -> $20/month
--   installateur 500 MAD/month    -> $50/month
--   business     800 MAD/month    -> $80/month  (alt: 2000 MAD/qtr -> $200/qtr)
--   business_pro 6000 MAD/year    -> $600/year

-- ---- plans: rename Stripe price columns to Paddle equivalents ----
alter table plans rename column stripe_price_id to paddle_price_id;
alter table plans rename column stripe_price_alt_id to paddle_price_alt_id;
alter table plans rename column stripe_product_id to paddle_product_id;
-- Clear old Stripe price ids — they're meaningless for Paddle and must be
-- repopulated with real Paddle price ids (pri_...) once created in the
-- Paddle dashboard.
update plans set paddle_price_id = null, paddle_price_alt_id = null, paddle_product_id = null;

update plans set price_mad = 40   where id = 'cps';
update plans set price_mad = 20   where id = 'proprietaire';
update plans set price_mad = 50   where id = 'installateur';
update plans set price_mad = 80,  price_alt_mad = 200 where id = 'business';
update plans set price_mad = 600  where id = 'business_pro';

-- ---- businesses / particuliers: rename Stripe columns to Paddle ----
alter table businesses   rename column stripe_customer_id to paddle_customer_id;
alter table businesses   rename column stripe_subscription_id to paddle_subscription_id;
alter table businesses   rename column stripe_subscription_status to paddle_subscription_status;
alter table businesses   rename column stripe_cancel_at_period_end to paddle_cancel_at_period_end;

alter table particuliers rename column stripe_customer_id to paddle_customer_id;
alter table particuliers rename column stripe_subscription_id to paddle_subscription_id;
alter table particuliers rename column stripe_subscription_status to paddle_subscription_status;
alter table particuliers rename column stripe_cancel_at_period_end to paddle_cancel_at_period_end;

-- Old Stripe customer/subscription ids are meaningless once billing moves to
-- Paddle (different processor, different ids) — clear them so no account is
-- mistakenly treated as having an active Paddle subscription.
update businesses set paddle_customer_id = null, paddle_subscription_id = null, paddle_subscription_status = null;
update particuliers set paddle_customer_id = null, paddle_subscription_id = null, paddle_subscription_status = null;

-- ---- consume_quota(): read the renamed column ----
create or replace function consume_quota(p_owner_type text, p_owner_id uuid, p_category text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_plan_id text; v_quota int; v_used int; v_sub_status text; v_trial_ends timestamptz;
begin
  if p_category not in ('cps','devis','entretien','chauffage','hydraulique','regulateur','electrolyseur') then
    raise exception 'invalid category';
  end if;
  if p_owner_type = 'business' then
    if not exists (select 1 from businesses b where b.id = p_owner_id and b.profile_id = auth.uid()) and not is_admin() then
      raise exception 'not authorized'; end if;
    select plan, paddle_subscription_status, trial_ends_at into v_plan_id, v_sub_status, v_trial_ends from businesses where id = p_owner_id;
  elsif p_owner_type = 'particulier' then
    if not exists (select 1 from particuliers pa where pa.id = p_owner_id and pa.profile_id = auth.uid()) and not is_admin() then
      raise exception 'not authorized'; end if;
    select plan, paddle_subscription_status, trial_ends_at into v_plan_id, v_sub_status, v_trial_ends from particuliers where id = p_owner_id;
  else raise exception 'invalid owner_type'; end if;
  -- Accès fermé : essai expiré (ou absent) ET aucun abonnement vivant.
  -- Paddle subscription.status values: active | past_due | paused | canceled | trialing.
  if (v_trial_ends is null or v_trial_ends <= now())
     and (v_sub_status is null or v_sub_status in ('canceled','paused')) then
    return false;
  end if;
  execute format('select quota_%I from plans where id = $1', p_category) into v_quota using v_plan_id;
  insert into usage_compte (owner_type, owner_id, period) values (p_owner_type, p_owner_id, v_period)
    on conflict (owner_type, owner_id, period) do nothing;
  execute format('select %I from usage_compte where owner_type = $1 and owner_id = $2 and period = $3', p_category)
    into v_used using p_owner_type, p_owner_id, v_period;
  if v_quota >= 0 and v_used >= v_quota then return false; end if;   -- v_quota < 0 => illimité
  execute format('update usage_compte set %I = %I + 1 where owner_type = $1 and owner_id = $2 and period = $3', p_category, p_category)
    using p_owner_type, p_owner_id, v_period;
  return true;
end; $$;

-- Sanity check.
select id, price_mad, price_alt_mad, paddle_price_id, paddle_price_alt_id from plans order by id;
