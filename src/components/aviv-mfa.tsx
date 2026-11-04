import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const CODE_FORMAT = /^\d{6}$/;

export type TwoFactorStep = "enroll" | "challenge";

// Works out what this signed-in person needs next: null means the session is already two-factor.
export async function twoFactorStep(): Promise<TwoFactorStep | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "challenge";
  if (data.currentLevel === "aal2") return null;
  return data.nextLevel === "aal2" ? "challenge" : "enroll";
}

// Asks for an authenticator code, first setting the authenticator up if this is a first sign-in.
export function TwoFactor({ step, onVerified }: { step: TwoFactorStep; onVerified: () => void }) {
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const factors = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factors.error) {
        setNotice("Two-factor sign-in could not start. Please refresh and try again.");
        return;
      }
      if (step === "challenge") {
        const factor = factors.data.totp[0];
        if (factor) setFactorId(factor.id);
        else setNotice("No authenticator was found for this account. Please contact AVIV.");
        return;
      }
      // An abandoned setup leaves an unverified factor behind, which would block a new one.
      await Promise.all(
        factors.data.all
          .filter((factor) => factor.status === "unverified")
          .map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })),
      );
      const enrolled = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "AVIV administration",
      });
      if (!active) return;
      if (enrolled.error) {
        setNotice("Two-factor setup could not start. Please refresh and try again.");
        return;
      }
      setFactorId(enrolled.data.id);
      setQrCode(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
    })();
    return () => {
      active = false;
    };
  }, [step]);

  return (
    <div>
      <h1 className="text-3xl mt-4 mb-4">
        {step === "enroll" ? "Protect your account." : "Enter your code."}
      </h1>
      {step === "enroll" ? (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            Administration holds private client details, so it needs a second step at sign-in. Scan
            this code with an authenticator app such as Google Authenticator or Microsoft
            Authenticator.
          </p>
          {qrCode && (
            <img src={qrCode} alt="Authenticator setup QR code" width={180} height={180} />
          )}
          {secret && (
            <p className="text-xs text-muted-foreground mt-3 break-all">
              Can't scan it? Enter this key in your app: <code>{secret}</code>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed mb-1">
          Open your authenticator app and enter the 6-digit code for AVIV.
        </p>
      )}
      <form
        className="space-y-5 mt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNotice("");
          const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
          setBusy(false);
          if (result.error) {
            setCode("");
            setNotice("That code didn't work. Check your app and try the newest code.");
            return;
          }
          onVerified();
        }}
      >
        <label className="block text-sm space-y-2">
          <span>6-digit code</span>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <Button className="w-full" disabled={busy || !factorId || !CODE_FORMAT.test(code)}>
          {busy ? "Checking…" : "Verify"}
        </Button>
      </form>
      {notice && (
        <p role="alert" className="text-sm mt-5 leading-relaxed text-destructive">
          {notice}
        </p>
      )}
    </div>
  );
}
