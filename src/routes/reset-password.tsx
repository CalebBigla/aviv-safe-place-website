import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TwoFactor, twoFactorStep } from "@/components/aviv-mfa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/reset-password")({
  head: () =>
    pageHead("Reset password", "Set a new AVIV administrator password.", "/reset-password", true),
  component: ResetPassword,
});
function ResetPassword() {
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // Supabase requires the second step before an account with two-factor can change its password.
  const [needsCode, setNeedsCode] = useState(false);
  useEffect(() => {
    if (!recovery) return;
    void twoFactorStep().then((step) => setNeedsCode(step === "challenge"));
  }, [recovery]);
  useEffect(() => {
    // Detect recovery / invite type from both the URL hash (implicit flow) and
    // the URL search params (PKCE flow), then fall back to the onAuthStateChange
    // PASSWORD_RECOVERY event which fires once the client exchanges the code.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);
    const type = hashParams.get("type") || searchParams.get("type");
    if (type === "recovery" || type === "invite") setRecovery(true);

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <section className="site-wrap section max-w-xl">
      <h1 className="text-4xl mb-7">Set your password</h1>
      {done ? (
        <div className="space-y-5">
          <p role="status">Your password has been updated.</p>
          <Button asChild>
            <Link to="/admin/login">Continue to sign in</Link>
          </Button>
        </div>
      ) : recovery && needsCode ? (
        <TwoFactor step="challenge" onVerified={() => setNeedsCode(false)} />
      ) : recovery ? (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await supabase.auth.updateUser({ password });
            if (result.error) {
              setNotice("Could not update your password. Request a new recovery link.");
              setBusy(false);
            } else {
              // Clear the recovery session so the user signs in fresh with the new password.
              await supabase.auth.signOut();
              setNotice("");
              setDone(true);
              setBusy(false);
            }
          }}
        >
          <label className="block">
            New password
            <Input
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button disabled={busy}>Save new password</Button>
        </form>
      ) : (
        <p>This page requires a valid invitation or password recovery link.</p>
      )}
      {notice && (
        <p role="status" className="my-5">
          {notice}
        </p>
      )}
      {!done && (
        <Button variant="link" asChild>
          <Link to="/admin/login">Back to sign in</Link>
        </Button>
      )}
    </section>
  );
}
