// POST /functions/v1/paddle-webhook   (called by Paddle, not the browser)
//
// The ONLY place that changes an account's plan / subscription status.
// Verifies the Paddle-Signature header, then reconciles the account row.
//
// Deploy WITHOUT JWT verification (Paddle has no Supabase JWT):
//   supabase functions deploy paddle-webhook --no-verify-jwt
//
// Secrets required:
//   PADDLE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Signature format: header "Paddle-Signature: ts=<unix-seconds>;h1=<hex hmac-sha256>"
// where h1 = HMAC-SHA256(secret, `${ts}:${rawBody}`).
// https://developer.paddle.com/webhooks/about/signature-verification

import { adminClient } from "../_shared/clients.ts";

const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;
const MAX_CLOCK_SKEW_SECONDS = 5;

async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(";").map((kv) => kv.split("=") as [string, string]),
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  // Reject stale/replayed signatures.
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > MAX_CLOCK_SKEW_SECONDS) {
    console.error("paddle-webhook: signature timestamp outside tolerance", { ts, skew });
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  const computed = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison.
  if (computed.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

// Map a Paddle price id (main or alt) back to a plans.id (cached for the fn lifetime).
let priceToPlan: Record<string, string> | null = null;
async function planForPrice(sb: ReturnType<typeof adminClient>, priceId: string): Promise<string | null> {
  if (!priceToPlan) {
    const { data } = await sb.from("plans").select("id, paddle_price_id, paddle_price_alt_id");
    priceToPlan = {};
    for (const p of data ?? []) {
      if (p.paddle_price_id) priceToPlan[p.paddle_price_id] = p.id;
      if (p.paddle_price_alt_id) priceToPlan[p.paddle_price_alt_id] = p.id;
    }
  }
  return priceToPlan[priceId] ?? null;
}

async function applySubscription(sb: ReturnType<typeof adminClient>, sub: any) {
  const cd = sub.custom_data ?? {};
  const table = cd.account_table === "particuliers" ? "particuliers" : "businesses";
  const priceId = sub.items?.[0]?.price?.id ?? "";
  const planId = (await planForPrice(sb, priceId)) ?? cd.plan_id ?? null;

  const patch: Record<string, unknown> = {
    paddle_customer_id: sub.customer_id,
    paddle_subscription_id: sub.id,
    paddle_subscription_status: sub.status, // active | trialing | past_due | paused | canceled
    paddle_cancel_at_period_end: sub.scheduled_change?.action === "cancel",
  };
  // Only move the plan while the subscription is actually paying.
  if (planId && (sub.status === "active" || sub.status === "trialing")) {
    patch.plan = planId;
  }

  const q = sb.from(table).update(patch);
  if (cd.account_id) await q.eq("id", cd.account_id);
  else await q.eq("paddle_customer_id", sub.customer_id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const rawBody = await req.text();
  const sig = req.headers.get("paddle-signature");
  if (!(await verifySignature(rawBody, sig))) {
    console.error("paddle-webhook: bad signature");
    return new Response("bad signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const sb = adminClient();

  try {
    switch (event.event_type) {
      // Paiement unique CPS (400 MAD / $40) → +1 crédit CPS sur le compte.
      case "transaction.completed": {
        const txn = event.data;
        const cd = txn.custom_data ?? {};
        if (cd.kind === "cps") {
          const ownerType = cd.account_table === "businesses" ? "business" : "particulier";
          const ownerId = cd.account_id;
          if (ownerId) {
            const { error } = await sb.rpc("grant_cps_credit", {
              p_owner_type: ownerType, p_owner_id: ownerId, p_n: 1,
            });
            if (error) console.error("grant_cps_credit failed", error);
          }
        }
        break;
      }
      case "subscription.created":
      case "subscription.updated":
      case "subscription.activated":
      case "subscription.canceled":
      case "subscription.paused":
      case "subscription.resumed": {
        await applySubscription(sb, event.data);
        break;
      }
      default:
        // Ignored, but acknowledged so Paddle stops retrying.
        break;
    }
  } catch (e) {
    console.error(`handler error for ${event.event_type}`, e);
    return new Response("handler error", { status: 500 }); // Paddle will retry
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
