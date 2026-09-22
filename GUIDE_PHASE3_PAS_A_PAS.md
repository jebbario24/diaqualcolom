# Phase 3 — pas à pas (aucune connaissance technique requise)

Objectif : activer la vraie inscription / connexion. Compte ~30 minutes.
Suis les étapes dans l'ordre. Chaque clic est décrit.

Tu auras besoin de :
- ton compte Supabase (déjà créé)
- le dossier `aqualc-project` sur ton ordinateur
- un navigateur (Chrome, Edge, Firefox)

---

## ÉTAPE 1 — Créer les tables dans la base

1. Va sur **https://supabase.com/dashboard** et connecte-toi.
2. Clique sur ton projet (celui dont l'adresse contient `celxziugeeojamflcafs`).
3. Dans la barre d'icônes tout à **gauche**, clique sur l'icône
   **SQL Editor** (elle ressemble à `>_` ou à un cylindre de base de
   données). Si tu hésites, survole les icônes : le nom s'affiche.
4. En haut à gauche de l'éditeur, clique **« + New query »** (ou
   « New snippet »).
5. Sur ton ordinateur, ouvre le dossier `aqualc-project`, fais un
   **clic droit** sur le fichier **`supabase_schema.sql`** →
   **Ouvrir avec** → **Bloc-notes** (Notepad).
6. Dans le Bloc-notes : menu **Édition → Sélectionner tout**
   (ou `Ctrl + A`), puis **Ctrl + C** (copier).
7. Reviens sur la page Supabase, clique dans la grande zone de texte,
   fais **Ctrl + V** (coller). Tout le texte apparaît.
8. En bas à droite, clique le bouton vert **« Run »** (ou appuie
   `Ctrl + Entrée`).
9. Attends 2-3 secondes. Un message vert apparaît en bas :
   **« Success. No rows returned »**. C'est bon.

**Vérification** : dans la barre de gauche, clique l'icône
**Table Editor**. Tu dois voir une liste de tables :
`businesses`, `particuliers`, `plans`, `profiles`, `devis`… Si tu cliques
sur `plans`, tu vois **4 lignes** (cps, proprietaire, installateur,
business). ✅

---

## ÉTAPE 2 — Réglages de connexion

1. Barre de gauche → icône **Authentication** (un cadenas ou une
   silhouette).
2. Dans le sous-menu qui apparaît, clique **« Sign In / Providers »**
   (ou juste **« Providers »**).
3. Dans la liste, trouve **« Email »**. L'interrupteur à droite doit être
   **vert / activé**. S'il ne l'est pas, clique dessus pour l'activer.
4. Clique sur la ligne **« Email »** pour la déplier. Cherche l'option
   **« Confirm email »** :
   - Pour tester simplement, **désactive-la** (interrupteur gris).
     → tu seras connecté tout de suite après l'inscription, sans e-mail.
   - Clique **« Save »** en bas si un bouton apparaît.
5. Toujours dans **Authentication**, sous-menu **« URL Configuration »**.
   - Champ **« Site URL »** : écris exactement
     `http://localhost:4599`
   - Clique **« Save »**.

*(Si plus tard tu héberges l'app sur une vraie adresse, tu reviendras ici
mettre cette adresse à la place.)*

---

## ÉTAPE 3 — Créer TON compte administrateur

Le compte admin ne se crée pas via le formulaire de l'app, il se fait ici,
une seule fois.

1. **Authentication** → sous-menu **« Users »**.
2. Bouton **« Add user »** (en haut à droite) → **« Create new user »**.
3. Remplis :
   - **Email address** : ton e-mail
   - **Password** : un mot de passe solide (note-le)
   - coche **« Auto Confirm User? »**
4. Clique **« Create user »**.
5. Le compte apparaît dans la liste. **Clique dessus** : un panneau
   s'ouvre à droite. Repère la ligne **« User UID »** — c'est une suite
   du type `a1b2c3d4-…`. Clique l'icône **copier** à côté.
6. Retourne dans **SQL Editor** → **« + New query »**.
7. Colle ceci, en remplaçant `COLLE_UID_ICI` par ce que tu viens de
   copier (garde les apostrophes) :
   ```sql
   insert into profiles (id, role)
   values ('COLLE_UID_ICI', 'admin')
   on conflict (id) do update set role = 'admin';
   ```
