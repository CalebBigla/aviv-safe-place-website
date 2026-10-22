import { createServerFn } from '@tanstack/react-start';
import { guestBookingSchema,guestTokenSchema,validRequestedTime,type GuestBookingDetails } from './guest-booking-schema';
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');
export const getGuestBookingAvailability=createServerFn({method:'GET'}).handler(async()=>({acceptingBookings:false,message:'Online checkout is not open yet. You can review session options without creating an account.'}));
export const submitGuestBooking=createServerFn({method:'POST'}).inputValidator((input:unknown)=>guestBookingSchema.parse(input)).handler(async({data})=>{
  if(data.website||!validRequestedTime(data.requestedStart,Date.now())||(data.alternativeStart&&!validRequestedTime(data.alternativeStart,Date.now())))return {created:false,message:'Choose a future preferred and alternative time within the next 180 days.'};
  // Fail closed until the verified Paystack initiation workflow is connected in Phase 5.
  // No personal details or abandoned request are retained while checkout is unavailable.
  return {created:false,message:'Online checkout is not open yet. Your details have not been saved and no payment or appointment has been created.'};
});
export const readGuestBooking=createServerFn({method:'POST'}).inputValidator((input:unknown)=>guestTokenSchema.parse(input)).handler(async({data}):Promise<{booking:GuestBookingDetails|null}>=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const digest=await hash(data.token);
  const limit=await supabaseAdmin.rpc('consume_contact_limit',{bucket:`guest-read:${digest}`});
  if(limit.error||!limit.data)return {booking:null};
  const result=await supabaseAdmin.rpc('aviv_read_guest_booking',{_hash:digest});
  if(result.error||!result.data||typeof result.data!=='object'||Array.isArray(result.data))return {booking:null};
  const b=result.data;
  return {booking:{reference:String(b['reference']),service:String(b['service']),price_minor:Number(b['price_minor']),currency:String(b['currency']),requested_start:typeof b['requested_start']==='string'?b['requested_start']:null,alternative_start:typeof b['alternative_start']==='string'?b['alternative_start']:null,confirmed_start:typeof b['confirmed_start']==='string'?b['confirmed_start']:null,confirmed_end:typeof b['confirmed_end']==='string'?b['confirmed_end']:null,payment_status:String(b['payment_status']),booking_status:String(b['booking_status']),request_expired:b['request_expired']===true,time_zone:String(b['time_zone'])}};
});