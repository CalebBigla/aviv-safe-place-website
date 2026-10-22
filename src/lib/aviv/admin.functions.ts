import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { cmsSchema } from './admin-schema';
import { z } from 'zod';

async function authorise(client: SupabaseClient<Database>, userId: string) {
  const token = getRequest().headers.get('authorization')?.slice(7);
  const user = await client.auth.getUser(token);
  if (user.error || user.data.user?.id !== userId) throw new Error('Please sign in again.');
  const role = await client.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (role.error || !role.data) throw new Error('Administrator access has not been authorised for this account.');
}
export const getAdminIdentity = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await authorise(context.supabase, context.userId);
  const { data } = await context.supabase.from('profiles').select('display_name').eq('id', context.userId).single();
  return { userId: context.userId, displayName: data?.display_name || 'Administrator' };
});
export const getAdminContent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await authorise(context.supabase, context.userId);
  const [services,pages,faqs,settings,media,bookings,contacts,audit,metrics] = await Promise.all([
    context.supabase.from('services').select('*').order('sort_order'),
    context.supabase.from('pages').select('*').order('slug'),
    context.supabase.from('faqs').select('*').order('sort_order'),
    context.supabase.from('public_settings').select('*').order('key'),
    context.supabase.from('media_assets').select('*').order('created_at',{ascending:false}),
    context.supabase.from('bookings').select('*').order('created_at',{ascending:false}).limit(200),
    context.supabase.from('contact_submissions').select('*').order('created_at',{ascending:false}).limit(200),
    context.supabase.from('audit_logs').select('id,action,resource_type,resource_id,created_at').order('created_at',{ascending:false}).limit(50),
    context.supabase.rpc('aviv_booking_metrics'),
  ]);
  if ([services,pages,faqs,settings,media,bookings,contacts,audit,metrics].some(r=>r.error)) throw new Error('Administration could not be loaded.');
  const mediaWithUrls = await Promise.all((media.data ?? []).map(async m=>({ ...m, url: (await context.supabase.storage.from('aviv-media').createSignedUrl(m.storage_path,3600)).data?.signedUrl ?? '' })));
  const counts=metrics.data && typeof metrics.data==='object' && !Array.isArray(metrics.data)?metrics.data:{};
  return { services:services.data??[], pages:pages.data??[], faqs:faqs.data??[], settings:settings.data??[], media:mediaWithUrls, bookings:bookings.data??[], contacts:contacts.data??[], audit:audit.data??[], metrics:{new_requests:Number(counts['new_requests']??0),awaiting_confirmation:Number(counts['awaiting_confirmation']??0),upcoming:Number(counts['upcoming']??0),completed:Number(counts['completed']??0),payment_attention:Number(counts['payment_attention']??0),refund_attention:Number(counts['refund_attention']??0)} };
});
export const saveCms = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>cmsSchema.parse(input)).handler(async ({data,context})=>{
  await authorise(context.supabase,context.userId);
  const {kind,...values} = data;
  let error;
  if(kind==='services' && 'title' in values && 'price_minor' in values) ({error}=await context.supabase.from('services').upsert({...values,id:values.id ?? crypto.randomUUID()}));
  else if(kind==='pages' && 'body' in values) ({error}=await context.supabase.from('pages').upsert({...values,id:values.id ?? crypto.randomUUID()}));
  else if(kind==='faqs' && 'question' in values) ({error}=await context.supabase.from('faqs').upsert({...values,id:values.id ?? crypto.randomUUID()}));
  else if(kind==='public_settings' && 'key' in values) ({error}=await context.supabase.from('public_settings').upsert(values));
  else if(kind==='media_assets' && 'alt_text' in values) ({error}=await context.supabase.from('media_assets').update(values).eq('id',values.id));
  else throw new Error('Invalid content.');
  if(error) throw new Error('Could not save. Check required fields and unique page or service names.');
  return {saved:true};
});
export const reorderCms = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({kind:z.enum(['services','faqs']),id:z.string().uuid(),direction:z.union([z.literal(-1),z.literal(1)])}).parse(input)).handler(async({data,context})=>{
  await authorise(context.supabase,context.userId);
  const result=await context.supabase.rpc('aviv_reorder_content',{_kind:data.kind,_id:data.id,_direction:data.direction});
  if(result.error)throw new Error('Could not reorder content.');
  return {saved:true};
});
export const uploadMedia = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({file:z.string().max(7000000),mime:z.enum(['image/jpeg','image/png','image/webp']),alt:z.string().min(1).max(500)}).parse(input)).handler(async({data,context})=>{
  await authorise(context.supabase,context.userId);
  let binary:Uint8Array;
  try{binary=Uint8Array.from(atob(data.file),c=>c.charCodeAt(0));}catch{throw new Error('Invalid image encoding.');}
  if(binary.length>5242880 || binary.length<12) throw new Error('Choose an image under 5 MB.');
  const jpeg=binary[0]===255 && binary[1]===216 && binary[2]===255;
  const png=binary[0]===137 && binary[1]===80 && binary[2]===78 && binary[3]===71;
  const webp=new TextDecoder().decode(binary.slice(0,4))==='RIFF' && new TextDecoder().decode(binary.slice(8,12))==='WEBP';
  if(!(data.mime==='image/jpeg'&&jpeg || data.mime==='image/png'&&png || data.mime==='image/webp'&&webp)) throw new Error('Invalid image file.');
  const path=`${crypto.randomUUID()}.${data.mime.split('/')[1]}`;
  const upload=await context.supabase.storage.from('aviv-media').upload(path,binary,{contentType:data.mime});
  if(upload.error) throw new Error('Image could not be uploaded.');
  const row=await context.supabase.from('media_assets').insert({storage_path:path,alt_text:data.alt,mime_type:data.mime,file_size:binary.length});
  if(row.error){await context.supabase.storage.from('aviv-media').remove([path]);throw new Error('Image could not be saved.');}
  return {saved:true};
});
export const updateContactStatus = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({id:z.string().uuid(),status:z.enum(['new','read','closed'])}).parse(input)).handler(async({data,context})=>{
  await authorise(context.supabase,context.userId);
  const result=await context.supabase.from('contact_submissions').update({status:data.status}).eq('id',data.id);
  if(result.error) throw new Error('Could not update enquiry.');
  return {saved:true};
});
export const saveAdminName=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({name:z.string().trim().min(1).max(100)}).parse(input)).handler(async({data,context})=>{
  await authorise(context.supabase,context.userId);
  const result=await context.supabase.from('profiles').update({display_name:data.name}).eq('id',context.userId);
  if(result.error) throw new Error('Could not save name.');
  return {saved:true};
});