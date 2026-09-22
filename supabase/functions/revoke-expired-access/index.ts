import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Revoke expired manual access for particuliers (clients)
// This function is called by a scheduled cron job to auto-revoke expired access
export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    try {
      const now = new Date().toISOString();

      // Get all particuliers with expired manual access
      const { data: expired, error: fetchError } = await ctx.supabaseAdmin
        .from("particuliers")
        .select("id, business_id, email, has_manual_access, manuel_access_expires_at")
        .eq("has_manual_access", true)
        .lt("manuel_access_expires_at", now);

      if (fetchError) {
        console.error("Fetch error:", fetchError);
        return Response.json(
          { error: "Failed to fetch expired access records", details: fetchError },
          { status: 500 }
        );
      }

      if (!expired || expired.length === 0) {
        console.log("No expired access records found");
        return Response.json(
          { success: true, revoked: 0, timestamp: now },
          { status: 200 }
        );
      }

      console.log(`Found ${expired.length} expired access records to revoke`);

      // Revoke expired access
      const { error: revokeError, count } = await ctx.supabaseAdmin
        .from("particuliers")
        .update({
          has_manual_access: false,
          manuel_access_expires_at: null,
        })
        .eq("has_manual_access", true)
        .lt("manuel_access_expires_at", now);

      if (revokeError) {
        console.error("Revoke error:", revokeError);
        return Response.json(
          { error: "Failed to revoke access", details: revokeError },
          { status: 500 }
        );
      }

      // Log the revocation event
      const revokedIds = expired.map((e) => e.id);
      console.log(`Successfully revoked access for: ${revokedIds.join(", ")}`);

      return Response.json(
        {
          success: true,
          revoked: expired.length,
          revokedIds,
          timestamp: now,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Unexpected error:", error);
      return Response.json(
        { error: "Internal server error", details: error.message },
        { status: 500 }
      );
    }
  }),
};

/* To invoke locally:

  1. Run `supabase start`
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/revoke-expired-access' \
    --header 'Authorization: Bearer YOUR_ANON_KEY'

  Or with secret auth:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/revoke-expired-access' \
    --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY'
*/
