-- ============================================================================
-- AquaLC — Migration Phase 4 : colonnes manquantes pour synchroniser
-- les données de l'app avec la base.
-- ----------------------------------------------------------------------------
-- À exécuter APRÈS supabase_schema.sql, dans : SQL Editor > New query > Run.
-- Idempotent : peut être relancé sans risque.
-- ============================================================================

-- ---- businesses : coordonnées affichées sur les devis / CPS ----
alter table businesses add column if not exists adresse   text;
alter table businesses add column if not exists telephone text;
alter table businesses add column if not exists ice       text;
alter table businesses add column if not exists email     text;

-- ---- particuliers : champs de suivi client utilisés par l'espace Business ----
alter table particuliers add column if not exists telephone     text;
alter table particuliers add column if not exists email          text;
alter table particuliers add column if not exists adresse        text;
alter table particuliers add column if not exists description    text;
alter table particuliers add column if not exists paiement       text    not null default 'aucun';
alter table particuliers add column if not exists montant_paye   numeric not null default 0;
alter table particuliers add column if not exists montant_total  numeric not null default 0;
alter table particuliers add column if not exists taches         jsonb   not null default '[]'::jsonb;
alter table particuliers add column if not exists suivi          jsonb   not null default '[]'::jsonb;

alter table particuliers drop constraint if exists particuliers_paiement_check;
alter table particuliers add  constraint particuliers_paiement_check
  check (paiement in ('aucun','non','partiel','paye'));

-- Un Business doit pouvoir CRÉER une fiche client (le schéma de base n'avait
-- qu'une policy d'insert ; on s'assure qu'elle couvre bien le cas business).
drop policy if exists "particuliers_insert" on particuliers;
create policy "particuliers_insert" on particuliers for insert
  with check (
    profile_id = auth.uid()                       -- auto-inscription
    or is_business_owner(business_id)              -- client créé par le pro
    or is_admin()
  );

-- Un Business doit pouvoir SUPPRIMER (détacher) ses fiches clients.
drop policy if exists "particuliers_delete" on particuliers;
create policy "particuliers_delete" on particuliers for delete
  using ( is_business_owner(business_id) or is_admin() );

-- ---- catalogue_produits : fiche technique + description ----
-- (l'index d'unicité sur `key` est défini plus bas, section « Catalogue »)
alter table catalogue_produits add column if not exists description text;
alter table catalogue_produits add column if not exists fiche       jsonb;  -- { n: nom_fichier, u: dataURI }  (temporaire, avant Storage)

-- ---- devis : le brouillon courant de l'app ----
-- Un brouillon "courant" par émetteur ET par type (un devis + un CPS).
alter table devis add column if not exists is_courant boolean not null default false;
drop index if exists devis_one_courant_business;
drop index if exists devis_one_courant_particulier;
create unique index if not exists devis_one_courant_business
  on devis (business_id, type) where is_courant and business_id is not null;
create unique index if not exists devis_one_courant_particulier
  on devis (particulier_id, type) where is_courant and particulier_id is not null;

-- ---- devis_lignes : l'app garde l'unité et la clé catalogue sur chaque ligne ----
alter table devis_lignes add column if not exists unite text not null default 'u';
alter table devis_lignes add column if not exists ligne_key text;

-- ---- devis_templates : le logo est un dataURI, pas une URL, tant qu'il n'y a
--      pas de Storage. On élargit le type par sécurité (text accepte déjà tout).
-- (rien à changer : logo_url text convient)

-- (le trigger d'inscription handle_new_user() — qui respecte la formule choisie
--  ET clone le catalogue central — est défini plus bas, section « Catalogue ».)

-- ---- quota "calcul hydraulique" (nouvelle catégorie) ----
alter table plans        add column if not exists quota_hydraulique int not null default 0;
alter table usage_compte add column if not exists hydraulique       int not null default 0;
update plans set quota_hydraulique = quota_chauffage where quota_hydraulique = 0;

-- ---- refonte des formules (Sept. 2026) ----
alter table plans add column if not exists price_period     text not null default 'month';  -- 'month' | 'quarter' | 'year' | 'unit'
alter table plans add column if not exists price_alt_mad    numeric;
alter table plans add column if not exists price_alt_period text;

update plans set price_period = 'unit' where id = 'cps';
-- Propriétaire : quota 5 au lieu de 1 sur toutes les catégories incluses.
update plans set quota_devis=5, quota_entretien=5, quota_chauffage=5, quota_hydraulique=5,
                 quota_regulateur=5, quota_electrolyseur=5
  where id = 'proprietaire';
