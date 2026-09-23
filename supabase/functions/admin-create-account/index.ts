// POST /functions/v1/admin-create-account
// Body: { role: 'business'|'particulier', plan: string, nom: string, ville?: string,
//         email: string, password: string }
//
// Lets the admin create a Business or Particulier account (including the CPS plan,
// which is just a 'particulier' account on the 'cps' plan) directly from the admin
// console, for customers who sign up in person and prefer to pay offline instead of
// through the public signup + Paddle flow.
//
// Only an authenticated admin may call this (checked via the is_admin() RPC, which
// reads the caller's OWN JWT — see _shared/clients.ts:userClient). The account is
// created with the service-role Admin API so the admin's own session is never
// touched: a client-side auth.signUp() would switch the caller's session over to
// the newly created user — the same reason BACKEND.signUp() in index.html signs
// out any stale session before a public signup.
//
// The email is pre-confirmed (email_confirm: true) so the account is usable right
// away. handle_new_user() — the existing DB trigger — fires on the auth.users
// insert exactly as it does for a public signup: it creates the profile row and
// the businesses/particuliers row from user_metadata (role, nom, ville, plan),
// including the 1-day free trial (skipped for the 'cps' plan). No separate logic
// is needed here for that part.
//
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { preflight, json } from "../_shared/cors.ts";
import { userClient, adminClient } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const sb = userClient(req);
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "not authenticated" }, 401);

    const { data: isAdmin, error: adminErr } = await sb.rpc("is_admin");
    if (adminErr || !isAdmin) return json({ error: "not authorized" }, 403);

    const body = await req.json().catch(() => ({}));
    const role = body.role === "business" ? "business" : body.role === "particulier" ? "particulier" : null;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const nom = String(body.nom || "").trim();
    const ville = String(body.ville || "").trim();
    const plan = String(body.plan || "").trim();

    if (!role) return json({ error: "role must be 'business' or 'particulier'" }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid email" }, 400);
    if (!password || password.length < 6) return json({ error: "password must be at least 6 characters" }, 400);
    if (!nom) return json({ error: "nom is required" }, 400);
    if (!plan) return json({ error: "plan is required" }, 400);

    const admin = adminClient();

    // The plan must exist and belong to the requested role (mirrors the check
    // handle_new_user() itself does via `plans where id = v_plan and role = ...`,
    // done here up front so a bad plan id fails with a clear error instead of
    // silently falling back to the trigger's default plan).
    const { data: planRow, error: planErr } = await admin
      .from("plans").select("id").eq("id", plan).eq("role", role).maybeSingle();
    if (planErr) return json({ error: planErr.message }, 500);
    if (!planRow) return json({ error: `unknown plan '${plan}' for role '${role}'` }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, nom, ville, plan },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    return json({ ok: true, id: created.user?.id });
  } catch (e) {
    console.error("admin-create-account error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
