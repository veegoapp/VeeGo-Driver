export const driver = {
  id: 'drv_001',
  name: 'Amine Khalifi',
  rating: 4.92,
  trips: 1284,
  acceptanceRate: 94,
  cancelRate: 3,
  vehicle: { make: 'Toyota', model: 'Hiace', plate: 'TUN 4587', color: 'White', year: 2022 },
  avatar: 'https://i.pravatar.cc/200?img=12',
  walletBalance: 842.5,
  level: 'Gold',
  serviceType: 'SHUTTLE' as 'CAR' | 'MOTOR' | 'DELIVERY' | 'SHUTTLE',
};

export const todayEarnings = {
  total: 142.8,
  trips: 11,
  hours: 6.5,
  online: 7.2,
  tips: 18.4,
  bonus: 25,
  cash: 48.2,
  card: 94.6,
};

export const weekEarnings = [
  { day: 'Mon', amount: 98 },
  { day: 'Tue', amount: 142 },
  { day: 'Wed', amount: 76 },
  { day: 'Thu', amount: 164 },
  { day: 'Fri', amount: 188 },
  { day: 'Sat', amount: 221 },
  { day: 'Sun', amount: 142 },
];

export type RideRequest = {
  id: string;
  rider: { name: string; rating: number; avatar: string };
  pickup: { address: string; distance: string; eta: string };
  dropoff: { address: string; distance: string };
  fare: number;
  type: 'Economy' | 'Premium' | 'XL';
  payment: 'Cash' | 'Card';
  duration: string;
};

export const incomingRide: RideRequest = {
  id: 'rd_4821',
  rider: { name: 'Sarah M.', rating: 4.87, avatar: 'https://i.pravatar.cc/100?img=47' },
  pickup: { address: 'Avenue Habib Bourguiba 24', distance: '1.2 km', eta: '4 min' },
  dropoff: { address: 'Tunis-Carthage Airport, Terminal 1', distance: '12.4 km' },
  fare: 18.5,
  type: 'Premium',
  payment: 'Card',
  duration: '22 min',
};

export const trips = [
  { id: 't1', date: 'Today, 14:32', from: 'Lac 2', to: 'La Marsa', fare: 14.2, rating: 5, distance: '8.4 km' },
  { id: 't2', date: 'Today, 13:10', from: 'Centre Ville', to: 'Manouba', fare: 22.8, rating: 5, distance: '16.2 km' },
  { id: 't3', date: 'Today, 11:45', from: 'Bardo', to: 'Carthage', fare: 9.6, rating: 4, distance: '5.1 km' },
  { id: 't4', date: 'Yesterday, 21:08', from: 'Airport T1', to: 'Gammarth', fare: 28.4, rating: 5, distance: '22.8 km' },
  { id: 't5', date: 'Yesterday, 18:22', from: 'Sidi Bou Said', to: 'Lac 1', fare: 11.5, rating: 5, distance: '6.8 km' },
  { id: 't6', date: 'Yesterday, 15:40', from: 'Mégrine', to: 'Ariana', fare: 18.9, rating: 4, distance: '14.2 km' },
];

export const ratingsBreakdown = [
  { stars: 5, count: 1198, pct: 93 },
  { stars: 4, count: 64, pct: 5 },
  { stars: 3, count: 14, pct: 1 },
  { stars: 2, count: 5, pct: 0.5 },
  { stars: 1, count: 3, pct: 0.5 },
];

export const reviews = [
  { id: 'r1', name: 'Mehdi K.', rating: 5, text: 'Excellent driver, very polite and smooth ride.', date: '2 days ago' },
  { id: 'r2', name: 'Yasmine B.', rating: 5, text: 'On time, clean car, great music!', date: '5 days ago' },
  { id: 'r3', name: 'Karim A.', rating: 4, text: 'Good driver. Knows the city well.', date: '1 week ago' },
];

export const documents = [
  { id: 'd1', title: 'Driver License', status: 'verified' as const, expires: '12/2027' },
  { id: 'd2', title: 'Vehicle Registration', status: 'verified' as const, expires: '06/2026' },
  { id: 'd3', title: 'Insurance', status: 'expiring' as const, expires: '01/2026' },
  { id: 'd4', title: 'Vehicle Inspection', status: 'verified' as const, expires: '09/2026' },
  { id: 'd5', title: 'Profile Photo', status: 'verified' as const, expires: '—' },
];

// ─── Shuttle Lines (line-based transport system) ────────────────────────────

export type ShuttleStation = {
  id: string;
  name: string;
  eta: string;
};

export type ShuttleLine = {
  id: string;
  lineNumber: string;
  name: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  status: 'upcoming' | 'in-progress' | 'completed';
  passengers: number;
  capacity: number;
  assigned: boolean;
  stations: ShuttleStation[];
};

