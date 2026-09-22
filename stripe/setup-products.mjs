/* ---------------------------------------------------------------------------
 * AquaLC — création (une fois) des Produits + Prix Stripe pour chaque formule.
 *
 *   npm i stripe
 *   STRIPE_SECRET_KEY=rk_test_xxx  node stripe/setup-products.mjs        (mode Test)
 *   STRIPE_SECRET_KEY=rk_live_xxx  node stripe/setup-products.mjs        (mode Live)
 *
 * Idempotent : relançable (Produits/Prix retrouvés par leurs métadonnées).
 * En sortie : le SQL `update plans set stripe_price_id=... ` à coller dans Supabase.
 *
 * ⚠️ Utilise une CLÉ RESTREINTE (rk_...) avec les permissions écriture sur
 *    "Products" et "Prices", pas la clé secrète complète.
 * --------------------------------------------------------------------------- */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('❌  Définis STRIPE_SECRET_KEY (rk_test_… ou rk_live_…)'); process.exit(1); }
const stripe = new Stripe(key);

// Devise de présentation. MAD si le compte Stripe l'accepte, sinon repasser à 'usd'
// (les montants ci-dessous sont alors interprétés comme des cents USD → adapter).
const CURRENCY = process.env.AQUA_CURRENCY || 'mad';

// mad : 200 MAD -> unit_amount 20000 (2 décimales). interval_count 3 = trimestriel.
// oneTime:true -> prix sans récurrence (Checkout mode 'payment'), ex. CPS à l'usage.
const PLANS = [
  { id: 'cps', name: 'AquaLC — CPS (à l\'usage)',
    prices: [{ key: 'main', amount: 400, oneTime: true }] },
  { id: 'proprietaire', name: 'AquaLC — Propriétaire',
    prices: [{ key: 'main', amount: 200,  interval: 'month', count: 1 }] },
  { id: 'installateur', name: 'AquaLC — Installateur',
    prices: [{ key: 'main', amount: 500,  interval: 'month', count: 1 }] },
  { id: 'business',     name: 'AquaLC — Business',
    prices: [{ key: 'main', amount: 800,  interval: 'month', count: 1 },
             { key: 'alt',  amount: 2000, interval: 'month', count: 3 }] },
  { id: 'business_pro', name: 'AquaLC — Business Pro',
    prices: [{ key: 'main', amount: 6000, interval: 'year',  count: 1 }] },
];

const unit = (a) => Math.round(a * 100); // 2 décimales (mad, usd, eur…)

async function findProduct(planId) {
  const r = await stripe.products.search({ query: `metadata['aqualc_plan']:'${planId}'`, limit: 1 });
  return r.data[0] || null;
}

const results = {};
for (const p of PLANS) {
  let product = await findProduct(p.id);
  if (!product) {
    product = await stripe.products.create({ name: p.name, metadata: { aqualc_plan: p.id } });
    console.log(`+ produit ${p.id}  ${product.id}`);
  } else {
    console.log(`= produit ${p.id}  ${product.id}`);
  }
  const row = { stripe_product_id: product.id };
  const existing = (await stripe.prices.list({ product: product.id, active: true, limit: 100 })).data;

  for (const pr of p.prices) {
    let price = existing.find(x =>
      x.metadata.aqualc_price === pr.key &&
      x.currency === CURRENCY &&
      x.unit_amount === unit(pr.amount) &&
      (pr.oneTime
        ? !x.recurring
        : (x.recurring?.interval === pr.interval && (x.recurring?.interval_count || 1) === pr.count)));
    if (!price) {
      price = await stripe.prices.create({
        product: product.id, currency: CURRENCY, unit_amount: unit(pr.amount),
        ...(pr.oneTime ? {} : { recurring: { interval: pr.interval, interval_count: pr.count } }),
        metadata: { aqualc_plan: p.id, aqualc_price: pr.key },
      });
      console.log(`  + prix ${pr.key}  ${price.id}  (${pr.amount} ${CURRENCY.toUpperCase()}${pr.oneTime ? ' à l\'usage' : ' / '+pr.count+' '+pr.interval})`);
    } else {
      console.log(`  = prix ${pr.key}  ${price.id}`);
    }
    row[pr.key === 'main' ? 'stripe_price_id' : 'stripe_price_alt_id'] = price.id;
  }
  results[p.id] = row;
}

console.log('\n============================================================');
console.log(' Colle ce SQL dans Supabase → SQL Editor :');
console.log('============================================================\n');
for (const [id, row] of Object.entries(results)) {
  const sets = [`stripe_product_id='${row.stripe_product_id}'`, `stripe_price_id='${row.stripe_price_id}'`];
  if (row.stripe_price_alt_id) sets.push(`stripe_price_alt_id='${row.stripe_price_alt_id}'`);
  console.log(`update plans set ${sets.join(', ')} where id='${id}';`);
}
console.log('');
