import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accessFromRoom, agoraConfig, SESSION_UIDS } from "./agora.server";
import { requireAdmin } from "./admin-auth.server";
import { guestTokenSchema } from "./guest-booking-schema";
import { clientKey, randomToken, serviceClient, sha256Hex } from "./request.server";
import type { SessionAccess, SessionLinkResult } from "./session-schema";

// Exchanges the guest's manage link for a separate session link while the room is open.
export const issueGuestSessionLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => guestTokenSchema.parse(input))
  .handler(async ({ data }): Promise<SessionLinkResult> => {
    setResponseHeader("Cache-Control", "no-store");
    if (!agoraConfig()) return { status: "not_configured" };
    let db;
    try {
      db = await serviceClient();
    } catch {
      return { status: "infrastructure" };
    }
    const token = randomToken();
    const result = await db.rpc("aviv_issue_session_link", {
      _manage_hash: await sha256Hex(data.token),
      _session_hash: await sha256Hex(token),
      _client_key: await clientKey(),
    });
    if (result.error) {
      console.error("[aviv-session] link issue failed", result.error.code);
      return { status: "infrastructure" };
    }
    const room = result.data;
    if (!room || typeof room !== "object" || Array.isArray(room))
      return { status: "infrastructure" };
    switch (room["state"]) {
      case "open":
        return { status: "issued", token };
      case "early":
        return { status: "early", opensAt: String(room["opens_at"]) };
      case "ended":
        return { status: "ended" };
      case "rate_limited":
        return { status: "rate_limited" };
      default:
        return { status: "unavailable" };
    }
  });

// Entry and token renewal for the guest's session link.
export const getGuestSessionAccess = createServerFn({ method: "POST" })
  .validator((input: unknown) => guestTokenSchema.parse(input))
  .handler(async ({ data }): Promise<SessionAccess> => {
    setResponseHeader("Cache-Control", "no-store");
    const config = agoraConfig();
    if (!config) return { status: "not_configured" };
    let db;
    try {
      db = await serviceClient();
    } catch {
      return { status: "infrastructure" };
    }
    const result = await db.rpc("aviv_read_session_access", {
      _hash: await sha256Hex(data.token),
      _client_key: await clientKey(),
    });
    if (result.error) {
      console.error("[aviv-session] access check failed", result.error.code);
      return { status: "infrastructure" };
    }
    return accessFromRoom(config, result.data, SESSION_UIDS.client);
  });

// Entry and token renewal for an administrator. Identity and role are revalidated on every call.
export const getAdminSessionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SessionAccess> => {
    await requireAdmin(context.supabase, context.userId);
    const config = agoraConfig();
    if (!config) return { status: "not_configured" };
    const result = await context.supabase.rpc("aviv_admin_session_access", { _id: data.id });
    if (result.error) {
      console.error("[aviv-session] administrator access failed", result.error.code);
      return { status: "infrastructure" };
    }
    return accessFromRoom(config, result.data, SESSION_UIDS.counsellor);
  });
