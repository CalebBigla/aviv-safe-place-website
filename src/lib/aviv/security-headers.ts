// Agora's SDK reaches several of its own domains, listed in its firewall documentation, on assigned
// ports such as 4709, so the port must be a wildcard too. Media itself travels over WebRTC, which
// connect-src does not govern.
const AGORA_DOMAINS = ["*.agora.io", "*.sd-rtn.com", "*.rtnsvc.com", "*.rtesvc.com"];
const TURNSTILE = "https://challenges.cloudflare.com";

// 'unsafe-inline' scripts are required by the framework's inline hydration data. The policy still
// stops scripts loading from any other site and stops the site being embedded in a frame.
export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${TURNSTILE}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${AGORA_DOMAINS.flatMap(
    (domain) => [`https://${domain}:*`, `wss://${domain}:*`],
  ).join(" ")}`,
  "worker-src 'self' blob:",
  `frame-src ${TURNSTILE}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Pages whose address is a private link or that show private details are never stored by a
// browser or shared cache.
const PRIVATE_PATHS = /^\/(admin|auth|reset-password|session|booking)(\/|$)/;

export function securityHeaders(pathname: string, production: boolean) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
    ...(PRIVATE_PATHS.test(pathname) ? { "Cache-Control": "no-store" } : {}),
    // The Vite dev server needs inline modules and its own socket, and local development has no HTTPS.
    ...(production
      ? {
          "Content-Security-Policy": contentSecurityPolicy,
          "Strict-Transport-Security": "max-age=31536000",
        }
      : {}),
  };
}
