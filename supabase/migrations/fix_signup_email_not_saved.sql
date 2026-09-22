-- Fix: supabase_migration_phase4.sql added an `email` column to businesses
-- and particuliers, but its handle_new_user() trigger never actually wrote
-- new.email into either insert — so every signup since has left it NULL.
-- This redefines the trigger to save it, and backfills existing rows from
-- auth.users (matched via profile_id, since profiles.id = auth.users.id).

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'particulier');
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

-- Backfill existing rows created before this fix.
update businesses b
set email = u.email
from auth.users u
where b.profile_id = u.id and b.email is null;

update particuliers p
set email = u.email
from auth.users u
where p.profile_id = u.id and p.email is null;
