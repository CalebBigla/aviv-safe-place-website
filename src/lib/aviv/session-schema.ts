// Browser-safe contract for video sessions. public.aviv_session_room is the authority for the
// entry window; these values mirror it for display only and must stay in step with it.
export const SESSION_EARLY_ENTRY_MINUTES = 15;
export const SESSION_LATE_EXIT_MINUTES = 15;

export function sessionWindow(start: string, end: string) {
  return {
    opensAt: new Date(Date.parse(start) - SESSION_EARLY_ENTRY_MINUTES * 60000),
    closesAt: new Date(Date.parse(end) + SESSION_LATE_EXIT_MINUTES * 60000),
  };
}

export interface SessionJoin {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  // Per-room media encryption key, derived on our server. The SDK also shares it with Agora, so this
  // protects media in transit but is not end-to-end encryption. Salt is hex encoded.
  secret: string;
  salt: string;
}

export interface SessionDetails {
  service: string;
  start: string;
  end: string;
}

export type SessionAccess =
  | { status: "ready"; session: SessionDetails; join: SessionJoin }
  | { status: "early"; opensAt: string }
  | { status: "ended" | "unavailable" | "rate_limited" | "infrastructure" | "not_configured" };

export type SessionLinkResult =
  | { status: "issued"; token: string }
  | { status: "early"; opensAt: string }
  | { status: "ended" | "unavailable" | "rate_limited" | "infrastructure" | "not_configured" };
