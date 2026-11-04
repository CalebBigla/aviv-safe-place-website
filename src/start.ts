import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { securityHeaders } from "@/lib/aviv/security-headers";

const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const headers = securityHeaders(new URL(request.url).pathname, import.meta.env.PROD);
  const result = await next();
  // The error handler below returns a bare Response rather than a middleware result.
  const response = result instanceof Response ? result : result.response;
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  // In development the Nitro cloudflare-dev emulation may not forward
  // Sec-Fetch-Site / Origin headers, which would cause a false 403. Allow
  // requests without origin headers in non-production environments; cross-site
  // requests that DO carry origin headers are still rejected.
  allowRequestsWithoutOriginCheck: process.env["NODE_ENV"] !== "production",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware],
}));
