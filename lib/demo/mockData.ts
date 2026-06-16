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
  id: '4',
  tripId: undefined,
  lineNumber: '4',
  name: 'Ain Shams → Heliopolis #1',
  from: 'Mazlaqan Ain Shams',
  to: 'Al Batal Al Romani Company for Car Tires',
  departure: '07:00',
  arrival: '07:40',
  status: 'in-progress',
  passengers: 8,
  capacity: 14,
  bookedSeats: 8,
  totalSeats: 14,
  vehicleType: 'HiAce',
  assigned: true,
  stationCount: 6,
  estimatedDuration: 40,
  basePrice: 35,
};

// ── Mock booking (shown on shuttle home screen) ────────────────────────────────
export const DEMO_BOOKING: ShuttleBooking = {
  id: 'demo-booking-1',
  routeId: '4',
  routeName: 'Ain Shams → El Maadi #1',
  timeSlotId: 'demo-slot-1',
  departureTime: '07:00',
  weekStart: new Date().toISOString().slice(0, 10),
  status: 'booked',
};

// ── Mock route (shown on lines screen) ────────────────────────────────────────
export const DEMO_ROUTE: ShuttleRoute = {
  id: '4',
  name: 'Ain Shams → Heliopolis #1',
  from: 'Mazlaqan Ain Shams',
  to: 'Al Batal Al Romani Company for Car Tires',
  stationCount: 6,
  estimatedDuration: 40,
  basePrice: 35,
  timeslots: [
    {
      id: 'demo-slot-1',
      departureTime: '07:00',
      availableSeats: 6,
      totalSeats: 14,
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
    id: '16',
    name: 'Mazlaqan Ain Shams',
    address: 'Ain Shams, Cairo',
    eta: '07:00',
  },
  {
    id: '17',
    name: 'New Al Easr Mall',
    address: 'Ain Shams, Cairo',
    eta: '07:07',
  },
  {
    id: '18',
    name: 'El Tawhed & El Noor',
    address: 'Ain Shams, Cairo',
    eta: '07:14',
  },
  {
    id: '19',
    name: 'Mr. Avocado Juices',
    address: 'Ain Shams, Cairo',
    eta: '07:22',
  },
  {
    id: '20',
    name: 'Al Gamal Mall',
    address: 'Heliopolis, Cairo',
    eta: '07:30',
  },
  {
    id: '21',
    name: 'Al Batal Al Romani Company for Car Tires',
    address: 'Heliopolis, Cairo',
    eta: '07:40',
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
      name: 'Mohamed El-Sayed',
      avatar: '',
      phone: '+20 100 123 4567',
      ticket: 'TK001',
      luggage: false,
    },
    {
      id: 'p2',
      name: 'Nour Ibrahim',
      avatar: '',
      phone: '+20 111 234 5678',
      ticket: 'TK002',
      luggage: true,
    },
  ],
  1: [
    {
      id: 'p3',
      name: 'Ahmed Mostafa',
      avatar: '',
      phone: '+20 122 345 6789',
      ticket: 'TK003',
      luggage: false,
    },
  ],
  2: [
    {
      id: 'p4',
      name: 'Sara Hassan',
      avatar: '',
      phone: '+20 100 456 7890',
      ticket: 'TK004',
      luggage: false,
    },
    {
      id: 'p5',
      name: 'Omar Khalil',
      avatar: '',
      phone: '+20 106 567 8901',
      ticket: 'TK005',
      luggage: true,
    },
  ],
  3: [
    {
      id: 'p6',
      name: 'Dina Mahmoud',
      avatar: '',
      phone: '+20 111 678 9012',
      ticket: 'TK006',
      luggage: false,
    },
  ],
  4: [
    {
      id: 'p7',
      name: 'Karim Adel',
      avatar: '',
      phone: '+20 122 789 0123',
      ticket: 'TK007',
      luggage: false,
    },
  ],
  5: [
    {
      id: 'p8',
      name: 'Mona Tarek',
      avatar: '',
      phone: '+20 100 890 1234',
      ticket: 'TK008',
      luggage: false,
    },
  ],
};

// ── Station coordinates for map polyline ───────────────────────────────────────
export const DEMO_STATION_COORDS: Array<{ latitude: number; longitude: number }> = [
  { latitude: 30.1324,   longitude: 31.3231   }, // Station 1 — Mazlaqan Ain Shams
  { latitude: 30.129553, longitude: 31.321638 }, // Station 2 — New Al Easr Mall
  { latitude: 30.122316, longitude: 31.318186 }, // Station 3 — El Tawhed & El Noor
  { latitude: 30.112371, longitude: 31.316303 }, // Station 4 — Mr. Avocado Juices
  { latitude: 30.11504,  longitude: 31.30606  }, // Station 5 — Al Gamal Mall
  { latitude: 30.1024,   longitude: 31.301067 }, // Station 6 — Al Batal Al Romani (final stop)
];
