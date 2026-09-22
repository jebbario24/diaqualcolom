# AquaLC — Paiement des abonnements (Stripe)

Ce document est le plan d'intégration du paiement. Il complète
`GUIDE_MISE_EN_LIGNE.md` (c'est la **Phase 5** de ce plan).

---

## 0. À régler AVANT d'écrire une ligne de code

### 0.1 — 🔴 Clé secrète exposée

Une clé **secrète** de test (`sk_test_…`) a été collée dans la conversation.
Une clé secrète ne doit **jamais** transiter par un chat, un e-mail, ou du
code. Même en mode test, il faut la considérer comme compromise.

**À faire maintenant, par toi, dans le dashboard Stripe :**
1. Developers → API keys → à côté de la clé secrète : **"Roll key"** (ou
   "Delete"/"Revoke").
2. Stripe génère une nouvelle `sk_test_…`. Ne la partage avec personne.
3. Elle sera configurée **uniquement** comme variable d'environnement sur le
   serveur d'hébergement, au moment du déploiement.

La clé **publiable** (`pk_test_…`), elle, est faite pour être publique — pas
besoin de la changer.

### 0.2 — 🔴 Stripe est-il disponible pour ton entreprise ?

Stripe n'accepte pas (à ce jour) les entreprises **immatriculées au Maroc**.
Pour utiliser Stripe il faut une entité dans un pays supporté (France,
Espagne, États-Unis via Stripe Atlas, Émirats, etc.), et Stripe ne règle pas
en **MAD**.

**Décide d'abord** :
- **Option A** — tu as / tu crées une société dans un pays supporté par
  Stripe → on continue avec ce guide, facturation en EUR ou USD.
- **Option B** — tu restes sur une entité marocaine → il faut un
  prestataire local : **CMI**, **PayZone**, **YouCan Pay**, **Payzone**,
  **AmanPay**, ou **PayPal/2Checkout**. L'architecture décrite plus bas
  (Checkout hébergé + webhooks + synchro des quotas) reste valable ; seules
  les 3 sections « code Stripe » changent.

Le reste du guide suppose l'option A.

### 0.3 — L'ordre des choses

Le paiement vient **après** le backend, pas avant :

| Phase | Pourquoi c'est un prérequis |
|---|---|
| 3 — Vraie authentification | Une facture Stripe est rattachée à un compte réel. |
| 4 — App branchée sur Supabase | Le quota/plan doit être lu depuis la base, pas depuis le navigateur. |
| **5 — Stripe (ce guide)** | S'appuie sur 3 et 4. |

Aujourd'hui l'app n'a aucun serveur. Stripe **exige** un serveur : la clé
secrète et les webhooks ne peuvent pas vivre dans `index.html`.

---

## 1. Ce qu'il faut mettre en place

### 1.1 — Un petit backend

Le plus simple, cohérent avec Supabase : **3 Edge Functions Supabase**
(Deno, déployées avec `supabase functions deploy`) :

| Fonction | Rôle |
|---|---|
| `create-checkout` | Crée une session Stripe Checkout pour l'utilisateur connecté et renvoie l'URL. |
| `create-portal` | Crée une session du **Customer Portal** (le client gère/annule son abonnement, change de carte, télécharge ses factures). |
| `stripe-webhook` | Reçoit les événements Stripe et met à jour `businesses` / `particuliers` / `plans` dans la base. **C'est la seule source de vérité.** |

La clé secrète vit dans les secrets Supabase :
`supabase secrets set STRIPE_SECRET_KEY=sk_test_…`
`supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…`

### 1.2 — Les produits et prix Stripe

Un **Produit** Stripe par formule, un **Prix** récurrent mensuel rattaché.
À créer une fois (dashboard ou script), puis on copie chaque `price_id` dans
la colonne `plans.stripe_price_id` déjà prévue au schéma.

| Plan (`plans.id`) | Modèle | Prix affiché | Type de Prix Stripe |
|---|---|---|---|
| `proprietaire` | Abonnement mensuel | 200 MAD/mois | `recurring`, `month` |
| `installateur` | Abonnement mensuel | 500 MAD/mois | `recurring`, `month` |
| `business` | Abonnement mensuel | 2 500 MAD/mois | `recurring`, `month` |
| `cps` | **À l'usage** (400 MAD par CPS, sans abonnement) | 400 MAD/CPS | soit `recurring` avec `usage_type=metered`, soit un **paiement unique** par CPS via Checkout `mode=payment` |

> ⚠️ Devise : si l'entité Stripe est en France, les Prix seront en **EUR**
> (ou USD). Il faut fixer un tarif EUR équivalent, ou activer le
> *multi-currency pricing* de Stripe. Le montant en MAD reste l'affichage
> commercial ; Stripe encaisse dans sa devise.

### 1.3 — Le lien plan ↔ quota

`plans` contient déjà les quotas (`quota_cps`, `quota_devis`, …). Quand le
webhook reçoit un changement d'abonnement, il écrit sur le `business` /
`particulier` :
- `plan` = l'id du plan correspondant au `price_id` payé
- `stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status`

L'app lit `plan` → `plans` → quotas. La table `usage_compte` (déjà au schéma)
compte la consommation du mois. Rien de neuf côté quotas : on ne fait que
remplir `plan` automatiquement au lieu de le fixer à la main dans l'admin.

---

## 2. Le parcours utilisateur

### 2.1 — Souscription (nouveau compte ou upgrade)

1. L'utilisateur choisit une formule dans l'app (`Mon abonnement` →
   `Changer de plan`).
2. L'app appelle `create-checkout` avec le `price_id`.
3. La fonction crée (ou réutilise) le **Customer** Stripe lié à
   `auth.users.id`, puis une session Checkout
   (`mode=subscription`, `success_url`, `cancel_url`,
   `client_reference_id = profile_id`).
4. Redirection vers la page Stripe hébergée. **Aucune donnée bancaire ne
   passe par AquaLC** — c'est ce qui garde l'intégration simple et
   conforme PCI.
5. Paiement OK → Stripe redirige vers `success_url` et envoie
   `checkout.session.completed` au webhook.
6. Le webhook écrit `plan` + ids Stripe sur le compte. L'app reflète le
   nouveau plan au rechargement.

### 2.2 — Gestion / annulation

`Mon abonnement` → bouton **"Gérer mon abonnement"** → `create-portal` →
Customer Portal Stripe. Le client y annule, change de carte, récupère ses
factures PDF. Pas d'UI à construire.

### 2.3 — Événements webhook à traiter

| Événement | Action en base |
|---|---|
| `checkout.session.completed` | Renseigne `stripe_customer_id`, `stripe_subscription_id`, `plan`, `stripe_subscription_status='active'`. |
| `customer.subscription.updated` | Met à jour `plan` (up/downgrade) et `stripe_subscription_status`. |
| `customer.subscription.deleted` | Repasse le compte en plan gratuit / `statut='suspendu'` selon ta règle, `status='canceled'`. |
| `invoice.payment_failed` | `stripe_subscription_status='past_due'` ; l'app peut afficher un bandeau "paiement en échec". |
| `invoice.paid` | (option) journalise la facture pour l'historique in-app. |

**Toujours** vérifier la signature (`STRIPE_WEBHOOK_SECRET`) et rendre le
traitement idempotent (une même notification peut arriver 2 fois).

---

## 3. Étapes concrètes de mise en œuvre

1. **Prérequis** : Phases 3 et 4 de `GUIDE_MISE_EN_LIGNE.md` terminées.
2. Créer les Produits + Prix dans Stripe (mode Test), noter les `price_id`.
3. `update plans set stripe_price_id = '…' where id = '…';` pour chaque plan.
4. Écrire les 3 Edge Functions (`create-checkout`, `create-portal`,
   `stripe-webhook`).
5. `supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=…`.
6. `supabase functions deploy create-checkout create-portal stripe-webhook`.
7. Dashboard Stripe → Developers → Webhooks → ajouter l'URL de
   `stripe-webhook`, sélectionner les 5 événements ci-dessus, copier le
   `whsec_…` dans les secrets.
8. Câbler l'écran `Mon abonnement` : boutons "Choisir ce plan" →
   `create-checkout` ; bouton "Gérer mon abonnement" → `create-portal`.
9. **Tests** (mode Test, cartes fictives Stripe) :
   - carte `4242 4242 4242 4242` → souscription OK, plan mis à jour en base
   - carte `4000 0000 0000 0341` → échec de paiement → statut `past_due`
   - annulation via le Portal → `subscription.deleted` → compte rétrogradé
   - rejouer un webhook depuis le dashboard → aucun double effet (idempotent)
10. Passage en **mode Live** : refaire Produits/Prix/webhook côté Live,
    remplacer les secrets par les clés `sk_live_…` / `whsec_…` Live sur
    l'hébergement, tester un vrai paiement à petit montant.

---

## 4. Règles de sécurité (non négociables)

- La clé secrète (`sk_…`) et le secret webhook (`whsec_…`) : **uniquement**
  en variables d'environnement du serveur. Jamais dans le dépôt Git, jamais
  dans `index.html`, jamais dans une conversation.
- Le `.gitignore` doit exclure tout fichier `.env`.
- Le webhook **vérifie toujours** la signature Stripe avant d'agir.
- Le plan/quota d'un compte n'est modifié **que** par le webhook (côté
  serveur), jamais par du code client.
- Le client ne voit et ne manipule que la clé **publiable**.
- Montants et devises calculés côté serveur / Stripe, pas côté navigateur.

---

## 5. Ce dont j'ai besoin de ta part pour démarrer

1. Ta décision sur le point **0.2** (entité Stripe possible, ou prestataire
   marocain).
2. Confirmation que la clé secrète de test a été **régénérée**.
3. La clé **publiable** (`pk_test_…`) — celle-là peut être partagée.
4. Les Phases 3 et 4 en place (vraie auth + app branchée sur Supabase).

Sans 4, on peut déjà : créer les Produits/Prix Stripe et écrire les Edge
Functions « à blanc », mais on ne pourra pas les tester de bout en bout.