8. Clique **« Run »**. Message vert **« Success »**. ✅

---

## ÉTAPE 4 — Récupérer les 2 clés à copier

1. Tout en bas de la barre de gauche → icône **Project Settings**
   (une roue crantée ⚙️).
2. Clique la section **« API »**.
3. Tu vois :
   - **Project URL** — une adresse `https://celxziugeeojamflcafs.supabase.co`.
     Clique **copier**, garde-la de côté (colle-la dans un Bloc-notes
     temporaire).
   - Plus bas, **« Project API keys »** → la clé nommée **`anon`**
     **`public`** (parfois écrite **« Publishable key »**). Une longue
     suite qui commence par `eyJ…`. Clique **copier**.

   ⚠️ **NE COPIE JAMAIS** la clé **`service_role`** (celle marquée
   « secret » / « Never expose »). On n'en a pas besoin ici.

---

## ÉTAPE 5 — Coller les clés dans l'application

1. Dans le dossier `aqualc-project`, **clic droit** sur **`index.html`**
   → **Ouvrir avec** → **Bloc-notes**.
2. Menu **Édition → Rechercher** (`Ctrl + F`), tape `AQUA_SUPABASE`,
   clique « Suivant ». Tu arrives sur ces lignes (vers le haut du
   fichier) :
   ```js
   window.AQUA_SUPABASE = {
     url: '',
     anonKey: ''
   };
   ```
3. Colle tes valeurs **entre les apostrophes** :
   ```js
   window.AQUA_SUPABASE = {
     url: 'https://celxziugeeojamflcafs.supabase.co',
     anonKey: 'eyJhbGciOi...'
   };
   ```
   ⚠️ Ne supprime pas les apostrophes `'` ni la virgule. Ne mets rien
   d'autre.
4. Menu **Fichier → Enregistrer** (`Ctrl + S`).

---

## ÉTAPE 6 — Tester

1. Dans le dossier `aqualc-project`, **double-clique `index.html`**.
   Il s'ouvre dans ton navigateur.
2. Tu dois voir :
   - sur la page **Connexion**, **plus** de boutons gris
     « admin@… / business@… » ;
   - une fois connecté, un **bandeau orange** en haut.
   Si tu ne vois pas ça → les clés sont mal collées, reprends l'étape 5.
3. **Test inscription** : clique **« Tarifs »** → choisis une formule →
   **« Choisir ce plan »** → remplis le formulaire avec **un vrai
   e-mail** et un mot de passe d'au moins 6 caractères → **« Créer mon
   compte »**.
   - Tu dois être connecté directement (bandeau orange visible).
4. **Vérifie côté base** : Supabase → **Table Editor** → table
   **`businesses`** (ou `particuliers` si tu as pris une formule
   particulier). Une **nouvelle ligne** doit être apparue, avec le nom
   que tu as tapé. ✅ ✅ ← *c'est la preuve que tout fonctionne.*
5. **Test connexion** : dans l'app, déconnecte-toi (menu en bas à
   gauche), puis reconnecte-toi avec le même e-mail / mot de passe.
6. **Test admin** : déconnecte-toi, connecte-toi avec l'e-mail de
   l'ÉTAPE 3 → tu dois arriver sur la **console d'administration**.

Si les points 4, 5 et 6 marchent : **la Phase 3 est validée.** Dis-le moi
et on lance la Phase 4.

---

## Si ça coince — dis-moi lequel

| Ce que tu vois | Étape à revoir |
|---|---|
| Pas de bandeau orange, les boutons démo sont encore là | Étape 5 (clés mal collées) ou Étape 1 (schéma pas exécuté) |
| « Inscription impossible… » | mot de passe < 6 caractères, ou e-mail déjà utilisé |
| Compte créé mais **aucune** ligne dans `businesses` | relance `supabase_schema.sql` (Étape 1) — le trigger manque |
| Connexion admin → arrive sur l'espace « business » | l'UID de l'Étape 3 n'est pas le bon, refais 3.5 → 3.8 |
| Page blanche | ouvre la console du navigateur (touche F12) et copie-moi l'erreur en rouge |

Copie-moi le message exact et je te débloque.
