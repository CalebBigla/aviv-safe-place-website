import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getAdminIdentity } from "@/lib/aviv/admin.functions";
import { Wordmark } from "./aviv-site";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const verify = useServerFn(getAdminIdentity);
  const navigate = useNavigate();
  async function check() {
    await verify();
    await navigate({ to: "/admin", replace: true });
  }
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      try {
        await verify();
        if (active) await navigate({ to: "/admin", replace: true });
      } catch {
        if (active) setNotice("Administrator access has not been authorised for this account.");
      }
    });
    return () => {
      active = false;
    };
  }, [verify, navigate]);
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
              await check();
            } catch (err) {
              setNotice(err instanceof Error ? err.message : "Sign-in failed.");
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
          variant="outline"
          className="w-full mt-4"
          onClick={async () => {
            setNotice("");
            try {
              const result = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${window.location.origin}/admin/login` },
              });
              if (result.error) throw result.error;
            } catch (err) {
              setNotice(err instanceof Error ? err.message : "Google sign-in failed.");
            }
          }}
        >
          Continue with Google
        </Button>
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
