-- ============================================================================
-- AquaLC — schéma de production (Supabase / PostgreSQL)
-- ============================================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > coller > Run.
-- Ce script est idempotent (peut être relancé sans dupliquer les objets).
--
-- Structure du fichier : 1) tables  2) données de référence  3) sécurité
-- (RLS + policies)  4) fonctions serveur  5) trigger d'inscription.
-- Les policies sont regroupées à la fin, une fois toutes les tables créées,
-- pour éviter les erreurs de référence croisée entre tables.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. TABLES
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','business','particulier')),
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id text primary key,                          -- 'cps' | 'proprietaire' | 'installateur' | 'business'
  role text not null check (role in ('particulier','business')),
  label text not null,
  price_mad numeric not null default 0,
  quota_cps int not null default 0,
  quota_devis int not null default 0,
  quota_entretien int not null default 0,
  quota_chauffage int not null default 0,
  quota_regulateur int not null default 0,
  quota_electrolyseur int not null default 0,
  catalogue_write boolean not null default false,
  stripe_price_id text                          -- rempli une fois les Prix Stripe créés (étape paiement)
);

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete cascade,
  nom text not null,
  ville text,
  plan text not null default 'installateur' references plans(id),
  statut text not null default 'actif' check (statut in ('actif','en attente','suspendu')),
  inscription date not null default current_date,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  created_at timestamptz not null default now()
);

create table if not exists particuliers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,   -- null = indépendant
  nom text not null,
  ville text,
  plan text not null default 'proprietaire' references plans(id),
  statut text not null default 'actif',
  volume_bassin numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists catalogue_categories (
  id uuid primary key default gen_random_uuid(),
  nom text unique not null
);