-- Business : 800 MAD/mois, ou 2000 MAD/3 mois (prépayé).
update plans set price_mad=800, price_period='month', price_alt_mad=2000, price_alt_period='quarter'
  where id = 'business';
-- Nouveau plan Business Pro : 6000 MAD/an, quotas illimités (-1).
insert into plans (id, role, label, price_mad, price_period,
                   quota_cps, quota_devis, quota_entretien, quota_chauffage, quota_hydraulique,
                   quota_regulateur, quota_electrolyseur, catalogue_write)
values ('business_pro','business','Business Pro',6000,'year', -1,-1,-1,-1,-1,-1,-1, true)
on conflict (id) do nothing;

-- consume_quota : un quota négatif (-1) = illimité, ne bloque jamais.
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
    select plan, stripe_subscription_status, trial_ends_at into v_plan_id, v_sub_status, v_trial_ends from businesses where id = p_owner_id;
  elsif p_owner_type = 'particulier' then
    if not exists (select 1 from particuliers pa where pa.id = p_owner_id and pa.profile_id = auth.uid()) and not is_admin() then
      raise exception 'not authorized'; end if;
    select plan, stripe_subscription_status, trial_ends_at into v_plan_id, v_sub_status, v_trial_ends from particuliers where id = p_owner_id;
  else raise exception 'invalid owner_type'; end if;
  -- Accès fermé : essai expiré (ou absent) ET aucun abonnement vivant.
  -- ('trialing' / 'active' / 'past_due' passent ; 'canceled' / 'unpaid' / null non.)
  if (v_trial_ends is null or v_trial_ends <= now())
     and (v_sub_status is null or v_sub_status in ('canceled','unpaid','incomplete_expired')) then
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

-- ---- calculs enregistrés (étude / entretien / hydraulique / stérilisation figés) ----
create table if not exists etudes_enregistrees (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('business','particulier')),
  owner_id   uuid not null,
  kind       text not null check (kind in ('etude','entretien','hydraulique','sterilisation')),
  repere     text,
  date       date not null default current_date,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table etudes_enregistrees enable row level security;
drop policy if exists "etudes_enregistrees_owner" on etudes_enregistrees;
create policy "etudes_enregistrees_owner" on etudes_enregistrees for all
  using (
    (owner_type='business'    and exists (select 1 from businesses  b  where b.id  = owner_id and b.profile_id  = auth.uid()))
    or (owner_type='particulier' and exists (select 1 from particuliers pa where pa.id = owner_id and pa.profile_id = auth.uid()))
    or is_admin()
  );

-- ============================================================================
-- Catalogue : central (admin) vs propre à chaque Business (Sept. 2026)
-- ----------------------------------------------------------------------------
-- CPS / Propriétaire / Installateur : voient le catalogue CENTRAL (admin).
-- Business / Business Pro            : chacun a SON propre catalogue, isolé des
--                                      autres, cloné du central à l'inscription.
-- ============================================================================

