import { describe, it, expect } from 'vitest';
import { bookingFilters, bookingActionSchema } from '@/lib/aviv/booking-admin-schema';
describe('Booking administration validation',()=>{
  const action={id:'12345678-1234-4234-8234-123456789abc',action:'confirm',expectedUpdatedAt:'2026-10-13T10:00:00Z'};
  it('defaults filters and rejects invalid pagination or statuses',()=>{
    expect(bookingFilters.parse({})).toEqual({search:'',status:'all',payment:'all',page:1});
    expect(bookingFilters.safeParse({page:0}).success).toBe(false);
    expect(bookingFilters.safeParse({payment:'paid'}).success).toBe(false);
  });
  it('requires timezone-aware scheduling and known actions',()=>{
    expect(bookingActionSchema.safeParse(action).success).toBe(false);
    expect(bookingActionSchema.safeParse({...action,start:'2026-10-16T10:00:00+01:00'}).success).toBe(true);
    expect(bookingActionSchema.safeParse({...action,start:'2026-10-16T10:00:00'}).success).toBe(false);
    expect(bookingActionSchema.safeParse({...action,action:'mark_paid'}).success).toBe(false);
  });
});