import {
  mergeInstapayStatus, findLineForRoute, buildLine, mapStatus, formatTime, formatDate,
  extractRoutes, extractTrips, extractBookings, extractTripStations, mapRoute, deriveVehicleType,
  type BackendRoute, type BackendTrip,
} from './helpers';

describe('mergeInstapayStatus', () => {
  it('keeps a locally-confirmed status even when the fresh value disagrees', () => {
    expect(mergeInstapayStatus('confirmed', 'awaiting_payment')).toBe('confirmed');
    expect(mergeInstapayStatus('confirmed', undefined)).toBe('confirmed');
  });

  it('lets a fresh non-confirmed value win over a stale local one (the original bug)', () => {
    expect(mergeInstapayStatus(undefined, 'awaiting_confirmation')).toBe('awaiting_confirmation');
    expect(mergeInstapayStatus('awaiting_payment', 'awaiting_confirmation')).toBe('awaiting_confirmation');
  });

  it('returns undefined when neither side has a value', () => {
    expect(mergeInstapayStatus(undefined, undefined)).toBeUndefined();
    expect(mergeInstapayStatus(null, null)).toBeUndefined();
  });

  it('falls back to the existing value when the fresh field is missing', () => {
    expect(mergeInstapayStatus('awaiting_confirmation', undefined)).toBe('awaiting_confirmation');
    expect(mergeInstapayStatus('awaiting_confirmation', null)).toBe('awaiting_confirmation');
  });
});

describe('findLineForRoute', () => {
  const route: BackendRoute = {
    id: 1,
    name: 'Route 1',
    estimatedDuration: 30,
    basePrice: 10,
  };
  const outboundTrip: BackendTrip = {
    id: 100,
    routeId: 1,
    departureTime: '2026-01-01T08:00:00.000Z',
    arrivalTime: '2026-01-01T09:00:00.000Z',
    availableSeats: 5,
    totalSeats: 14,
    price: 10,
    status: 'active',
    direction: 'outbound',
  };
  const returnTrip: BackendTrip = {
    id: 101,
    routeId: 1,
    departureTime: '2026-01-01T18:00:00.000Z',
    arrivalTime: '2026-01-01T19:00:00.000Z',
    availableSeats: 5,
    totalSeats: 14,
    price: 10,
    status: 'active',
    direction: 'return',
  };
  const outboundLine = buildLine(route, outboundTrip);
  const returnLine = buildLine(route, returnTrip);
  const lines = [outboundLine, returnLine];

  it('returns the single match when only one line exists for the route', () => {
    expect(findLineForRoute([outboundLine], 1)).toBe(outboundLine);
  });

  it('disambiguates by direction when both sides have it', () => {
    expect(findLineForRoute(lines, 1, { direction: 'return' })).toBe(returnLine);
  });

  it('falls back to matching departure time when direction is unavailable', () => {
    expect(findLineForRoute(lines, 1, { departureTime: returnLine.departure })).toBe(returnLine);
  });

  it('falls back to the first assigned trip, then the first entry, when no ref matches', () => {
    expect(findLineForRoute(lines, 1)).toBe(outboundLine);
    expect(findLineForRoute(lines, 1, { direction: 'unknown-direction' })).toBe(outboundLine);
  });

  it('returns undefined when no line matches the routeId', () => {
    expect(findLineForRoute(lines, 999)).toBeUndefined();
  });
});

describe('mapStatus', () => {
  it('maps active and boarding to in-progress', () => {
    expect(mapStatus('active')).toBe('in-progress');
    expect(mapStatus('boarding')).toBe('in-progress');
  });

  it('maps completed and cancelled to themselves', () => {
    expect(mapStatus('completed')).toBe('completed');
    expect(mapStatus('cancelled')).toBe('cancelled');
  });

  it('falls back to upcoming for any other status', () => {
    expect(mapStatus('scheduled')).toBe('upcoming');
    expect(mapStatus('')).toBe('upcoming');
  });
});

describe('formatTime', () => {
  it('formats a valid ISO timestamp', () => {
    const result = formatTime('2026-01-01T08:30:00.000Z');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the placeholder for an empty string', () => {
    expect(formatTime('')).toBe('—');
  });

  it('does not throw for an unparsable string (Date itself does not throw; it yields "Invalid Date")', () => {
    expect(() => formatTime('not-a-date')).not.toThrow();
    expect(formatTime('not-a-date')).toBe('Invalid Date');
  });
});

describe('formatDate', () => {
  it('formats a valid ISO timestamp', () => {
    const result = formatDate('2026-01-01T08:30:00.000Z');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the placeholder for undefined/empty input', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('does not throw for an unparsable string (Date itself does not throw; it yields "Invalid Date")', () => {
    expect(() => formatDate('not-a-date')).not.toThrow();
    expect(formatDate('not-a-date')).toBe('Invalid Date');
  });
});

describe('extractRoutes', () => {
  const route: BackendRoute = { id: 1, name: 'R1', estimatedDuration: 10, basePrice: 5 };

  it('returns a bare array unchanged', () => {
    expect(extractRoutes([route])).toEqual([route]);
  });

  it('unwraps { data }, { routes }, and { lines } envelopes in that priority order', () => {
    expect(extractRoutes({ data: [route] })).toEqual([route]);
    expect(extractRoutes({ routes: [route] })).toEqual([route]);
    expect(extractRoutes({ lines: [route] })).toEqual([route]);
    expect(extractRoutes({ data: [route], routes: [{ ...route, id: 2 }] })).toEqual([route]);
  });

  it('returns [] for null/undefined/an unrecognized shape', () => {
    expect(extractRoutes(null)).toEqual([]);
    expect(extractRoutes(undefined)).toEqual([]);
    expect(extractRoutes({})).toEqual([]);
  });
});