-- Clé unique PAR propriétaire : deux Business peuvent chacun avoir 'filtre-400'.
drop index if exists catalogue_produits_key_uniq;
create unique index if not exists catalogue_produits_key_owner_uniq
  on catalogue_produits (coalesce(added_by_business_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
  where key is not null;

-- SELECT : central visible aux plans SANS catalogue_write ; produits propres
-- visibles à leur Business ; l'admin voit tout.
drop policy if exists "produits_select_all" on catalogue_produits;
drop policy if exists "produits_select" on catalogue_produits;
create policy "produits_select" on catalogue_produits for select using (
  is_admin()
  or (added_by_business_id is null and not exists (
        select 1 from businesses b join plans pl on pl.id = b.plan
        where b.profile_id = auth.uid() and pl.catalogue_write))
  or exists (select 1 from businesses b where b.id = added_by_business_id and b.profile_id = auth.uid())
);

-- Clone du catalogue central vers les Business "catalogue_write" existants
-- qui n'ont pas encore de catalogue propre.
insert into catalogue_produits (key, nom, categorie, unite, prix, description, fiche, added_by_business_id)
select cp.key, cp.nom, cp.categorie, cp.unite, cp.prix, cp.description, cp.fiche, b.id
from businesses b
join plans pl on pl.id = b.plan and pl.catalogue_write
cross join catalogue_produits cp
where cp.added_by_business_id is null
  and not exists (select 1 from catalogue_produits x where x.added_by_business_id = b.id);

-- Trigger d'inscription : cloner le catalogue central pour un nouveau Business
-- dont le plan a catalogue_write.
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

-- Passage à un plan "catalogue_write" (upgrade par l'admin ou l'utilisateur) :
-- cloner le catalogue central si le Business n'a pas encore de catalogue propre.
create or replace function on_business_plan_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan is distinct from old.plan
     and exists (select 1 from plans where id = new.plan and catalogue_write)
     and not exists (select 1 from catalogue_produits where added_by_business_id = new.id) then
    insert into catalogue_produits (key, nom, categorie, unite, prix, description, fiche, added_by_business_id)
      select key, nom, categorie, unite, prix, description, fiche, new.id
      from catalogue_produits where added_by_business_id is null;
  end if;
  return new;
end; $$;
drop trigger if exists trg_business_plan_change on businesses;
create trigger trg_business_plan_change after update of plan on businesses
  for each row execute function on_business_plan_change();

-- ---- Phase 5 : identifiants Stripe par formule ----
alter table plans add column if not exists stripe_product_id   text;
alter table plans add column if not exists stripe_price_alt_id text;  -- 2e prix (ex. Business trimestriel)
-- particuliers : mêmes colonnes Stripe que businesses (le schéma de base ne les
-- portait que sur businesses ; consume_quota et create-portal les lisent aussi ici).
alter table particuliers add column if not exists stripe_customer_id         text;
alter table particuliers add column if not exists stripe_subscription_id     text;
alter table particuliers add column if not exists stripe_subscription_status text;
-- Résiliation programmée (cancel_at_period_end) : l'abonnement reste actif jusqu'à la fin de la période.
alter table businesses   add column if not exists stripe_cancel_at_period_end boolean not null default false;
alter table particuliers add column if not exists stripe_cancel_at_period_end boolean not null default false;
-- Essai gratuit d'1 jour à l'inscription, sans carte : accès ouvert tant que
-- trial_ends_at > now(), même sans abonnement Stripe.
alter table businesses   add column if not exists trial_ends_at timestamptz;
alter table particuliers add column if not exists trial_ends_at timestamptz;

-- ---- Plan CPS : paiement à l'usage (400 MAD par document, Checkout mode payment) ----
-- Chaque paiement crédite 1 « crédit CPS » ; générer un CPS en consomme 1.
alter table businesses   add column if not exists cps_credits int not null default 0;
alter table particuliers add column if not exists cps_credits int not null default 0;

-- Créditer (appelé par le webhook Stripe, service_role).
create or replace function grant_cps_credit(p_owner_type text, p_owner_id uuid, p_n int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_owner_type = 'business' then
    update businesses   set cps_credits = coalesce(cps_credits,0) + p_n where id = p_owner_id returning cps_credits into v;
  else
    update particuliers set cps_credits = coalesce(cps_credits,0) + p_n where id = p_owner_id returning cps_credits into v;
  end if;
  return v;
end; $$;

-- Consommer 1 crédit à la génération d'un CPS (appelé par l'app, RLS via auth.uid()).
create or replace function consume_cps_credit(p_owner_type text, p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if p_owner_type = 'particulier' then
    if not exists (select 1 from particuliers where id = p_owner_id and profile_id = auth.uid()) and not is_admin() then
      raise exception 'not authorized'; end if;
    update particuliers set cps_credits = cps_credits - 1
      where id = p_owner_id and coalesce(cps_credits,0) > 0 returning cps_credits into v;
  elsif p_owner_type = 'business' then
    if not exists (select 1 from businesses where id = p_owner_id and profile_id = auth.uid()) and not is_admin() then
      raise exception 'not authorized'; end if;
    update businesses set cps_credits = cps_credits - 1
      where id = p_owner_id and coalesce(cps_credits,0) > 0 returning cps_credits into v;
  else raise exception 'invalid owner_type'; end if;
  return v is not null;
end; $$;

-- ---- Accès manuel (admin) : clients qui paient en espèces / hors Stripe ----
-- stripe_subscription_status peut valoir 'manual' en plus des statuts Stripe habituels
-- (active/trialing/past_due/canceled/unpaid/incomplete/incomplete_expired) : l'admin
-- l'attribue lui-même depuis la console (colonne "Accès" des tableaux Business/Particuliers),
-- sans passer par Checkout ni par le webhook. manual_access_until est optionnel :
-- NULL = accès manuel illimité jusqu'à révocation par l'admin, sinon la date à laquelle
-- l'accès manuel expire automatiquement (le compte est alors reverrouillé, comme un essai
-- ou un abonnement terminé, jusqu'à un nouveau paiement ou une nouvelle activation manuelle).
alter table businesses   add column if not exists manual_access_until timestamptz;
alter table particuliers add column if not exists manual_access_until timestamptz;

-- ============================================================================
-- Fin de la migration Phase 4.
-- ============================================================================
