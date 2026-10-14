-- READ-ONLY diagnostic — run in the Supabase SQL editor BEFORE
-- protect_billing_columns.sql, to see who may have granted themselves access.
-- Nothing here modifies data.

-- 1. Every admin account. Anyone here you don't recognise made themselves admin
--    (signup metadata role='admin', or profiles.role updated from the browser).
select p.id, u.email, p.created_at
from profiles p join auth.users u on u.id = p.id
where p.role = 'admin'
order by p.created_at;

-- 2. Accounts showing a live Paddle status but no Paddle subscription id.
--    The webhook always writes both together, so these were set by hand
--    (or from the browser). Compare each against the Paddle dashboard.
select 'business' as kind, b.id, b.nom, b.email, b.plan, b.paddle_subscription_status,
       b.paddle_subscription_id, b.trial_ends_at, b.created_at
from businesses b
where b.paddle_subscription_status in ('active','trialing','past_due')
  and b.paddle_subscription_id is null
union all
select 'particulier', p.id, p.nom, p.email, p.plan, p.paddle_subscription_status,
       p.paddle_subscription_id, p.trial_ends_at, p.created_at
from particuliers p
where p.paddle_subscription_status in ('active','trialing','past_due')
  and p.paddle_subscription_id is null;

-- 3. Every account with a live Paddle status — check each subscription id
--    exists and is really active in Paddle > Customers / Subscriptions.
select 'business' as kind, id, nom, email, plan, paddle_subscription_status,
       paddle_subscription_id, paddle_customer_id, created_at
from businesses where paddle_subscription_status in ('active','trialing','past_due')
union all
select 'particulier', id, nom, email, plan, paddle_subscription_status,
       paddle_subscription_id, paddle_customer_id, created_at
from particuliers where paddle_subscription_status in ('active','trialing','past_due');

-- 4. Trials longer than the 1 day the signup trigger grants.
select 'business' as kind, id, nom, email, created_at, trial_ends_at
from businesses where trial_ends_at > created_at + interval '1 day 1 hour'
union all
select 'particulier', id, nom, email, created_at, trial_ends_at
from particuliers where trial_ends_at > created_at + interval '1 day 1 hour';

-- 5. CPS credits — compare with the CPS transactions in Paddle.
select 'business' as kind, id, nom, email, cps_credits from businesses where cps_credits > 0
union all
select 'particulier', id, nom, email, cps_credits from particuliers where cps_credits > 0;
