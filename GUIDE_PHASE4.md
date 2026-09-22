# AquaLC — Phase 4 : synchroniser les vraies données

La Phase 3 a branché la **connexion**. La Phase 4 branche les **données** :
à la place des données de démonstration, chaque compte voit et modifie ses
propres données, stockées dans Supabase.

On avance **par morceau**, chacun testé avant le suivant. Après chaque
morceau validé, le bandeau orange recule d'un cran.

---

## Préalable — deux scripts SQL (une fois)

Le schéma initial ne couvrait pas tous les champs de l'app (téléphone
client, suivi de chantier, fiches techniques…), et la base est vide de
produits.

**Dans cet ordre**, Supabase → **SQL Editor** → **New query** → colle tout
→ **Run** → « Success » :

1. **`supabase_migration_phase4.sql`** — ajoute les colonnes manquantes.
2. **`supabase_seed_catalogue.sql`** — remplit le catalogue central
   (41 produits + 7 catégories). Vérif : `select count(*) from
   catalogue_produits;` doit donner **41**.

---

## Les morceaux, dans l'ordre

| # | Morceau | Ce que ça branche | Statut |
|---|---|---|---|
| 1 | **Catalogue** | produits + catégories : lecture au login, écriture à chaque modif | ✅ validé |
| 2 | **Clients** | fiches clients du Business (nom, tél, paiement, tâches, suivi) | ✅ validé |
| 3 | **Devis & modèle** | modèle de document + devis courant + CPS + historique | ✅ validé |
| 4 | **Calculateurs** | étude, entretien, hydraulique, stérilisation + calculs enregistrés | ✅ validé |
| 5 | **Quotas** | compteur mensuel réel via `consume_quota()` | ✅ code prêt — à tester |
| 6 | **Admin** | la console admin lit tous les comptes / édite les plans | ✅ code prêt — à tester |

Quand les 6 sont validés : l'app tourne à 100 % sur Supabase, et on peut
passer à la **Phase 5 (paiement)** puis à l'**hébergement**.
Le bandeau orange pourra alors être retiré.

---

## Comment on teste chaque morceau

À chaque fois, le même réflexe :
1. Tu récupères la nouvelle version de `index.html` (je te dis comment).
2. Tu rouvres l'app, tu fais une modif (ajouter un produit, un client…).
3. Tu vérifies dans Supabase → **Table Editor** que la ligne est bien là /
   modifiée.
4. Tu rouvres l'app dans un autre navigateur (ou navigation privée),
   tu te connectes : tu dois retrouver **exactement** tes données.

Le point 4 est le vrai test : si tes données te suivent d'un appareil à
l'autre, c'est que tout passe bien par la base et non plus par le
navigateur.

---

## Récupérer la nouvelle version de `index.html`

À chaque morceau je pousse le code sur GitHub. Pour récupérer :

**Option simple (sans Git)** : je te donne le fichier directement ici, tu
remplaces l'ancien `index.html` par le nouveau, **et tu recolles tes 2
clés Supabase** (étape 5 de la Phase 3) car un fichier neuf a les champs
vides.

**Option Git** (si tu veux) : `git pull` dans le dossier — tes clés
restent car elles sont dans un fichier que Git suit ; on verra pour les
sortir dans un fichier à part plus tard.
