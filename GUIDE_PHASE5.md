# Phase 5 — Paiement Stripe (pas à pas)

Entité Stripe : **USA** ✅ → on part sur Stripe.
Un business choisit une formule → paie par carte (Checkout) → un webhook
met à jour son `plan`. Il gère/annule via le portail client Stripe.

Tout se fait en **mode Test** d'abord (fausses cartes), puis bascule Live.

---

## Étape 0 — Sécuriser les clés

1. Stripe → **Developers → API keys** → **Roll** la clé secrète test **et** live
   (celles collées dans le chat sont grillées).
2. **Developers → API keys → Create restricted key** :
   - Nom : `aqualc-server`
   - Permissions **Write** : `Products`, `Prices`, `Checkout Sessions`,
     `Customers`, `Subscriptions`, `Billing Portal Sessions`
   - Permission **Read** : `Webhook Endpoints`
   - Crée → copie la clé `rk_test_…` (et plus tard `rk_live_…`).
   → C'est cette clé `rk_…` qu'on utilise partout, jamais `sk_…`.

## Étape 1 — Créer les Produits + Prix

Dans le dossier du projet :

```bash
npm i stripe
```
```bash
# PowerShell :
$env:STRIPE_SECRET_KEY="rk_test_xxx"; node stripe/setup-products.mjs
# ou Git Bash :
STRIPE_SECRET_KEY=rk_test_xxx node stripe/setup-products.mjs
```

Le script crée 4 Produits (Propriétaire, Installateur, Business, Business Pro)
et leurs Prix en **MAD** (Business en a 2 : mensuel + trimestriel), puis
affiche un bloc SQL `update plans set stripe_price_id=…`.

➡️ Colle ce SQL dans Supabase → **SQL Editor** → Run.

*(Si le script dit « currency mad not supported » : relance avec
`AQUA_CURRENCY=usd` — les prix seront alors en USD, adapte les montants
dans `stripe/setup-products.mjs` si besoin.)*

## Étape 2 — Lier le projet Supabase + poser les secrets

```bash
npm i -g supabase
supabase login
supabase link --project-ref celxziugeeojamflcafs
```

Secrets (Stripe **Developers → Webhooks** te donnera `whsec_…` à l'étape 4 —
mets d'abord les autres) :

```bash
supabase secrets set STRIPE_SECRET_KEY=rk_test_xxx
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx      # Settings → API → service_role
supabase secrets set AQUA_APP_ORIGIN=https://aqualc.com
```

## Étape 3 — Déployer les 3 fonctions

```bash
supabase functions deploy create-checkout
supabase functions deploy create-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

## Étape 4 — Enregistrer le webhook

1. Stripe → **Developers → Webhooks → Add endpoint**
2. URL : `https://celxziugeeojamflcafs.supabase.co/functions/v1/stripe-webhook`
3. Événements à cocher :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Crée → copie le **Signing secret** `whsec_…` :
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```
5. Redéploie le webhook pour qu'il prenne le secret :
```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

## Étape 5 — Activer le portail client

Stripe → **Settings → Billing → Customer portal** → active-le, coche
« autoriser l'annulation » et « changer de formule » → **Save**.

## Étape 6 — Tester (mode Test)

1. Recharge `https://aqualc.com/`, connecte-toi (Business).
2. **Mon abonnement** → une formule → **« Choisir cette formule »**.
3. Page Stripe → carte **`4242 4242 4242 4242`**, date future, CVC quelconque.
4. Retour sur l'app → bandeau « Paiement confirmé ». Après ~3 s, le plan est
   à jour.
5. **Vérifs** :
   - `businesses` (Table Editor) → `stripe_customer_id`, `stripe_subscription_id`,
     `stripe_subscription_status='active'`, `plan` = la formule choisie
   - Stripe → **Payments** → un paiement test
6. **« Gérer mon abonnement »** → portail Stripe → annule → retour app →
   `stripe_subscription_status='canceled'`.
7. Carte d'échec `4000 0000 0000 0341` → `status='past_due'`.

## Étape 7 — Passage en Live

1. Refais l'**étape 1** avec `rk_live_…` (nouveaux Produits/Prix Live) → SQL.
2. `supabase secrets set STRIPE_SECRET_KEY=rk_live_…`
3. Webhook Live (nouvel endpoint, même URL, mode Live) → nouveau `whsec_…` →
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_live_…`
4. Redéploie les 3 fonctions.
5. Un vrai paiement à petit montant pour valider, puis rembourse-le.

---

## Ce qu'il me faut de ta part

- Confirmation que les clés sont **rollées** + la clé `rk_test_…`
- Le SQL sorti par `setup-products.mjs` (ou dis-moi si tu l'as collé toi-même)
- Tout `ERROR` rencontré à une étape

## Notes

- La formule **CPS** (400 MAD à l'usage) n'est pas branchée sur Stripe pour
  l'instant — c'est un paiement unique par document, pas un abonnement. À
  traiter séparément si besoin.
- L'abonnement **particulier** (Propriétaire, 200 MAD/mois) : le câblage
  est prêt côté fonctions, il reste à ajouter les boutons dans l'espace
  particulier — petit ajout une fois le business validé.
