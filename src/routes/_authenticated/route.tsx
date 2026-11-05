import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { twoFactorStep } from "@/components/aviv-mfa";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_TWO_FACTOR_REQUIRED } from "@/lib/aviv/admin-policy";
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // The sign-in page asks for the second step, or sets it up on a first sign-in.
    if (ADMIN_TWO_FACTOR_REQUIRED && (await twoFactorStep()))
      throw redirect({ to: "/admin/login" });
  },
  component: Outlet,
});
