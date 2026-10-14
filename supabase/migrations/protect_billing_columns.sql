-- Security fix: end users could grant themselves paid access or admin rights.
--
-- The RLS policies "businesses_update_own", "particuliers_update" and
-- "profiles_update_own" let a signed-in user update ANY column of their own
-- row with the public anon key, straight from the browser console, e.g.
--   sb.from('businesses').update({ paddle_subscription_status:'active', plan:'business' })
--   sb.from('profiles').update({ role:'admin' })
-- and handle_new_user() trusted the `role` sent in signup metadata, so a
-- signup with role='admin' created an admin. grant_cps_credit() was also
-- callable by any user (Postgres grants EXECUTE to PUBLIC by default).
--
-- This migration keeps every existing app flow working:
--   * the Paddle webhook / admin-create-account run as service_role  -> untouched
--   * SECURITY DEFINER functions (signup trigger, quotas, credits, cron) -> untouched
--   * admins (is_admin()) keep full write access from the console
--   * users still edit their name / city / address / phone / ICE, and a
--     business still manages its client records (plan, statut included)
-- Only direct API writes by non-admin users to billing/access columns are refused.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. businesses / particuliers: billing & access columns are server-only.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user must be the caller's role
-- ('authenticated' / 'anon' for browser requests), not the function owner.
create or replace function protect_account_columns()
returns trigger language plpgsql set search_path = public as $$
declare
  -- Compared generically through jsonb so a column missing on one deployment
  -- (e.g. has_manual_access) doesn't break the trigger.
  v_locked text[] := array[
    'profile_id', 'trial_ends_at', 'cps_credits',
    'paddle_customer_id', 'paddle_subscription_id',
    'paddle_subscription_status', 'paddle_cancel_at_period_end',
    'manual_access_until', 'has_manual_access', 'manuel_access_expires_at'
  ];
  v_col text;
  v_new jsonb;
  v_old jsonb;
begin
  if current_user not in ('authenticated', 'anon') or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Only particuliers can be inserted by users (a business creating a client
    -- record). Such rows start with no access of their own and no owner login.
    new := jsonb_populate_record(new, jsonb_build_object(
      'trial_ends_at', null, 'cps_credits', 0,
      'paddle_customer_id', null, 'paddle_subscription_id', null,
      'paddle_subscription_status', null, 'paddle_cancel_at_period_end', false,
      'manual_access_until', null, 'has_manual_access', false,
      'manuel_access_expires_at', null));
    if new.profile_id is distinct from auth.uid() then
      new.profile_id := null;
    end if;
    return new;
  end if;

  -- UPDATE
  v_new := to_jsonb(new);
  v_old := to_jsonb(old);

  if tg_table_name = 'businesses' then
    v_locked := v_locked || array['plan', 'statut'];
  elsif not is_business_owner(old.business_id) then
    -- A business manages its clients' plan / statut; the client itself cannot.
    v_locked := v_locked || array['plan', 'statut', 'business_id'];
  end if;

  foreach v_col in array v_locked loop
    if (v_new -> v_col) is distinct from (v_old -> v_col) then
      raise exception 'column "%" of % can only be changed by an admin or by billing', v_col, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end; $$;

drop trigger if exists trg_protect_business_columns on businesses;
create trigger trg_protect_business_columns
  before insert or update on businesses
  for each row execute function protect_account_columns();

drop trigger if exists trg_protect_particulier_columns on particuliers;
create trigger trg_protect_particulier_columns
  before insert or update on particuliers
  for each row execute function protect_account_columns();

-- ---------------------------------------------------------------------------
-- 2. profiles: a user cannot change their own role.
-- ---------------------------------------------------------------------------
create or replace function protect_profile_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not is_admin()
     and (new.role is distinct from old.role or new.id is distinct from old.id) then
    raise exception 'profile role can only be changed by an admin' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_profile_role on profiles;
create trigger trg_protect_profile_role
  before update on profiles
  for each row execute function protect_profile_role();

-- ---------------------------------------------------------------------------
-- 3. Signup: never trust the role sent by the browser.
--    Same as fix_signup_email_not_saved.sql, with v_role whitelisted.
--    Admins are created by promoting an existing profile in the SQL editor.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := case when new.raw_user_meta_data->>'role' in ('business','particulier')
                      then new.raw_user_meta_data->>'role' else 'particulier' end;
  v_plan text := new.raw_user_meta_data->>'plan';
  v_plan_ok text;
  v_biz_id uuid;
begin
  insert into profiles (id, role) values (new.id, v_role);

  if v_role = 'business' then
    select id into v_plan_ok from plans where id = v_plan and role = 'business';
    insert into businesses (profile_id, nom, ville, plan, trial_ends_at, email)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom','Nouvelle entreprise'),
              new.raw_user_meta_data->>'ville', coalesce(v_plan_ok,'installateur'),
              now() + interval '1 day', new.email)
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
              case when coalesce(v_plan_ok,'proprietaire') = 'cps' then null
                   else now() + interval '1 day' end,
              new.email);
  end if;

  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 4. grant_cps_credit is for the Paddle webhook (service_role) only.
-- ---------------------------------------------------------------------------
revoke execute on function grant_cps_credit(text, uuid, int) from public, anon, authenticated;
grant  execute on function grant_cps_credit(text, uuid, int) to service_role;
