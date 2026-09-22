-- ============================================================================
-- AquaLC — Catalogue central de référence (produits + catégories).
-- À exécuter UNE FOIS, après supabase_schema.sql et supabase_migration_phase4.sql.
-- SQL Editor > New query > coller > Run.
-- Idempotent : relançable (les produits sont identifiés par leur `key`).
-- Ces lignes ont added_by_business_id = NULL  ->  catalogue central, visible
-- par tous, modifiable seulement par l'admin.
-- ============================================================================

insert into catalogue_categories (nom) values
  ('Filtration'), ('Pompage'), ('Chauffage'), ('Éclairage'),
  ('Hydraulique'), ('Stérilisation'), ('Entretien')
on conflict do nothing;

insert into catalogue_produits (key, nom, categorie, unite, prix) values
  ('filtre-400',            'Filtre à sable Ø400',                    'Filtration',    'u',   2100),
  ('filtre-500',            'Filtre à sable Ø500',                    'Filtration',    'u',   2900),
  ('filtre-600',            'Filtre à sable Ø600',                    'Filtration',    'u',   3800),
  ('filtre-750',            'Filtre à sable Ø750',                    'Filtration',    'u',   5400),
  ('filtre-900',            'Filtre à sable Ø900',                    'Filtration',    'u',   7200),
  ('filtre-1050',           'Filtre à sable Ø1050',                   'Filtration',    'u',   9600),
  ('gravier-filtrant',      'Gravier de quartz 3–5 mm (sac 25kg)',    'Filtration',    'sac',   85),
  ('sable-filtrant',        'Sable de silice 0,4–0,8 mm (sac 25kg)',  'Filtration',    'sac',   85),
  ('pompe-filtration',      'Pompe de filtration',                    'Pompage',       'u',   2600),
  ('pompe-a-chaleur',       'Pompe à chaleur',                        'Chauffage',     'u',  12500),
  ('rechauffeur-electrique','Réchauffeur électrique',                 'Chauffage',     'u',   4200),
  ('projecteur-led',        'Projecteur LED piscine',                 'Éclairage',     'u',    790),
  ('transfo-12v',           'Transformateur sécurité 12V',            'Éclairage',     'u',    520),
  ('buse-refoulement',      'Buse de refoulement',                    'Hydraulique',   'u',    145),
  ('skimmer',               'Skimmer',                                'Hydraulique',   'u',    480),
  ('bonde-fond',            'Bonde de fond',                          'Hydraulique',   'u',    390),
  ('prise-balai',           'Prise balai',                            'Hydraulique',   'u',    210),
  ('tube-pvc-50',           'Tube PVC pression Ø50',                  'Hydraulique',   'm',     38),
  ('tube-pvc-63',           'Tube PVC pression Ø63',                  'Hydraulique',   'm',     52),
  ('tube-pvc-90',           'Tube PVC pression Ø90',                  'Hydraulique',   'm',     78),
  ('vanne-pvc',             'Vanne PVC / multivoies',                 'Hydraulique',   'u',    260),
  ('raccord-union',         'Raccord union PVC',                      'Hydraulique',   'u',     45),
  ('coude-pvc',             'Coude PVC 90°',                          'Hydraulique',   'u',     18),
  ('clapet-anti-retour',    'Clapet anti-retour',                     'Hydraulique',   'u',    220),
  ('collier-fixation',      'Collier de fixation',                    'Hydraulique',   'u',      9),
  ('regulateur-ph',         'Régulateur pH',                          'Stérilisation', 'u',   3800),
  ('regulateur-chlore',     'Régulateur Chlore',                      'Stérilisation', 'u',   3800),
  ('regulateur-ph-chlore',  'Régulateur pH/Chlore',                   'Stérilisation', 'u',   6900),
  ('electrolyseur-sel',     'Électrolyseur au sel',                   'Stérilisation', 'u',   8900),
  ('sel-piscine',           'Sel piscine (sac 25kg)',                 'Stérilisation', 'sac',   75),
  ('chlore-choc',           'Chlore choc (kg)',                       'Entretien',     'kg',    48),
  ('galets-chlore',         'Galets chlore lent (kg)',                'Entretien',     'kg',    52),
  ('ph-plus',               'pH plus (kg)',                           'Entretien',     'kg',    32),
  ('ph-moins',              'pH moins (kg)',                          'Entretien',     'kg',    30),
  ('anti-algue',            'Anti-algue (L)',                         'Entretien',     'L',     95),
  ('floculant',             'Floculant (L)',                          'Entretien',     'L',     70),
  ('brosse-bassin',         'Brosse de bassin',                       'Entretien',     'u',    180),
  ('epuisette',             'Épuisette',                              'Entretien',     'u',     95),
  ('perche-telescopique',   'Perche télescopique',                    'Entretien',     'u',    220),
  ('tuyau-refoulement',     'Tuyau de refoulement (m)',               'Entretien',     'm',     35),
  ('balai-aspirateur',      'Balai aspirateur manuel',                'Entretien',     'u',    650),
  ('trousse-analyse',       'Trousse d''analyse (pH/Chlore)',         'Entretien',     'u',    180)
on conflict do nothing;

-- ============================================================================
-- Fin. Vérification : select count(*) from catalogue_produits;  -> 41
-- ============================================================================
