-- Fix: new signups always landed on the default plan ('installateur' for
-- business, 'proprietaire' for particulier) no matter which plan the user
-- picked in the signup form. handle_new_user() only ever wrote nom/ville
-- into businesses/particuliers, never the `plan` sent in the signup's
-- raw_user_meta_data, so every insert silently fell back to the column
-- default. This restores the plan (and the 1-day free trial timestamp,
-- which the same broken function was also never setting).

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'particulier');
  v_plan text := new.raw_user_meta_data->>'plan';
  v_plan_ok text;
  v_biz_id uuid;
begin
  insert into profiles (id, role) values (new.id, v_role);

  -- Essai gratuit d'1 jour à l'inscription, sans carte (style Shopify).
  if v_role = 'business' then
    select id into v_plan_ok from plans where id = v_plan and role = 'business';
    insert into businesses (profile_id, nom, ville, plan, trial_ends_at)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom','Nouvelle entreprise'),
              new.raw_user_meta_data->>'ville', coalesce(v_plan_ok,'installateur'),
              now() + interval '1 day')
      returning id into v_biz_id;
    if exists (select 1 from plans where id = coalesce(v_plan_ok,'installateur') and catalogue_write) then
      insert into catalogue_produits (key, nom, categorie, unite, prix, description, fiche, added_by_business_id)
        select key, nom, categorie, unite, prix, description, fiche, v_biz_id
        from catalogue_produits where added_by_business_id is null;
    end if;
  elsif v_role = 'particulier' then
    select id into v_plan_ok from plans where id = v_plan and role = 'particulier';
    insert into particuliers (profile_id, nom, ville, plan, trial_ends_at)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom','Nouveau compte'),
              new.raw_user_meta_data->>'ville', coalesce(v_plan_ok,'proprietaire'),
              -- Pas d'essai sur la formule CPS (paiement au document).
              case when coalesce(v_plan_ok,'proprietaire') = 'cps' then null
                   else now() + interval '1 day' end);
  end if;

  return new;
end; $$;

-- Verify the fix took: should show v_plan/v_plan_ok logic inline in the function body.
select prosrc from pg_proc where proname = 'handle_new_user';
