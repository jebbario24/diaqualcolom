// Shared helpers: call the Paddle REST API and build request-scoped Supabase clients.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// PADDLE_ENVIRONMENT = "sandbox" | "production" (defaults to sandbox so a
// missing/misconfigured secret fails safe into test mode, not live billing).
function paddleApiBase(): string {
  const env = (Deno.env.get("PADDLE_ENVIRONMENT") ?? "sandbox").toLowerCase();
  return env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

// Thin wrapper around the Paddle REST API (https://developer.paddle.com/api-reference).
// Throws on a non-2xx response so callers don't have to check `error` by hand.
export async function paddleFetch(path: string, init: RequestInit = {}): Promise<any> {
  const key = Deno.env.get("PADDLE_API_KEY");
  if (!key) throw new Error("PADDLE_API_KEY is not configured");
  const res = await fetch(`${paddleApiBase()}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Paddle API ${path} -> ${res.status}: ${body ? JSON.stringify(body) : res.statusText}`);
  }
  return body;
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
// there is no user session and we must update any account from a Paddle event.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
