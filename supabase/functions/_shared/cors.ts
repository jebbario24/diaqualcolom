// Shared CORS headers for the browser-facing functions (create-checkout,
// create-portal). The webhook is called by Stripe server-to-server and does
// not need CORS.
//
// AQUA_APP_ORIGIN is set with:
//   supabase secrets set AQUA_APP_ORIGIN=https://app.aqualc.com
// During local testing it falls back to "*", which is fine because these
// functions still require a valid Supabase JWT (verify_jwt = true).

const ORIGIN = Deno.env.get("AQUA_APP_ORIGIN") ?? "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function preflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
