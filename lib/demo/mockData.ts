import type { ShuttleLine, ShuttleStop, ShuttleRoute, ShuttleBooking, BoardingPassenger } from '@/lib/shuttleContext';

export const DEMO_STATION_COORDS = [
  { latitude: 30.1324,   longitude: 31.3231   },
  { latitude: 30.129553, longitude: 31.321638 },
  { latitude: 30.122316, longitude: 31.318186 },
  { latitude: 30.112371, longitude: 31.316303 },
  { latitude: 30.11504,  longitude: 31.30606  },
  { latitude: 30.1024,   longitude: 31.301067 },
];

export const DEMO_LINE: ShuttleLine = {
  id: 'demo-line-1',
  tripId: 'demo-trip-1',
  lineNumber: 'D1',
  name: 'Ain Shams → Heliopolis',
  from: 'Ain Shams',
  to: 'Heliopolis',
  departure: '08:00',
  arrival: '09:15',
  status: 'in-progress',
  passengers: 8,
  capacity: 12,
  bookedSeats: 8,
  totalSeats: 12,
  vehicleType: 'HiAce',
  assigned: true,
  stationCount: 6,
  estimatedDuration: 75,
  basePrice: 85,
};

export const DEMO_ROUTE: ShuttleRoute = {
  id: 'demo-route-1',
  name: 'Ain Shams → Heliopolis',
  from: 'Ain Shams',
  to: 'Heliopolis',
  stationCount: 6,
  estimatedDuration: 75,
  basePrice: 85,
  timeslots: [{
    id: 'demo-slot-1',
    departureTime: '08:00',
    availableSeats: 1,
    totalSeats: 12,
    isBooked: true,
    isTaken: false,
  }],
};

export const DEMO_BOOKING: ShuttleBooking = {
  id: 'demo-booking-1',
  routeId: 'demo-route-1',
  routeName: 'Ain Shams → Heliopolis',
  timeSlotId: 'demo-slot-1',
  departureTime: '08:00',
  weekStart: new Date().toISOString().slice(0, 10),
  status: 'booked',
};

export const DEMO_STOPS_TEMPLATE: Omit<ShuttleStop, 'status' | 'boarded' | 'expected'>[] = [
  { id: 'stop-1', name: 'Mazlaqan Ain Shams',    address: 'Mazlaqan, Ain Shams', eta: '08:00' },
  { id: 'stop-2', name: 'New Al Easr Mall',       address: 'New Al Easr, Ain Shams', eta: '08:08' },
  { id: 'stop-3', name: 'El Tawhed & El Noor',    address: 'El Tawhed St, Ain Shams', eta: '08:16' },
  { id: 'stop-4', name: 'Mr. Avocado Juices',     address: 'Abbas El Akkad, Nasr City', eta: '08:25' },
  { id: 'stop-5', name: 'Al Gamal Mall',          address: 'Al Gamal Mall, Heliopolis', eta: '08:35' },
  { id: 'stop-6', name: 'Al Batal Al Romani',     address: 'Al Batal Al Romani St, Heliopolis', eta: '08:45' },
];

export const DEMO_PASSENGERS_TEMPLATE: Omit<BoardingPassenger, 'checkedIn'>[][] = [
  [ // Stop 1
    { id: 'p1', name: 'Ahmed Hassan',   phone: '010-1234-5678', ticket: 'TK-001', avatar: '', luggage: false },
    { id: 'p2', name: 'Sara Mohamed',   phone: '011-2345-6789', ticket: 'TK-002', avatar: '', luggage: true },
  ],
  [ // Stop 2
    { id: 'p3', name: 'Omar Khalil',    phone: '012-3456-7890', ticket: 'TK-003', avatar: '', luggage: false },
    { id: 'p4', name: 'Fatma Ali',      phone: '010-4567-8901', ticket: 'TK-004', avatar: '', luggage: false },
  ],
  [ // Stop 3
    { id: 'p5', name: 'Khaled Nasser',  phone: '011-5678-9012', ticket: 'TK-005', avatar: '', luggage: true },
    { id: 'p6', name: 'Nour Ibrahim',   phone: '012-6789-0123', ticket: 'TK-006', avatar: '', luggage: false },
  ],
  [ // Stop 4
    { id: 'p7', name: 'Youssef Samir',  phone: '010-7890-1234', ticket: 'TK-007', avatar: '', luggage: false },
  ],
  [ // Stop 5
    { id: 'p8', name: 'Dina Mahmoud',   phone: '011-8901-2345', ticket: 'TK-008', avatar: '', luggage: true },
  ],
  [], // Stop 6 — final stop, no boarding
];
