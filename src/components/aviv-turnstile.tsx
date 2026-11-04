import { useEffect, useRef, useState } from "react";

const siteKey: string | undefined = import.meta.env["VITE_TURNSTILE_SITE_KEY"];
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const botCheckEnabled = Boolean(siteKey);

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<void> | undefined;
function loadScript() {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = undefined;
      reject(new Error("Security check could not load"));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

// Renders nothing until a site key is configured. Tokens are single use, so change
// resetKey after a failed submission to get a fresh one.
export function BotCheck({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!siteKey) return;
    let active = true;
    let widgetId: string | undefined;
    onToken("");
    setFailed(false);
    loadScript()
      .then(() => {
        if (!active || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          theme: "light",
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
    // onToken is a state setter at every call site; only a new resetKey should restart the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  if (!siteKey) return null;
  return (
    <div className="mt-6">
      <div ref={container} />
      {failed && (
        <p role="alert" className="text-destructive text-sm mt-2">
          The security check couldn't load. Please refresh the page and try again.
        </p>
      )}
    </div>
  );
}
