import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const type = new URLSearchParams(window.location.hash.slice(1)).get("type");
    setRecovery(type === "recovery" || type === "invite");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <section className="site-wrap section max-w-xl">
      <h1 className="text-4xl mb-7">Set your password</h1>
      {recovery ? (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await supabase.auth.updateUser({ password });
            setNotice(
              result.error
                ? "Could not update your password. Request a new recovery link."
                : "Password updated.",
            );
            setBusy(false);
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
      <Button variant="link" asChild>
        <Link to="/admin/login">Back to sign in</Link>
      </Button>
    </section>
  );
}
