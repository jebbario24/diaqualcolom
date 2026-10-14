-- Free-trial abuse protection. Run AFTER protect_billing_columns.sql.
-- Idempotent: safe to re-run.
--
-- 1. Trial limits, enforced server-side in consume_quota() (the client mirrors
--    them with TRIAL_QUOTAS in index.html): while an account is on its free
--    trial with no live subscription it gets 1 validated calculation per tool
--    (entretien / chauffage / hydraulique / regulateur / electrolyseur) and no
--    quote / CPS download (devis / cps). Paying or manual-access accounts keep
--    their plan quotas.
-- 2. One free trial per real inbox: Gmail dots and "+tag" aliases are ignored,
--    and disposable email domains get no trial. Such signups still create the
--    account — with the trial already over — so the person can subscribe.

-- ---------------------------------------------------------------------------
-- 1. consume_quota(): same as migrate_stripe_to_paddle.sql + trial limits.
-- ---------------------------------------------------------------------------
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
  -- Essai gratuit sans abonnement : 1 calcul par outil, aucun téléchargement de devis / CPS.
  if v_plan_id <> 'cps' and v_trial_ends > now()
     and (v_sub_status is null or v_sub_status in ('canceled','paused')) then
    if v_quota = 0 or p_category in ('cps','devis') then return false; end if;
    v_quota := 1;
  end if;
  insert into usage_compte (owner_type, owner_id, period) values (p_owner_type, p_owner_id, v_period)
    on conflict (owner_type, owner_id, period) do nothing;
  execute format('select %I from usage_compte where owner_type = $1 and owner_id = $2 and period = $3', p_category)
    into v_used using p_owner_type, p_owner_id, v_period;
  if v_quota >= 0 and v_used >= v_quota then return false; end if;   -- v_quota < 0 => illimité
  execute format('update usage_compte set %I = %I + 1 where owner_type = $1 and owner_id = $2 and period = $3', p_category, p_category)
    using p_owner_type, p_owner_id, v_period;
  return true;
end; $$;

-- ---------------------------------------------------------------------------
-- 2. Email checks.
-- ---------------------------------------------------------------------------
-- Canonical inbox: lower-case, "+tag" dropped, and for Gmail dots dropped and
-- googlemail.com folded into gmail.com.
create or replace function normalize_email(p_email text)
returns text language sql immutable set search_path = public as $$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(e, '@', 1), '+', 1) || '@' || split_part(e, '@', 2)
  end
  from (select lower(trim(coalesce(p_email, ''))) as e) x;
$$;

-- Disposable / throwaway email providers: no free trial. RLS on and no policy,
-- so it is invisible to the browser; add more with
--   insert into disposable_email_domains values ('example.com');
create table if not exists disposable_email_domains (domain text primary key);
alter table disposable_email_domains enable row level security;
insert into disposable_email_domains (domain) values
  ('mailinator.com'), ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'),
  ('10minutemail.com'), ('10minutemail.net'), ('guerrillamail.com'),
  ('guerrillamail.net'), ('guerrillamail.org'), ('guerrillamailblock.com'),
  ('sharklasers.com'), ('grr.la'), ('temp-mail.org'), ('temp-mail.io'),
  ('tempmail.com'), ('tempmail.net'), ('tempmailo.com'), ('tempail.com'),
  ('throwawaymail.com'), ('trashmail.com'), ('trashmail.de'), ('getnada.com'),
  ('nada.email'), ('maildrop.cc'), ('dispostable.com'), ('mohmal.com'),
  ('emailondeck.com'), ('mailnesia.com'), ('fakeinbox.com'), ('mintemail.com'),
  ('mailcatch.com'), ('moakt.com'), ('burnermail.io'), ('jetable.org'),
  ('getairmail.com'), ('mytemp.email'), ('tempr.email'), ('discard.email'),
  ('spambox.us'), ('emailfake.com'), ('crazymailing.com'), ('mail.tm')
on conflict do nothing;

-- Does this signup get the 1-day free trial?
create or replace function trial_allowed(p_user_id uuid, p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
           select 1 from disposable_email_domains d
           where split_part(lower(trim(p_email)), '@', 2) = d.domain
              or split_part(lower(trim(p_email)), '@', 2) like '%.' || d.domain)
     and not exists (
           select 1 from auth.users u
           where u.id <> p_user_id and normalize_email(u.email) = normalize_email(p_email));
$$;
revoke execute on function trial_allowed(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Signup trigger: same as protect_billing_columns.sql (role whitelist),
--    with the trial only when trial_allowed().
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := case when new.raw_user_meta_data->>'role' in ('business','particulier')
                      then new.raw_user_meta_data->>'role' else 'particulier' end;
  v_plan text := new.raw_user_meta_data->>'plan';
  v_plan_ok text;
  v_biz_id uuid;
  v_trial_end timestamptz;
begin
  -- No trial (already over at signup) for a repeat inbox or a disposable address.
  v_trial_end := case when trial_allowed(new.id, new.email) then now() + interval '1 day' else now() end;

  insert into profiles (id, role) values (new.id, v_role);

  if v_role = 'business' then
    select id into v_plan_ok from plans where id = v_plan and role = 'business';
    insert into businesses (profile_id, nom, ville, plan, trial_ends_at, email)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom','Nouvelle entreprise'),
              new.raw_user_meta_data->>'ville', coalesce(v_plan_ok,'installateur'),
              v_trial_end, new.email)
      returning id into v_biz_id;
    if exists (select 1 from plans where id = coalesce(v_plan_ok,'installateur') and catalogue_write) then
      insert into catalogue_produits (key, nom, categorie, unite, prix, description, fiche, added_by_business_id)
        select key, nom, categorie, unite, prix, description, fiche, v_biz_id
        from catalogue_produits where added_by_business_id is null;
    end if;
  elsif v_role = 'particulier' then
    select id into v_plan_ok from plans where id = v_plan and role = 'particulier';
    insert into particuliers (profile_id, nom, ville, plan, trial_ends_at, email)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom','Nouveau compte'),
              new.raw_user_meta_data->>'ville', coalesce(v_plan_ok,'proprietaire'),
              case when coalesce(v_plan_ok,'proprietaire') = 'cps' then null else v_trial_end end,
              new.email);
  end if;

  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- Check: should print 3 rows, all true / false as labelled.
-- ---------------------------------------------------------------------------
select 'gmail variants are one inbox' as test,
       normalize_email('Za.Ma+2@GoogleMail.com') = normalize_email('zama@gmail.com') as ok
union all
select 'other domains keep their dots',
       normalize_email('za.ma+x@outlook.com') = 'za.ma@outlook.com'
union all
select 'yopmail gets no trial',
       not trial_allowed(gen_random_uuid(), 'someone@yopmail.com');
