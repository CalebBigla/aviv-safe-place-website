import type { SessionAccess, SessionJoin } from "./session-schema";

// Tokens are bound to one of two fixed uids, so a room can only ever hold one counsellor and
// one client: a second device using the same seat replaces the first instead of listening in.
export const SESSION_UIDS = { counsellor: 1, client: 2 } as const;

// Each token is short-lived and renewal re-checks the booking, so cancelling or moving an
// appointment removes people from the room within this time even if they stay connected.
export const TOKEN_LIFETIME_SECONDS = 15 * 60;

const appIdFormat = /^[a-f0-9]{32}$/i;

export function agoraConfig() {
  const appId = process.env["AGORA_APP_ID"]?.trim();
  const certificate = process.env["AGORA_APP_CERTIFICATE"]?.trim();
  return appId && certificate && appIdFormat.test(appId) && appIdFormat.test(certificate)
    ? { appId, certificate }
    : null;
}

// Tokens end with the room, with a small floor so a late joiner's connection isn't refused outright.
export function tokenLifetime(closesAt: string, now = Date.now()) {
  const remaining = Math.ceil((Date.parse(closesAt) - now) / 1000);
  return Math.max(30, Math.min(TOKEN_LIFETIME_SECONDS, remaining));
}

// Both participants derive the same per-room key. It is not stored and never leaves this server
// except to an authorised participant; the label keeps it separate from the certificate's other uses.
export async function deriveMediaKey(certificate: string, channel: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(certificate),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derive = async (label: string) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${label}:${channel}`)),
      ),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  return {
    secret: await derive("aviv-media-secret"),
    salt: await derive("aviv-media-salt"),
  };
}

export async function buildJoin(
  config: { appId: string; certificate: string },
  channel: string,
  uid: number,
  closesAt: string,
): Promise<SessionJoin> {
  const { RtcRole, RtcTokenBuilder } = await import("agora-token");
  const lifetime = tokenLifetime(closesAt);
  return {
    appId: config.appId,
    channel,
    uid,
    token: RtcTokenBuilder.buildTokenWithUid(
      config.appId,
      config.certificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      lifetime,
      lifetime,
    ),
    ...(await deriveMediaKey(config.certificate, channel)),
  };
}

// Turns a database room decision into what the participant may receive.
export async function accessFromRoom(
  config: { appId: string; certificate: string },
  room: unknown,
  uid: number,
): Promise<SessionAccess> {
  if (!room || typeof room !== "object" || Array.isArray(room)) return { status: "infrastructure" };
  const r = room as Record<string, unknown>;
  switch (r["state"]) {
    case "open":
      return {
        status: "ready",
        session: {
          service: String(r["service"]),
          start: String(r["start"]),
          end: String(r["end"]),
        },
        join: await buildJoin(config, String(r["room"]), uid, String(r["closes_at"])),
      };
    case "early":
      return { status: "early", opensAt: String(r["opens_at"]) };
    case "ended":
      return { status: "ended" };
    case "rate_limited":
      return { status: "rate_limited" };
    default:
      return { status: "unavailable" };
  }
}
