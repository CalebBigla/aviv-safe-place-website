import { createFileRoute } from "@tanstack/react-router";
import { Unavailable } from "@/components/aviv-site";
import { pageHead } from "@/lib/aviv/metadata";
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { readGuestBooking } from '@/lib/aviv/guest-booking.functions';
import { guestTokenSchema } from '@/lib/aviv/guest-booking-schema';
import { Skeleton } from '@/components/ui/skeleton';
export const Route = createFileRoute("/booking/manage/$token")({
  head: () =>
    pageHead(
      "Your booking",
      "Secure guest booking status at AVIV Safe Place.",
      "",
      true,
    ),
  component: Entry,
});
function Entry() {
  const {token}=Route.useParams();const read=useServerFn(readGuestBooking);const valid=guestTokenSchema.safeParse({token}).success;
  const {data,isPending}=useQuery({queryKey:['aviv-guest-booking',token],queryFn:()=>read({data:{token}}),enabled:valid,retry:false,gcTime:0,staleTime:30000,refetchOnWindowFocus:false});
  if(valid&&isPending)return <section className="site-wrap section" role="status" aria-label="Loading booking"><Skeleton className="h-12 w-60"/><Skeleton className="h-32 mt-8"/></section>;
  const b=data?.booking;if(!b)return <Unavailable title="Booking link unavailable" description="This link is invalid, expired, revoked or temporarily unavailable. No private booking information is shown."/>;
  const time=(value:string|null)=>value?new Date(value).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}):'Not confirmed';
  return <section className="site-wrap section max-w-2xl"><div className="eyebrow">Your booking · No account needed</div><h1 className="text-4xl mt-4 mb-8">{b.reference}</h1><dl className="space-y-5 border-y py-6">{[['Session',b.service],['Price',new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(b.price_minor/100)],['Payment',b.payment_status],['Appointment',b.booking_status],['Preferred time',time(b.requested_start)],['Confirmed time',time(b.confirmed_start)]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2">{value}</dd></div>)}</dl><p className="mt-6 text-sm">All times are Africa/Lagos (UTC+1). Payment does not confirm an appointment.</p>{b.request_expired&&b.payment_status!=='successful'&&<p role="status" className="mt-4">This pending request has expired. Any late payment requires review by AVIV.</p>}</section>;
}
