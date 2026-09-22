// POST /functions/v1/create-checkout
// Body: { planId: string, billing?: "main" | "alt" }
//   billing "alt" = 2e prix de la formule (ex. Business trimestriel). Défaut: "main".
//
// Crée (ou réutilise) le Customer Stripe du compte connecté, puis une session
// Checkout en mode subscription pour le prix choisi. Renvoie { url } — le front
// redirige le navigateur dessus.
//
// Secrets : STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// Optionnel : AQUA_APP_ORIGIN (URLs success/cancel + CORS)

import { preflight, json } from "../_shared/cors.ts";
import { stripeClient, userClient, integrationLabel } from "../_shared/clients.ts";

const APP_ORIGIN = Deno.env.get("AQUA_APP_ORIGIN") ?? "http://localhost:4599";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { planId, billing } = await req.json();
    if (!planId) return json({ error: "planId required" }, 400);

    const sb = userClient(req);
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "not authenticated" }, 401);
    const user = userRes.user;

    const { data: plan, error: planErr } = await sb
      .from("plans")
      .select("id, role, label, price_period, stripe_price_id, stripe_price_alt_id")
      .eq("id", planId)
      .single();
    if (planErr || !plan) return json({ error: "unknown plan" }, 400);

    const priceId = billing === "alt" ? plan.stripe_price_alt_id : plan.stripe_price_id;
    if (!priceId) return json({ error: `plan ${planId} (${billing ?? "main"}) has no Stripe price` }, 400);

    // Formule à l'usage (CPS) : paiement unique, pas d'abonnement.
    const oneOff = plan.price_period === "unit";

    const table = plan.role === "business" ? "businesses" : "particuliers";
    const { data: account, error: accErr } = await sb
      .from(table)
      .select("id, nom, stripe_customer_id")
      .eq("profile_id", user.id)
      .single();
    if (accErr || !account) return json({ error: "account not found for user" }, 404);

    const stripe = stripeClient();

    let customerId = account.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: account.nom ?? undefined,
        metadata: { supabase_profile_id: user.id, account_table: table, account_id: account.id },
      });
      customerId = customer.id;
      await sb.from(table).update({ stripe_customer_id: customerId }).eq("id", account.id);
    }

    const md = {
      supabase_profile_id: user.id, account_table: table,
      account_id: account.id, plan_id: plan.id, billing: billing ?? "main",
      ...(oneOff ? { kind: "cps" } : {}),
    };
    const session = await stripe.checkout.sessions.create({
      mode: oneOff ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      ...(oneOff
        ? { metadata: md, payment_intent_data: { metadata: md } }
        : { subscription_data: { metadata: md } }),
      success_url: `${APP_ORIGIN}/?checkout=${oneOff ? "cps" : "success"}`,
      cancel_url: `${APP_ORIGIN}/?checkout=cancel`,
      allow_promotion_codes: true,
      integration_identifier: integrationLabel(oneOff ? "aqualc-cps" : "aqualc-sub"),
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("create-checkout error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