export const shuttleLines: ShuttleLine[] = [
  {
    id: 'sl1',
    lineNumber: 'L-01',
    name: 'Airport Express',
    from: 'Lac 2',
    to: 'Tunis-Carthage Airport',
    departure: '06:00',
    arrival: '07:15',
    status: 'completed',
    passengers: 12,
    capacity: 14,
    assigned: true,
    stations: [
      { id: 'ss1', name: 'Lac 2 Central', eta: '06:00' },
      { id: 'ss2', name: 'Tunis Mall', eta: '06:20' },
      { id: 'ss3', name: 'Berges du Lac', eta: '06:40' },
      { id: 'ss4', name: 'Airport T1', eta: '07:15' },
    ],
  },
  {
    id: 'sl2',
    lineNumber: 'L-02',
    name: 'City Loop',
    from: 'Centre Ville',
    to: 'Bab Souika',
    departure: '08:00',
    arrival: '09:30',
    status: 'in-progress',
    passengers: 9,
    capacity: 12,
    assigned: true,
    stations: [
      { id: 'ss5', name: 'Lac 2 Central', eta: '08:00' },
      { id: 'ss6', name: 'Tunis Mall', eta: '08:20' },
      { id: 'ss7', name: 'Berges du Lac', eta: '08:40' },
      { id: 'ss8', name: 'Mutuelleville', eta: '09:00' },
      { id: 'ss9', name: 'Centre Ville', eta: '09:15' },
      { id: 'ss10', name: 'Bab Souika', eta: '09:30' },
    ],
  },
  {
    id: 'sl3',
    lineNumber: 'L-03',
    name: 'University Run',
    from: 'Manouba',
    to: 'Bardo',
    departure: '10:00',
    arrival: '11:00',
    status: 'upcoming',
    passengers: 0,
    capacity: 14,
    assigned: false,
    stations: [
      { id: 'ss11', name: 'Manouba Campus', eta: '10:00' },
      { id: 'ss12', name: 'Cité Ettadhamen', eta: '10:20' },
      { id: 'ss13', name: 'Bardo', eta: '11:00' },
    ],
  },
  {
    id: 'sl4',
    lineNumber: 'L-04',
    name: 'Airport Return',
    from: 'Airport T1',
    to: 'Lac 2',
    departure: '12:00',
    arrival: '13:15',
    status: 'upcoming',
    passengers: 0,
    capacity: 14,
    assigned: false,
    stations: [
      { id: 'ss14', name: 'Airport T1', eta: '12:00' },
      { id: 'ss15', name: 'Berges du Lac', eta: '12:35' },
      { id: 'ss16', name: 'Tunis Mall', eta: '12:55' },
      { id: 'ss17', name: 'Lac 2 Central', eta: '13:15' },
    ],
  },
  {
    id: 'sl5',
    lineNumber: 'L-05',
    name: 'Evening Commute',
    from: 'Centre Ville',
    to: 'La Marsa',
    departure: '17:00',
    arrival: '18:30',
    status: 'upcoming',
    passengers: 0,
    capacity: 12,
    assigned: false,
    stations: [
      { id: 'ss18', name: 'Centre Ville', eta: '17:00' },
      { id: 'ss19', name: 'Carthage', eta: '17:25' },
      { id: 'ss20', name: 'Sidi Bou Said', eta: '17:50' },
      { id: 'ss21', name: 'La Marsa', eta: '18:30' },
    ],
  },
];

// ─── Active stop / boarding data ─────────────────────────────────────────────

export type ShuttleStop = {
  id: string;
  name: string;
  address: string;
  eta: string;
  boarded: number;
  expected: number;
  status: 'pending' | 'arrived' | 'completed';
};

export const activeShuttleStops: ShuttleStop[] = [
  { id: 's1', name: 'Lac 2 Central', address: 'Avenue de la LAC, Tunis', eta: '08:00', boarded: 4, expected: 4, status: 'completed' },
  { id: 's2', name: 'Tunis Mall', address: 'Route de La Marsa', eta: '08:20', boarded: 3, expected: 3, status: 'completed' },
  { id: 's3', name: 'Berges du Lac', address: 'Boulevard du Lac', eta: '08:40', boarded: 2, expected: 2, status: 'arrived' },
  { id: 's4', name: 'Mutuelleville', address: 'Rue de la Mutuelle', eta: '09:00', boarded: 0, expected: 3, status: 'pending' },
  { id: 's5', name: 'Centre Ville', address: 'Avenue Habib Bourguiba', eta: '09:15', boarded: 0, expected: 2, status: 'pending' },
  { id: 's6', name: 'Bab Souika', address: 'Rue Bab Souika', eta: '09:30', boarded: 0, expected: 2, status: 'pending' },
];

export type BoardingPassenger = {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  ticket: string;
  checkedIn: boolean;
  luggage: boolean;
};

export const boardingPassengers: BoardingPassenger[] = [
  { id: 'bp1', name: 'Sami R.', avatar: 'https://i.pravatar.cc/100?img=33', phone: '+216 55 123 456', ticket: 'VT-2847', checkedIn: true, luggage: false },
  { id: 'bp2', name: 'Fatima Z.', avatar: 'https://i.pravatar.cc/100?img=5', phone: '+216 56 789 012', ticket: 'VT-2848', checkedIn: false, luggage: true },
  { id: 'bp3', name: 'Omar B.', avatar: 'https://i.pravatar.cc/100?img=11', phone: '+216 54 345 678', ticket: 'VT-2849', checkedIn: false, luggage: false },
  { id: 'bp4', name: 'Leila K.', avatar: 'https://i.pravatar.cc/100?img=9', phone: '+216 58 901 234', ticket: 'VT-2850', checkedIn: false, luggage: true },
];
