import {describe,it,expect} from 'vitest';
import {guestBookingSchema,guestTokenSchema,validRequestedTime} from '@/lib/aviv/guest-booking-schema';
describe('Guest booking preparation',()=>{
 const base={serviceSlug:'approved',name:'Guest Client',email:'guest@example.com',requestedStart:'2027-01-10T10:00:00+01:00',policyAccepted:true};
 it('requires valid email and explicit policy acknowledgement',()=>{expect(guestBookingSchema.safeParse(base).success).toBe(true);expect(guestBookingSchema.safeParse({...base,email:'invalid'}).success).toBe(false);expect(guestBookingSchema.safeParse({...base,policyAccepted:false}).success).toBe(false);});
 it('rejects identical alternatives and non-timezone dates',()=>{expect(guestBookingSchema.safeParse({...base,alternativeStart:base.requestedStart}).success).toBe(false);expect(guestBookingSchema.safeParse({...base,requestedStart:'2027-01-10T10:00'}).success).toBe(false);});
 it('bounds requested times and excludes predictable access references',()=>{const now=Date.parse('2026-10-13T21:00:00Z');expect(validRequestedTime(base.requestedStart,now)).toBe(true);expect(validRequestedTime('2026-10-12T10:00:00Z',now)).toBe(false);expect(validRequestedTime('2028-01-01T10:00:00Z',now)).toBe(false);expect(guestTokenSchema.safeParse({token:'AVIV-123'}).success).toBe(false);});
});