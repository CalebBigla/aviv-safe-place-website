import { createFileRoute, useNavigate, type ErrorComponentProps } from '@tanstack/react-router';
import { getAdminIdentity } from '@/lib/aviv/admin.functions';
import { AdminShell } from '@/components/aviv-admin';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

function AdminAccessError({ error }: ErrorComponentProps) {
  const navigate = useNavigate();
  return <div className="min-h-screen grid place-items-center px-6"><div className="max-w-sm text-center space-y-5">
    <h1 className="text-3xl">Access not available</h1>
    <p className="text-muted-foreground">{(error instanceof Error && error.message) || 'Administrator access could not be confirmed.'} Sign in with an authorised administrator account.</p>
    <Button onClick={async () => { await supabase.auth.signOut(); await navigate({ to: '/admin/login', replace: true }); }}>Sign out and switch account</Button>
  </div></div>;
}

export const Route=createFileRoute('/_authenticated/admin')({loader:()=>getAdminIdentity(),component:AdminShell,errorComponent:AdminAccessError});
