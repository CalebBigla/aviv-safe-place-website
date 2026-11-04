import { clientAddress } from "./request.server";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Stops bots holding every available time. Off until TURNSTILE_SECRET_KEY is set; once it is set,
// a missing token or an unreachable verifier refuses the request rather than letting it through.
export async function passesBotCheck(token: string | undefined) {
  const secret = process.env["TURNSTILE_SECRET_KEY"]?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: clientAddress() || undefined }),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    console.error("[aviv-turnstile] verification unavailable");
    return false;
  }
}