describe('extractTrips', () => {
  const trip: BackendTrip = {
    id: 1, routeId: 1, departureTime: '2026-01-01T08:00:00.000Z', arrivalTime: '2026-01-01T09:00:00.000Z',
    availableSeats: 5, totalSeats: 14, price: 10, status: 'active',
  };

  it('returns a bare array unchanged', () => {
    expect(extractTrips([trip])).toEqual([trip]);
  });

  it('unwraps a { data } or { trips } envelope', () => {
    expect(extractTrips({ data: [trip] })).toEqual([trip]);
    expect(extractTrips({ trips: [trip] })).toEqual([trip]);
  });

  it('returns [] for null/undefined/an unrecognized shape', () => {
    expect(extractTrips(null)).toEqual([]);
    expect(extractTrips({})).toEqual([]);
  });
});

describe('extractBookings', () => {
  it('normalizes a bare array of bookings, filling in defaults for missing fields', () => {
    const [booking] = extractBookings([{ id: 1, status: 'confirmed' }]);
    expect(booking.id).toBe('1');
    expect(booking.routeId).toBe(0);
    expect(booking.routeName).toBe('—');
    expect(booking.weekStart).toBe('');
    expect(booking.status).toBe('confirmed');
    expect(booking.trip).toBeNull();
  });

  it('prefers flat fields over the nested route/timeSlot objects', () => {
    const [booking] = extractBookings([{
      id: 1, routeName: 'Flat name', route: { id: 9, name: 'Nested name' },
      departureTime: '08:00', timeSlot: { id: 5, departureTime: '09:00' },
    }]);
    expect(booking.routeName).toBe('Flat name');
    expect(booking.departureTime).toBe('08:00');
  });

  it('falls back to the nested route/timeSlot objects when flat fields are absent', () => {
    const [booking] = extractBookings([{
      id: 1, route: { id: 9, name: 'Nested name' }, timeSlot: { id: 5, departureTime: '09:00' },
    }]);
    expect(booking.routeId).toBe(9);
    expect(booking.routeName).toBe('Nested name');
    expect(booking.timeSlotId).toBe(5);
    expect(booking.departureTime).toBe('09:00');
  });

  it('normalizes the nested trip object, defaulting its fields when absent', () => {
    const [booking] = extractBookings([{ id: 1, trip: { thresholdMet: true } }]);
    expect(booking.trip).toEqual({
      thresholdMet: true, bookedSeats: 0, minRequired: 0, totalSeats: null,
      shuttleStatus: 'open', tripDatetimes: undefined,
    });
  });

  it('unwraps a { data } or { bookings } envelope', () => {
    expect(extractBookings({ data: [{ id: 1 }] })).toHaveLength(1);
    expect(extractBookings({ bookings: [{ id: 1 }] })).toHaveLength(1);
  });

  it('returns [] for null/undefined', () => {
    expect(extractBookings(null)).toEqual([]);
    expect(extractBookings(undefined)).toEqual([]);
  });
});

describe('extractTripStations', () => {
  it('returns a bare array unchanged', () => {
    const stations = [{ id: 1 }] as any;
    expect(extractTripStations(stations)).toBe(stations);
  });

  it('unwraps a { data } envelope', () => {
    const stations = [{ id: 1 }];
    expect(extractTripStations({ data: stations })).toBe(stations);
  });

  it('returns [] for null/undefined/an unrecognized shape', () => {
    expect(extractTripStations(null)).toEqual([]);
    expect(extractTripStations({})).toEqual([]);
  });
});

describe('mapRoute', () => {
  it('maps a well-formed route with timeslots', () => {
    const route: BackendRoute = {
      id: 1, name: 'R1', fromLocation: 'A', toLocation: 'B', estimatedDuration: 20, basePrice: 15,
      stationCount: 4,
      timeSlots: [{ id: 1, departureTime: '08:00', availableSeats: 3, totalSeats: 14, isBooked: true }],
    };
    const result = mapRoute(route);
    expect(result.from).toBe('A');
    expect(result.to).toBe('B');
    expect(result.timeslots).toEqual([
      { id: 1, departureTime: '08:00', availableSeats: 3, totalSeats: 14, isBooked: true, isTaken: false },
    ]);
  });

  it('falls back to from/to and an empty timeslots list when timeSlots is absent', () => {
    const route: BackendRoute = { id: 1, name: 'R1', estimatedDuration: 20, basePrice: 15 };
    const result = mapRoute(route);
    expect(result.from).toBe('—');
    expect(result.to).toBe('—');
    expect(result.timeslots).toEqual([]);
    expect(result.stationCount).toBe(0);
  });

  it('falls back to the legacy `timeslots` (lowercase) field when `timeSlots` is absent', () => {
    const route: BackendRoute = {
      id: 1, name: 'R1', estimatedDuration: 20, basePrice: 15,
      timeslots: [{ id: 2, departureTime: '09:00', booked: true }],
    };
    const result = mapRoute(route);
    expect(result.timeslots).toEqual([
      { id: 2, departureTime: '09:00', availableSeats: null, totalSeats: null, isBooked: true, isTaken: false },
    ]);
  });
});

describe('deriveVehicleType', () => {
  it('identifies a 14-seat vehicle as a HiAce', () => {
    expect(deriveVehicleType(14)).toBe('HiAce');
  });

  it('identifies a 28-seat vehicle as a Mini Bus', () => {
    expect(deriveVehicleType(28)).toBe('Mini Bus');
  });

  it('returns Unknown for any other seat count', () => {
    expect(deriveVehicleType(0)).toBe('Unknown');
    expect(deriveVehicleType(20)).toBe('Unknown');
  });
});
