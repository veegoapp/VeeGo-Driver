import type {
  ShuttleLine,
  ShuttleStop,
  BoardingPassenger,
  ShuttleBooking,
  ShuttleRoute,
} from '@/lib/shuttleContext';

// ── Mock line ──────────────────────────────────────────────────────────────────
// tripId is intentionally undefined: the trip-active screen guards every API
// call with `if (!tripId || ...) return`, so leaving it undefined prevents any
// real network request from firing during the demo.
export const DEMO_LINE: ShuttleLine = {
  id: 'demo-line-1',
  tripId: undefined,
  lineNumber: 'D1',
  name: 'Airport Express',
  from: 'Central Station',
  to: 'King Abdulaziz Airport',
  departure: '08:00',
  arrival: '09:15',
  status: 'in-progress',
  passengers: 5,
  capacity: 12,
  bookedSeats: 5,
  totalSeats: 12,
  vehicleType: 'HiAce',
  assigned: true,
  stationCount: 3,
  estimatedDuration: 75,
  basePrice: 85,
};

// ── Mock booking (shown on shuttle home screen) ────────────────────────────────
export const DEMO_BOOKING: ShuttleBooking = {
  id: 'demo-booking-1',
  routeId: 'demo-route-1',
  routeName: 'Airport Express',
  timeSlotId: 'demo-slot-1',
  departureTime: '08:00',
  weekStart: new Date().toISOString().slice(0, 10),
  status: 'booked',
};

// ── Mock route (shown on lines screen) ────────────────────────────────────────
export const DEMO_ROUTE: ShuttleRoute = {
  id: 'demo-route-1',
  name: 'Airport Express',
  from: 'Central Station',
  to: 'King Abdulaziz Airport',
  stationCount: 3,
  estimatedDuration: 75,
  basePrice: 85,
  timeslots: [
    {
      id: 'demo-slot-1',
      departureTime: '08:00',
      availableSeats: 1,
      totalSeats: 12,
      isBooked: true,
      isTaken: false,
    },
  ],
};

// ── Stop templates ─────────────────────────────────────────────────────────────
// `status`, `boarded`, and `expected` are computed dynamically in DemoShuttleProvider
// to match the exact same derivation logic as the real ShuttleProvider.
export const DEMO_STOPS_TEMPLATE: Omit<ShuttleStop, 'status' | 'boarded' | 'expected'>[] = [
  {
    id: 'demo-stop-0',
    name: 'Central Station',
    address: 'Al-Hamra, Jeddah',
    eta: '08:00',
  },
  {
    id: 'demo-stop-1',
    name: 'Business District',
    address: 'Al-Andalus, Jeddah',
    eta: '08:25',
  },
  {
    id: 'demo-stop-2',
    name: 'King Abdulaziz Airport',
    address: 'North Jeddah',
    eta: '09:15',
  },
];

// ── Passengers per stop index ──────────────────────────────────────────────────
// `checkedIn` is managed dynamically by the demo reducer — not stored here.
export const DEMO_PASSENGERS_TEMPLATE: Record<
  number,
  Omit<BoardingPassenger, 'checkedIn'>[]
> = {
  0: [
    {
      id: 'p1',
      name: 'Ahmed Al-Rashid',
      avatar: '',
      phone: '+966 50 123 4567',
      ticket: 'TK001',
      luggage: true,
    },
    {
      id: 'p2',
      name: 'Sara Hassan',
      avatar: '',
      phone: '+966 55 234 5678',
      ticket: 'TK002',
      luggage: false,
    },
    {
      id: 'p3',
      name: 'Omar Khalid',
      avatar: '',
      phone: '+966 54 345 6789',
      ticket: 'TK003',
      luggage: true,
    },
  ],
  1: [
    {
      id: 'p4',
      name: 'Layla Mansour',
      avatar: '',
      phone: '+966 50 456 7890',
      ticket: 'TK004',
      luggage: false,
    },
    {
      id: 'p5',
      name: 'Khalid Ibrahim',
      avatar: '',
      phone: '+966 55 567 8901',
      ticket: 'TK005',
      luggage: false,
    },
  ],
  2: [],
};

// ── Station coordinates for map polyline ───────────────────────────────────────
export const DEMO_STATION_COORDS: Array<{ latitude: number; longitude: number }> = [
  { latitude: 21.3891, longitude: 39.8579 }, // Central Station — Al-Hamra, Jeddah
  { latitude: 21.4306, longitude: 39.8466 }, // Business District — Al-Andalus
  { latitude: 21.6796, longitude: 39.1565 }, // King Abdulaziz Airport
];
