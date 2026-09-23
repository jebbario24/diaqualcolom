// POST /functions/v1/create-portal
// Body: {}  (nothing needed — the user is identified by their JWT)
//
// Opens Paddle's customer portal so the account can update their payment
// method or cancel their subscription. Returns { url }.
//
// Secrets required: PADDLE_API_KEY, PADDLE_ENVIRONMENT ("sandbox"|"production"),
//   SUPABASE_URL, SUPABASE_ANON_KEY

import { preflight, json } from "../_shared/cors.ts";
import { paddleFetch, userClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const sb = userClient(req);
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "not authenticated" }, 401);
    const user = userRes.user;

    // Find the Paddle customer id + subscription id on whichever account row belongs to this user.
    const [{ data: biz }, { data: part }] = await Promise.all([
      sb.from("businesses").select("paddle_customer_id, paddle_subscription_id").eq("profile_id", user.id).maybeSingle(),
      sb.from("particuliers").select("paddle_customer_id, paddle_subscription_id").eq("profile_id", user.id).maybeSingle(),
    ]);
    const account = biz?.paddle_customer_id ? biz : part;
    const customerId = account?.paddle_customer_id as string | undefined;
    if (!customerId) return json({ error: "no Paddle customer for this account yet" }, 400);

    const body: Record<string, unknown> = {};
    if (account?.paddle_subscription_id) body.subscription_ids = [account.paddle_subscription_id];

    const res = await paddleFetch(`/customers/${customerId}/portal-sessions`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    // General overview link, or the subscription-specific deep link if we have one.
    const sub = res.data?.urls?.subscriptions?.[0];
    const url = sub?.update_subscription_payment_method || sub?.cancel_subscription || res.data?.urls?.general?.overview;
    if (!url) return json({ error: "Paddle did not return a portal URL" }, 500);

    return json({ url });
  } catch (e) {
    console.error("create-portal error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
