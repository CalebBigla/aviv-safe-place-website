import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getAdminIdentity } from "@/lib/aviv/admin.functions";
import { Wordmark } from "./aviv-site";
import { TwoFactor, twoFactorStep, type TwoFactorStep } from "./aviv-mfa";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaStep, setMfaStep] = useState<TwoFactorStep | null>(null);
  const verify = useServerFn(getAdminIdentity);
  const navigate = useNavigate();
  // Prevents concurrent verification calls from the mount check and the
  // onAuthStateChange listener (which fires after OAuth redirect completion).
  const verifyingRef = useRef(false);

  async function tryForward() {
    if (verifyingRef.current) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    verifyingRef.current = true;
    try {
      const step = await twoFactorStep();
      setMfaStep(step);
      if (step) return;
      await verify();
      await navigate({ to: "/admin", replace: true });
    } catch (err) {
      // Distinguish between CSRF/server errors and genuine role-check failures.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Administrator access has not been authorised")) {
        setNotice("Administrator access has not been authorised for this account.");
        // Sign out the non-admin session so the user can try a different account.
        await supabase.auth.signOut();
      } else if (msg.includes("Please sign in again") || msg.includes("Unauthorized")) {
        setNotice("Your session could not be verified. Please try signing in again.");
        await supabase.auth.signOut();
      } else {
        setNotice("Sign-in could not be completed. Please try again.");
      }
    } finally {
      verifyingRef.current = false;
    }
  }

  useEffect(() => {
    let active = true;

    // Surface OAuth error parameters that Supabase may append to the redirect URL.
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      setNotice(params.get("error_description") || "Sign-in failed.");
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Check for an existing session on mount (covers page refresh / direct visit).
    void tryForward();

    // Listen for SIGNED_IN so the OAuth PKCE code-exchange redirect is handled
    // even when the session was not yet available when the mount check ran.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_IN") void tryForward();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mfaStep)
    return (
      <div className="min-h-screen grid place-items-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Wordmark />
          <div className="eyebrow mt-12">Administration</div>
          <TwoFactor step={mfaStep} onVerified={() => void tryForward()} />
          <Button
            variant="link"
            className="px-0 mt-3"
            onClick={async () => {
              await supabase.auth.signOut();
              setMfaStep(null);
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Wordmark />
        <div className="eyebrow mt-12">Administration</div>
        <h1 className="text-4xl mt-4 mb-8">Welcome back.</h1>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              const result = await supabase.auth.signInWithPassword({ email, password });
              if (result.error) throw new Error("Email or password is incorrect.");
              // onAuthStateChange SIGNED_IN fires after the session is stored and
              // triggers tryForward(), which verifies the admin role and navigates.
              // If it does not fire quickly enough, call tryForward directly.
              await tryForward();
            } catch (err) {
              if (err instanceof Error && err.message === "Email or password is incorrect.") {
                setNotice(err.message);
              }
              // Other errors are handled by tryForward's own catch block.
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm space-y-2">
            <span>Email address</span>
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm space-y-2">
            <span>Password</span>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <Button
          variant="link"
          className="px-0 mt-3"
          onClick={async () => {
            if (!email) {
              setNotice("Enter your email address first.");
              return;
            }
            const result = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            setNotice(
              result.error
                ? "Could not request a reset. Try again later."
                : "If this account exists, a password reset email has been requested.",
            );
          }}
        >
          Forgot password?
        </Button>
        {notice && (
          <p role="alert" className="text-sm mt-5 leading-relaxed text-destructive">
            {notice}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-8 leading-relaxed">
          Access is restricted to authorised administrators.
        </p>
        <Button variant="link" className="px-0 mt-3" asChild>
          <Link to="/">Return to AVIV</Link>
        </Button>
      </div>
    </div>
  );
}
