import { createFileRoute } from '@tanstack/react-router';
import { AdminLogin } from '@/components/aviv-login';
import { pageHead } from '@/lib/aviv/metadata';
export const Route=createFileRoute('/admin/login')({head:()=>pageHead('Administrator sign in','Sign in to AVIV administration.','/admin/login',true),component:AdminLogin});