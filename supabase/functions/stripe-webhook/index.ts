// POST /functions/v1/stripe-webhook   (called by Stripe, not the browser)
//
// The ONLY place that changes an account's plan / subscription status.
// Verifies the Stripe signature, then reconciles the account row.
//
// Deploy WITHOUT JWT verification (Stripe has no Supabase JWT):
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Secrets required:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { stripeClient, adminClient } from "../_shared/clients.ts";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Map a Stripe price id (main or alt) back to a plans.id (cached for the fn lifetime).
let priceToPlan: Record<string, string> | null = null;
async function planForPrice(sb: ReturnType<typeof adminClient>, priceId: string): Promise<string | null> {
  if (!priceToPlan) {
    const { data } = await sb.from("plans").select("id, stripe_price_id, stripe_price_alt_id");
    priceToPlan = {};
    for (const p of data ?? []) {
      if (p.stripe_price_id) priceToPlan[p.stripe_price_id] = p.id;
      if (p.stripe_price_alt_id) priceToPlan[p.stripe_price_alt_id] = p.id;
    }
  }
  return priceToPlan[priceId] ?? null;
}

async function applySubscription(
  sb: ReturnType<typeof adminClient>,
  sub: Stripe.Subscription,
) {
  const md = sub.metadata ?? {};
  const table = md.account_table === "particuliers" ? "particuliers" : "businesses";
  const priceId = sub.items.data[0]?.price?.id ?? "";
  const planId = (await planForPrice(sb, priceId)) ?? md.plan_id ?? null;

  const patch: Record<string, unknown> = {
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    stripe_subscription_status: sub.status, // active | trialing | past_due | canceled | unpaid ...
    stripe_cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };
  // Only move the plan while the subscription is actually paying.
  if (planId && (sub.status === "active" || sub.status === "trialing")) {
    patch.plan = planId;
  }

  // Prefer the account id from metadata; fall back to matching the customer.
  const q = sb.from(table).update(patch);
  if (md.account_id) await q.eq("id", md.account_id);
  else await q.eq("stripe_customer_id", sub.customer as string);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const body = await req.text();
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (e) {
    console.error("signature verification failed", e);
    return new Response("bad signature", { status: 400 });
  }

  const sb = adminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        // Paiement unique CPS (400 MAD) → +1 crédit CPS sur le compte.
        // "no_payment_required" = total 0 (coupon -100 %) : on crédite quand même.
        if (
          s.mode === "payment" && s.metadata?.kind === "cps" &&
          (s.payment_status === "paid" || s.payment_status === "no_payment_required")
        ) {
          const ownerType = s.metadata.account_table === "businesses" ? "business" : "particulier";
          const ownerId = s.metadata.account_id;
          if (ownerId) {
            const { error } = await sb.rpc("grant_cps_credit", {
              p_owner_type: ownerType, p_owner_id: ownerId, p_n: 1,
            });
            if (error) console.error("grant_cps_credit failed", error);
          }
          break;
        }
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          // Carry Checkout's client_reference_id into the subscription metadata
          // if the session metadata wasn't propagated.
          if (!sub.metadata?.account_id && s.client_reference_id) {
            sub.metadata = { ...sub.metadata, supabase_profile_id: s.client_reference_id };
          }
          await applySubscription(sb, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(sb, event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const status = event.type === "invoice.paid" ? "active" : "past_due";
        if (inv.customer) {
          for (const table of ["businesses", "particuliers"]) {
            await sb.from(table)
              .update({ stripe_subscription_status: status })
              .eq("stripe_customer_id", inv.customer as string);
          }
        }
        break;
      }
      default:
        // Ignored, but acknowledged so Stripe stops retrying.
        break;
    }
  } catch (e) {
    console.error(`handler error for ${event.type}`, e);
    return new Response("handler error", { status: 500 }); // Stripe will retry
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
