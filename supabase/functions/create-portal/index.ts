// POST /functions/v1/create-portal
// Body: {}  (nothing needed — the user is identified by their JWT)
//
// Opens the Stripe Billing Customer Portal so the account can change card,
// switch plan, download invoices, or cancel. Returns { url }.
//
// Secrets required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// Optional: AQUA_APP_ORIGIN

import { preflight, json } from "../_shared/cors.ts";
import { stripeClient, userClient } from "../_shared/clients.ts";

const APP_ORIGIN = Deno.env.get("AQUA_APP_ORIGIN") ?? "http://localhost:4599";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const sb = userClient(req);
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "not authenticated" }, 401);
    const user = userRes.user;

    // Find the customer id on whichever account row belongs to this user.
    const [{ data: biz }, { data: part }] = await Promise.all([
      sb.from("businesses").select("stripe_customer_id").eq("profile_id", user.id).maybeSingle(),
      sb.from("particuliers").select("stripe_customer_id").eq("profile_id", user.id).maybeSingle(),
    ]);
    const customerId = biz?.stripe_customer_id ?? part?.stripe_customer_id;
    if (!customerId) return json({ error: "no Stripe customer for this account yet" }, 400);

    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_ORIGIN}/?view=abonnement`,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("create-portal error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
