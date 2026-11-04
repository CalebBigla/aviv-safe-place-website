import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const TWO_FACTOR_REQUIRED = "Two-factor verification is required.";

// Every administrator action re-validates the session with Supabase Auth (honouring
// revocation), the two-factor level and the active admin role, in addition to RLS and
// in-database checks.
export async function requireAdmin(client: SupabaseClient<Database>, userId: string) {
  setResponseHeader("Cache-Control", "no-store");
  const token = getRequest().headers.get("authorization")?.slice(7);
  const user = await client.auth.getUser(token);
  if (user.error || user.data.user?.id !== userId) throw new Error("Please sign in again.");
  const claims = await client.auth.getClaims(token);
  if (claims.data?.claims["aal"] !== "aal2") throw new Error(TWO_FACTOR_REQUIRED);
  const role = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (role.error || !role.data)
    throw new Error("Administrator access has not been authorised for this account.");
}
