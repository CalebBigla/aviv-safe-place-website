import { z } from 'zod';
export const guestBookingSchema=z.object({
  serviceSlug:z.string().min(1).max(100),name:z.string().trim().min(2).max(100),
  email:z.string().trim().email().max(254),phone:z.string().trim().max(30).default(''),
  requestedStart:z.string().datetime({offset:true}),alternativeStart:z.string().datetime({offset:true}).optional(),
  policyAccepted:z.literal(true),website:z.string().max(100).default(''),
}).superRefine((v,c)=>{if(v.alternativeStart===v.requestedStart)c.addIssue({code:'custom',path:['alternativeStart'],message:'Choose a different alternative time.'});});
export const guestTokenSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)});
export function validRequestedTime(value:string,now:number){const time=Date.parse(value);return Number.isFinite(time)&&time>now&&time<=now+180*86400000;}
export type GuestBookingInput=z.infer<typeof guestBookingSchema>;
export interface GuestBookingDetails {reference:string;service:string;price_minor:number;currency:string;requested_start:string|null;alternative_start:string|null;confirmed_start:string|null;confirmed_end:string|null;payment_status:string;booking_status:string;request_expired:boolean;time_zone:string}