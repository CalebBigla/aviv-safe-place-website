import { createFileRoute } from '@tanstack/react-router';
import { BookingTable } from '@/components/aviv-booking-admin';
import { bookingFilters } from '@/lib/aviv/booking-admin-schema';
import { pageHead } from '@/lib/aviv/metadata';
export const Route=createFileRoute('/_authenticated/admin/bookings/')({validateSearch:(input)=>bookingFilters.parse(input),head:()=>pageHead('Manage bookings','Private AVIV appointment records.','/admin/bookings',true),component:Bookings});
function Bookings(){const filters=Route.useSearch();const navigate=Route.useNavigate();return <BookingTable filters={filters} onFilters={next=>void navigate({search:next,replace:true})}/>;}