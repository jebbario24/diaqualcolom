# AquaLC — Phase 3 : activer l'authentification réelle (Supabase)

Cette phase remplace la connexion **simulée** par une vraie authentification
par e-mail / mot de passe, gérée par Supabase. Le code est déjà dans l'app
(branche `feature/phase3-auth`) — il ne s'active que lorsque tu renseignes
deux valeurs.

> **Important** : tant que la Phase 4 n'est pas faite, le catalogue, les
> clients et les devis affichés restent des **données de démonstration**.
> La Phase 3 sert à valider que la chaîne inscription → base → connexion
> fonctionne bout en bout. Un bandeau le rappelle dans l'app.

---

## Avant de commencer

- [ ] Les 3 secrets exposés dans le chat ont été **régénérés**
      (mot de passe base Supabase, `sk_test_…`, `sk_live_…`).
- [ ] Tu as choisi : Stripe (entité pays supporté) **ou** prestataire
      marocain — voir `GUIDE_PAIEMENT_STRIPE.md` §0.2. *(Pas bloquant pour
      la Phase 3, mais à trancher avant la Phase 5.)*

---

## Étape 1 — Appliquer le schéma à la base

1. Supabase → ton projet → **SQL Editor** → **New query**.
2. Colle **tout** le contenu de `supabase_schema.sql` → **Run**.
3. Vérifie dans **Table Editor** que tu vois les tables : `profiles`,
   `plans`, `businesses`, `particuliers`, `devis`, … et que `plans`
   contient 4 lignes (cps, proprietaire, installateur, business).

## Étape 2 — Régler l'authentification Supabase

1. Supabase → **Authentication** → **Providers** → **Email** : activé.
2. **Authentication** → **URL Configuration** :
   - **Site URL** : l'URL où tournera l'app
     (pour tester en local : `http://localhost:4599`).
   - **Redirect URLs** : ajoute la même.
3. **Authentication** → **Sign In / Providers** → **Confirm email** :
   - **Désactivé** = plus simple pour tester (connexion immédiate après
     inscription).
   - **Activé** = l'utilisateur reçoit un e-mail de confirmation. L'app gère
     les deux cas (message « vérifiez votre e-mail »).

## Étape 3 — Créer le compte administrateur (une seule fois)

Le trigger d'inscription ne crée que des comptes `business` / `particulier`.
L'admin se crée à la main :

1. Supabase → **Authentication** → **Users** → **Add user** →
   e-mail + mot de passe (coche « Auto Confirm User »).
2. Copie l'`UID` de l'utilisateur créé.
3. **SQL Editor** :
   ```sql
   insert into profiles (id, role) values ('COLLE_L_UID_ICI', 'admin')
   on conflict (id) do update set role = 'admin';
   ```

## Étape 4 — Récupérer les clés publiques

Supabase → **Project Settings** → **API** :
- **Project URL** → `https://celxziugeeojamflcafs.supabase.co`
- **Project API keys → `anon` / `public`** → la longue chaîne `eyJhbGci…`

⚠️ **Jamais** la clé `service_role` ici.

## Étape 5 — Activer le mode compte réel dans l'app

Ouvre `index.html`, en haut du fichier :

```js
window.AQUA_SUPABASE = {
  url: 'https://celxziugeeojamflcafs.supabase.co',
  anonKey: 'eyJhbGci...'   // la clé anon / public
};
```

Recharge la page. Tu dois voir :
- plus de boutons « connexion démo » sur l'écran de connexion ;
- un bandeau orange « Mode compte réel (Supabase) … ».

## Étape 6 — Tester

1. **Inscription** : page Tarifs → choisir un plan → créer un compte
   (e-mail réel, mot de passe ≥ 6 caractères).
   - *Confirm email désactivé* → tu es connecté directement.
   - *activé* → va dans ta boîte mail, clique le lien, puis connecte-toi.
2. Vérifie dans Supabase → **Authentication → Users** que le compte existe,
   et dans **Table Editor → businesses** (ou `particuliers`) qu'une ligne a
   été créée automatiquement avec le bon `nom` / `ville`.
3. **Déconnexion / reconnexion** : la session doit repartir (tu restes
   connecté après un rechargement de page).
4. **Connexion admin** : avec le compte de l'étape 3 → tu arrives sur la
   console admin.
5. Édite le nom de l'entreprise dans **Paramètres du compte** → attends 2 s
   → vérifie dans **Table Editor → businesses** que le `nom` a changé.

Si tout ça marche : la Phase 3 est validée.

---

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| L'app reste sur la page d'accueil, pas de bandeau | `url` ou `anonKey` mal copiés, ou schéma non appliqué |
| « Inscription impossible » | *Confirm email* + adresse déjà utilisée, ou mot de passe < 6 |
| Compte créé mais aucune ligne dans `businesses` | trigger `on_auth_user_created` absent → relance `supabase_schema.sql` |
| Connexion admin arrive sur l'espace business | ligne `profiles.role` pas passée à `'admin'` (étape 3) |
| Erreur CORS dans la console | ajoute l'URL de l'app dans Authentication → URL Configuration |

---

## Ensuite — Phase 4 (synchronisation des données)

Une fois la Phase 3 validée, la Phase 4 remplace les données de démo par les
vraies données de chaque compte :
- charger le catalogue, les clients, les devis, les calculateurs depuis
  Supabase à la connexion ;
- pousser chaque modification vers la base (à la place de `localStorage`) ;
- consommer les quotas via la fonction `consume_quota()` (déjà au schéma) ;
- retirer le bandeau.

C'est le plus gros morceau. On le fait table par table, testé à chaque étape.