create table if not exists catalogue_produits (
  id uuid primary key default gen_random_uuid(),
  key text,
  nom text not null,
  categorie text not null,
  unite text not null default 'u',
  prix numeric not null default 0,
  added_by_business_id uuid references businesses(id),   -- null = catalogue central (géré par l'admin)
  created_at timestamptz not null default now()
);

create table if not exists devis_templates (
  business_id uuid primary key references businesses(id) on delete cascade,
  societe text,
  logo_url text,
  entete text,
  pied_de_page text,
  conditions_paiement text,
  validite_jours int not null default 30,
  tva_pct numeric not null default 20,
  devise text not null default 'MAD'
);

create table if not exists devis (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,      -- émetteur pro (null = devis auto-service particulier)
  particulier_id uuid references particuliers(id) on delete set null, -- client (peut être null si nom libre)
  client_nom text,                                                    -- nom libre si pas de fiche particulier
  type text not null default 'devis' check (type in ('devis','cps')),
  numero text,
  date date not null default current_date,
  validite_jours int not null default 30,
  tva_pct numeric not null default 20,
  remise_pct numeric not null default 0,
  devise text not null default 'MAD',
  cps_fields jsonb,
  created_at timestamptz not null default now()
);

create table if not exists devis_lignes (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references devis(id) on delete cascade,
  produit_id uuid references catalogue_produits(id),
  nom text not null,
  quantite numeric not null default 1,
  prix_unitaire numeric not null default 0,
  ordre int not null default 0
);

create table if not exists demandes_devis (
  id uuid primary key default gen_random_uuid(),
  particulier_id uuid not null references particuliers(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  message text,
  date date not null default current_date,
  statut text not null default 'nouvelle'
);

create table if not exists calculateurs (
  owner_type text not null check (owner_type in ('business','particulier')),
  owner_id uuid not null,
  kind text not null check (kind in ('etude','entretien','hydraulique','sterilisation')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_type, owner_id, kind)
);

create table if not exists usage_compte (
  owner_type text not null check (owner_type in ('business','particulier')),
  owner_id uuid not null,
  period text not null,                          -- 'YYYY-MM'
  cps int not null default 0,
  devis int not null default 0,
  entretien int not null default 0,
  chauffage int not null default 0,
  regulateur int not null default 0,
  electrolyseur int not null default 0,
  primary key (owner_type, owner_id, period)
);

-- ============================================================================
-- 2. DONNÉES DE RÉFÉRENCE
-- ============================================================================

insert into plans (id, role, label, price_mad, quota_cps, quota_devis, quota_entretien, quota_chauffage, quota_regulateur, quota_electrolyseur, catalogue_write) values
  ('cps',          'particulier', 'CPS',          400,  1,  0,  0,  0,  0,  0, false),
  ('proprietaire', 'particulier', 'Propriétaire', 200,  0,  1,  1,  1,  1,  1, false),
  ('installateur', 'business',    'Installateur', 500,  0, 50, 50, 50, 50, 50, false),
  ('business',     'business',    'Business',    2500, 50,500,500,500,500,500, true)
on conflict (id) do nothing;

-- ============================================================================
-- 3. SÉCURITÉ — Row Level Security (chaque table n'expose que ses propres
--    données au propriétaire du compte ; l'admin voit tout)
-- ============================================================================

-- Fonction utilitaire : "l'utilisateur connecté est-il admin ?"
-- IMPORTANT : elle est SECURITY DEFINER, donc sa requête interne sur `profiles`
-- s'exécute avec les droits du propriétaire de la fonction (qui, par défaut,
-- n'est pas soumis au RLS de la table qu'il possède). Sans cela, une policy sur
-- `profiles` qui interroge `profiles` pour vérifier le rôle admin déclenche une
-- erreur "infinite recursion detected in policy for relation profiles".
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Mêmes précautions que is_admin() ci-dessus, mais pour les références croisées
-- businesses <-> particuliers : la policy de `businesses` a besoin de savoir si
-- l'utilisateur est un client (particulier) de cette entreprise, et la policy de
-- `particuliers` a besoin de savoir si l'utilisateur est l'entreprise propriétaire
-- de cette fiche. Faire ces vérifications par une requête directe dans chaque
-- policy créerait une dépendance circulaire (A interroge B, dont la policy
-- interroge A...) et Postgres refuse avec "infinite recursion detected". En
-- passant par des fonctions SECURITY DEFINER, la requête interne s'exécute avec
-- les droits du propriétaire des fonctions et ignore le RLS de la table qu'elle
-- consulte, ce qui casse le cycle.
create or replace function is_business_owner(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from businesses where id = p_business_id and profile_id = auth.uid());
$$;

create or replace function is_particulier_owner(p_particulier_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from particuliers where id = p_particulier_id and profile_id = auth.uid());
$$;

create or replace function is_client_of_business(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from particuliers where business_id = p_business_id and profile_id = auth.uid());
$$;

alter table profiles enable row level security;
alter table plans enable row level security;
alter table businesses enable row level security;
alter table particuliers enable row level security;
alter table catalogue_categories enable row level security;
alter table catalogue_produits enable row level security;
alter table devis_templates enable row level security;
alter table devis enable row level security;
alter table devis_lignes enable row level security;
alter table demandes_devis enable row level security;
alter table calculateurs enable row level security;
alter table usage_compte enable row level security;

-- ---- profiles ----
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles for select
  using (id = auth.uid() or is_admin());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update
  using (id = auth.uid());

-- ---- plans (référence publique, écriture admin uniquement) ----
drop policy if exists "plans_select_all" on plans;
create policy "plans_select_all" on plans for select using (true);
drop policy if exists "plans_admin_write" on plans;
create policy "plans_admin_write" on plans for all
  using (is_admin());

-- ---- businesses ----
drop policy if exists "businesses_select" on businesses;
create policy "businesses_select" on businesses for select
  using (
    profile_id = auth.uid()
    or is_admin()
    or is_client_of_business(businesses.id)
  );

drop policy if exists "businesses_update_own" on businesses;
create policy "businesses_update_own" on businesses for update
  using (profile_id = auth.uid() or is_admin());

drop policy if exists "businesses_admin_all" on businesses;
create policy "businesses_admin_all" on businesses for all
  using (is_admin());

-- ---- particuliers ----
drop policy if exists "particuliers_select" on particuliers;
create policy "particuliers_select" on particuliers for select
  using (
    profile_id = auth.uid()
    or is_business_owner(particuliers.business_id)
    or is_admin()
  );

drop policy if exists "particuliers_update" on particuliers;
create policy "particuliers_update" on particuliers for update
  using (
    profile_id = auth.uid()
    or is_business_owner(particuliers.business_id)
    or is_admin()
  );

drop policy if exists "particuliers_insert_by_business" on particuliers;
create policy "particuliers_insert_by_business" on particuliers for insert
  with check (
    is_business_owner(particuliers.business_id)
    or is_admin()
  );

-- ---- catalogue_categories ----
drop policy if exists "categories_select_all" on catalogue_categories;
create policy "categories_select_all" on catalogue_categories for select using (auth.uid() is not null);
drop policy if exists "categories_admin_write" on catalogue_categories;
create policy "categories_admin_write" on catalogue_categories for all
  using (is_admin());

-- ---- catalogue_produits ----
drop policy if exists "produits_select_all" on catalogue_produits;
create policy "produits_select_all" on catalogue_produits for select using (auth.uid() is not null);

drop policy if exists "produits_insert" on catalogue_produits;
create policy "produits_insert" on catalogue_produits for insert
  with check (
    is_admin()
    or exists (
      select 1 from businesses b join plans pl on pl.id = b.plan
      where b.profile_id = auth.uid() and pl.catalogue_write = true and b.id = catalogue_produits.added_by_business_id
    )
  );

-- IMPORTANT : ces policies UPDATE/DELETE sont volontairement séparées plutôt que
-- regroupées en une seule policy "FOR ALL". PostgreSQL combine avec un OU logique
-- toutes les policies permissives applicables à une même commande ; une policy
-- "FOR ALL" sans WITH CHECK explicite réutilise sa clause USING comme WITH CHECK
-- pour INSERT également. Une policy "FOR ALL" ici (autorisant la mise à jour de
-- ses propres produits) aurait donc aussi, sans le vouloir, autorisé l'INSERT dès
-- que added_by_business_id = son entreprise — contournant la vérification du
-- plan (catalogue_write) faite par produits_insert ci-dessus. En restreignant
-- ces policies à UPDATE et DELETE uniquement, elles ne s'appliquent jamais à
-- l'INSERT et ne peuvent plus interférer avec cette vérification.
drop policy if exists "produits_update_own" on catalogue_produits;
create policy "produits_update_own" on catalogue_produits for update
  using (
    is_admin()
    or exists (select 1 from businesses b where b.profile_id = auth.uid() and b.id = catalogue_produits.added_by_business_id)
  );

drop policy if exists "produits_delete_own" on catalogue_produits;
create policy "produits_delete_own" on catalogue_produits for delete
  using (
    is_admin()
    or exists (select 1 from businesses b where b.profile_id = auth.uid() and b.id = catalogue_produits.added_by_business_id)
  );

-- ---- devis_templates ----
drop policy if exists "devis_templates_owner" on devis_templates;
create policy "devis_templates_owner" on devis_templates for all
  using (
    exists (select 1 from businesses b where b.id = devis_templates.business_id and b.profile_id = auth.uid())
    or is_admin()
  );

-- ---- devis / devis_lignes ----
drop policy if exists "devis_owner" on devis;
create policy "devis_owner" on devis for all
  using (
    exists (select 1 from businesses b where b.id = devis.business_id and b.profile_id = auth.uid())
    or exists (select 1 from particuliers pa where pa.id = devis.particulier_id and pa.profile_id = auth.uid())
    or is_admin()
  );

drop policy if exists "devis_lignes_owner" on devis_lignes;
create policy "devis_lignes_owner" on devis_lignes for all
  using (
    exists (
      select 1 from devis d
      left join businesses b on b.id = d.business_id
      left join particuliers pa on pa.id = d.particulier_id
      where d.id = devis_lignes.devis_id
        and (b.profile_id = auth.uid() or pa.profile_id = auth.uid()
             or is_admin())
    )
  );

-- ---- demandes_devis ----
drop policy if exists "demandes_devis_owner" on demandes_devis;
create policy "demandes_devis_owner" on demandes_devis for all
  using (
    exists (select 1 from particuliers pa where pa.id = demandes_devis.particulier_id and pa.profile_id = auth.uid())
    or exists (select 1 from businesses b where b.id = demandes_devis.business_id and b.profile_id = auth.uid())
    or is_admin()
  );

-- ---- calculateurs ----
drop policy if exists "calculateurs_owner" on calculateurs;
create policy "calculateurs_owner" on calculateurs for all
  using (
    (owner_type = 'business' and exists (select 1 from businesses b where b.id = calculateurs.owner_id and b.profile_id = auth.uid()))
    or (owner_type = 'particulier' and exists (select 1 from particuliers pa where pa.id = calculateurs.owner_id and pa.profile_id = auth.uid()))
    or is_admin()
  );

-- ---- usage_compte (lecture seule côté client — écriture via consume_quota()) ----
drop policy if exists "usage_compte_select_own" on usage_compte;
create policy "usage_compte_select_own" on usage_compte for select
  using (
    (owner_type = 'business' and exists (select 1 from businesses b where b.id = usage_compte.owner_id and b.profile_id = auth.uid()))
    or (owner_type = 'particulier' and exists (select 1 from particuliers pa where pa.id = usage_compte.owner_id and pa.profile_id = auth.uid()))
    or is_admin()
  );
-- Pas de politique d'écriture directe : la consommation de quota passe uniquement
-- par la fonction consume_quota() ci-dessous (sécurisée côté serveur), pour éviter
-- qu'un utilisateur ne modifie lui-même son propre compteur d'usage.

-- ============================================================================
-- 4. FONCTION : consommation de quota sécurisée (appelée depuis l'app via RPC)
-- ============================================================================
create or replace function consume_quota(p_owner_type text, p_owner_id uuid, p_category text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_plan_id text;
  v_quota int;
  v_used int;
begin
  if p_category not in ('cps','devis','entretien','chauffage','regulateur','electrolyseur') then
    raise exception 'invalid category';
  end if;

  -- Vérifie que l'appelant est bien le propriétaire du compte (ou admin)
  if p_owner_type = 'business' then
    if not exists (select 1 from businesses b where b.id = p_owner_id and b.profile_id = auth.uid())
       and not is_admin() then
      raise exception 'not authorized';
    end if;
    select plan into v_plan_id from businesses where id = p_owner_id;
  elsif p_owner_type = 'particulier' then
    if not exists (select 1 from particuliers pa where pa.id = p_owner_id and pa.profile_id = auth.uid())
       and not is_admin() then
      raise exception 'not authorized';
    end if;
    select plan into v_plan_id from particuliers where id = p_owner_id;
  else
    raise exception 'invalid owner_type';
  end if;

  execute format('select quota_%I from plans where id = $1', p_category) into v_quota using v_plan_id;

  insert into usage_compte (owner_type, owner_id, period)
    values (p_owner_type, p_owner_id, v_period)
    on conflict (owner_type, owner_id, period) do nothing;

  execute format('select %I from usage_compte where owner_type = $1 and owner_id = $2 and period = $3', p_category)
    into v_used using p_owner_type, p_owner_id, v_period;

  if v_used >= v_quota then
    return false;
  end if;

  execute format('update usage_compte set %I = %I + 1 where owner_type = $1 and owner_id = $2 and period = $3', p_category, p_category)
    using p_owner_type, p_owner_id, v_period;

  return true;
end;
$$;

-- ============================================================================
-- 5. TRIGGER : création automatique du profil + de la fiche métier à l'inscription
-- ============================================================================
-- Suppose que l'inscription (supabase.auth.signUp) transmet dans `options.data` :
--   { role: 'business'|'particulier', nom: '...', ville: '...' }
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'particulier');
begin
  insert into profiles (id, role) values (new.id, v_role);

  if v_role = 'business' then
    insert into businesses (profile_id, nom, ville)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom', 'Nouvelle entreprise'), new.raw_user_meta_data->>'ville');
  elsif v_role = 'particulier' then
    insert into particuliers (profile_id, nom, ville)
      values (new.id, coalesce(new.raw_user_meta_data->>'nom', 'Nouveau compte'), new.raw_user_meta_data->>'ville');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Fin du script.
-- Prochaine étape : créer le PREMIER compte admin manuellement, car le trigger
-- ci-dessus ne crée que des comptes business/particulier. Voir le guide.
-- ============================================================================
