// Shared helpers: build a Stripe client and a request-scoped Supabase client.
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function stripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// Suffixe aléatoire pour l'étiquette de tracking des sessions Checkout.
export function integrationLabel(base: string): string {
  const s = Array.from({ length: 8 }, () =>
    "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
  return `${base}-${s}`;
}

// Client that acts AS THE CALLING USER (respects RLS). Use for reads/writes
// that should be scoped to whoever holds the JWT in the Authorization header.
export function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
}

// Client that bypasses RLS (service role). Use ONLY inside the webhook, where
// there is no user session and we must update any account from a Stripe event.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
