import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startGuestPayment } from "@/lib/aviv/payment.functions";
import { LAST_BOOKING_KEY, type PaymentStartResult } from "@/lib/aviv/payment-schema";

const startMessages: Record<Exclude<PaymentStartResult["status"], "redirect">, string> = {
  paid: "This booking has already been paid. Please refresh the page.",
  expired: "This hold has ended, so payment can't be taken. Please choose a new time.",
  unavailable: "This booking can't be paid right now. Please refresh the page.",
  rate_limited: "There have been too many attempts. Please wait a few minutes and try again.",
  not_configured: "Online payment isn't available yet. Please contact AVIV.",
  infrastructure: "We couldn't open the payment page. Please try again shortly.",
};

// Sends the guest to Paystack's secure checkout for this booking.
export function PayButton({ token, label }: { token: string; label: string }) {
  const start = useServerFn(startGuestPayment);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  return (
    <div>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailure("");
          try {
            const result = await start({ data: { token } });
            if (result.status === "redirect") {
              try {
                sessionStorage.setItem(LAST_BOOKING_KEY, `/booking/manage/${token}`);
              } catch {
                // Without storage the return page still works; it just can't link back.
              }
              window.location.assign(result.url);
              return;
            }
            setFailure(startMessages[result.status]);
          } catch {
            setFailure(startMessages.infrastructure);
          }
          setBusy(false);
        }}
      >
        {busy ? "Opening secure payment…" : label} <ArrowUpRight />
      </Button>
      {failure && (
        <p role="alert" className="text-destructive text-sm mt-3">
          {failure}
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        You'll pay on Paystack's secure page, then return here.
      </p>
    </div>
  );
}
