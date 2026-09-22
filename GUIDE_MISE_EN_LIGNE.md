# AquaLC — passer de la démo à une vraie application en ligne

## Où on en est

Ce que tu as aujourd'hui est une **démo** : une seule page web où toutes les données
(comptes, devis, catalogue...) sont stockées dans le navigateur de chaque
visiteur. C'est parfait pour montrer le produit, mais ça ne peut pas être un
vrai service : deux personnes qui ouvrent le lien ne voient pas les mêmes
données, rien n'est sauvegardé sur un serveur, et il n'y a pas de vrai système
de comptes ni de paiement.

Passer en production demande un vrai backend. Voici le plan, en 6 phases :

1. **Infrastructure** (en cours) — créer une base de données réelle (Supabase)
   et un compte de paiement (Stripe).
2. **Schéma de données** — ✅ fait et testé (voir `supabase_schema.sql`).
3. **Vraie authentification** — inscription/connexion réelles par e-mail,
   remplaçant le login simulé actuel.
4. **Branchement de l'app** — réécrire la partie de l'application qui lit/écrit
   les données pour qu'elle parle à Supabase au lieu du stockage local du
   navigateur. C'est la étape la plus grosse.
5. **Paiement Stripe** — abonnements réels facturés automatiquement par carte
   bancaire, synchronisés avec les plans/quotas.
6. **Mise en ligne** — héberger le site sur un vrai nom de domaine.

**Sois averti·e honnêtement** : les étapes 4 et 5 représentent un vrai travail
d'ingénierie (plusieurs sessions de travail), pas un interrupteur qu'on
bascule. On avance étape par étape, je te montre chaque brique testée avant de
passer à la suite.

Cette étape-ci (Phase 1) ne coûte rien pour démarrer : Supabase et Stripe ont
tous les deux un mode gratuit/test largement suffisant pour lancer et valider
le produit avant d'avoir de vrais clients payants.

---

## Étape 1 — Créer un projet Supabase (gratuit)

Supabase est le service qui va héberger ta vraie base de données et gérer les
comptes utilisateurs (connexion/mot de passe).

1. Va sur **https://supabase.com** et clique sur **"Start your project"**.
2. Crée un compte (avec ton e-mail ou GitHub).
3. Clique sur **"New project"**.
   - **Name** : `aqualc` (ou ce que tu veux)
   - **Database Password** : génère-en un solide et **note-le dans un endroit
     sûr** (gestionnaire de mots de passe) — ce n'est pas à moi de le stocker.
   - **Region** : choisis la plus proche du Maroc (ex. `eu-west-3` Paris, ou
     `eu-central-1` Frankfurt).
   - Plan : **Free** suffit largement pour démarrer.
4. Attends 1-2 minutes que le projet soit prêt.
5. Une fois dans le tableau de bord du projet, va dans **SQL Editor** (menu de
   gauche) → **New query**.
6. Ouvre le fichier `supabase_schema.sql` que je t'ai fourni, colle tout son
   contenu dans l'éditeur, puis clique **Run**. Ça crée toutes les tables, la
   sécurité par compte, et les 4 plans (CPS, Propriétaire, Installateur,
   Business) automatiquement.
7. Va dans **Project Settings → API**. Tu y trouveras deux informations à me
   rapporter :
   - **Project URL** (ressemble à `https://xxxxx.supabase.co`)
   - **anon / public key** (une longue chaîne de caractères)

   **⚠️ Important** : ne me partage jamais la **`service_role` key** — celle-là
   donne un accès total à la base sans aucune limite de sécurité. Elle ne doit
   jamais quitter le tableau de bord Supabase ni apparaître dans une
   conversation ou dans du code visible publiquement.

---

## Étape 2 — Créer un compte Stripe (mode test, gratuit)

Stripe gérera les vrais paiements par carte bancaire pour les abonnements.

1. Va sur **https://stripe.com** et crée un compte.
2. Une fois connecté, reste en **mode Test** (interrupteur en haut à droite du
   tableau de bord) — ça permet de tout construire et tester avec de fausses
   cartes bancaires, sans toucher de vrai argent, avant de basculer en mode
   Live le jour du vrai lancement.
3. Dans **Developers → API keys**, tu trouveras :
   - **Publishable key** (commence par `pk_test_...`) — tu peux me la
     partager.
   - **Secret key** (commence par `sk_test_...`) — **ne me la partage jamais
     dans le chat**. Elle sera configurée plus tard directement dans
     l'environnement du serveur d'hébergement (jamais dans le code ni dans une
     conversation).
4. Pas besoin de créer les produits/prix Stripe tout de suite — on le fera
   ensemble à l'étape "Paiement Stripe" du plan, une fois l'authentification en
   place.

---

## Ce qu'il faut me rapporter

Une fois ces deux comptes créés, donne-moi simplement :
- L'URL du projet Supabase
- La clé `anon` / `public` de Supabase
- La clé `publishable` (`pk_test_...`) de Stripe

Avec ça, je peux commencer la Phase 3 (vraie authentification par e-mail).

## Rappel sécurité

Les clés **secrètes** (`service_role` de Supabase, `sk_test_...`/`sk_live_...`
de Stripe) ne doivent **jamais** être collées dans cette conversation, ni dans
aucun fichier de code. Elles seront configurées directement comme variables
d'environnement sur la plateforme d'hébergement, à l'étape du déploiement.
