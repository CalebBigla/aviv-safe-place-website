import { z } from 'zod';
export const bookingFilters = z.object({
  search: z.string().max(150).default(''),
  status: z.enum(['all','pending','confirmed','cancelled','completed','reschedule_requested']).default('all'),
  payment: z.enum(['all','pending','successful','failed','refunded']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const bookingActionSchema = z.object({
  id: z.string().uuid(), action: z.enum(['review','confirm','propose','cancel','refund_review','complete']),
  expectedUpdatedAt: z.string().datetime({offset:true}),
  start: z.string().datetime({offset:true}).optional(),
}).superRefine((value,ctx)=>{if(['confirm','propose'].includes(value.action) && !value.start)ctx.addIssue({code:'custom',path:['start'],message:'Choose an appointment time.'});});
export type BookingFilters = z.infer<typeof bookingFilters>;