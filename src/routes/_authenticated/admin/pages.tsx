import { createFileRoute } from '@tanstack/react-router';
import { AdminView } from '@/components/aviv-admin';
import { pageHead } from '@/lib/aviv/metadata';
export const Route=createFileRoute('/_authenticated/admin/pages')({head:()=>pageHead('Manage pages','Edit AVIV pages, policies and FAQs.','/admin/pages',true),component:()=> <AdminView section="pages"/>});