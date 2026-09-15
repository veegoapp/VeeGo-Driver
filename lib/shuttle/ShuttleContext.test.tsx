import React from 'react';
import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShuttleProvider, useShuttle } from './ShuttleContext';

jest.mock('../api', () => ({
  endpoints: {
    shuttle: {
      lines: jest.fn(),
      myBookings: jest.fn(),
      stateSnapshot: jest.fn(),
    },
    trips: {
      list: jest.fn(),
      stations: jest.fn(),
      stationsEta: jest.fn(),
    },
  },
}));

jest.mock('../socketContext', () => ({
  useSocket: jest.fn(),
}));

jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

const { endpoints } = jest.requireMock('../api');
const { useSocket } = jest.requireMock('../socketContext');

function makeFakeSocket() {
  const listeners = new Map<string, Set<any>>();
  const ioListeners = new Map<string, Set<any>>();
  return {
    on: (event: string, cb: any) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off: (event: string, cb: any) => { listeners.get(event)?.delete(cb); },
    __emit: (event: string, payload?: any) => { listeners.get(event)?.forEach((cb) => cb(payload)); },
    io: {
      on: (event: string, cb: any) => {
        if (!ioListeners.has(event)) ioListeners.set(event, new Set());
        ioListeners.get(event)!.add(cb);
      },
      off: (event: string, cb: any) => { ioListeners.get(event)?.delete(cb); },
      __emit: (event: string, payload?: any) => { ioListeners.get(event)?.forEach((cb) => cb(payload)); },
    },
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

let currentUnmount: (() => Promise<void>) | null = null;
let currentQueryClient: QueryClient | null = null;
let appStateListeners: ((state: string) => void)[] = [];

function emitAppState(state: string) {
  appStateListeners.forEach((cb) => cb(state));
}

async function setupHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  currentQueryClient = queryClient;
  const rendered = await renderHook(() => useShuttle(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ShuttleProvider>{children}</ShuttleProvider>
      </QueryClientProvider>
    ),
  });
  currentUnmount = rendered.unmount;
  return rendered;
}

const route = {
  id: 1, name: 'Downtown Line', fromLocation: 'A', toLocation: 'B',
  estimatedDuration: 30, basePrice: 20, stationCount: 3,
};

const activeTrip = {
  id: 100, routeId: 1, departureTime: '2026-01-01T08:00:00.000Z', arrivalTime: '2026-01-01T08:30:00.000Z',
  availableSeats: 5, totalSeats: 14, bookedSeats: 9, price: 20, status: 'active',
  minRequired: 6, thresholdMet: true,
};

function station(overrides: Record<string, any> = {}) {
  return {
    id: 11, routeId: 1, name: 'Station A', latitude: 1, longitude: 1, order: 1, direction: 'outbound',
    progress: null, status: 'pending', passengers: [], unassignedPassengers: [],
    ...overrides,
  };
}

const boardedPassenger = {
  bookingId: 201, userId: 5, seatCount: 1, status: 'boarded', boardingStationId: 12,
  userName: 'Sara', userPhone: '+201000000000', paymentMethod: 'cash', fareAmount: 20, instapayStatus: null,
};

function defaultStations() {
  return [
    station({ id: 11, order: 1, status: 'completed' }),
    station({ id: 12, order: 2, status: 'arrived', passengers: [boardedPassenger] }),
    station({ id: 13, order: 3, status: 'pending' }),
  ];
}

describe('ShuttleContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSocket.mockReturnValue({ socket: null });
    endpoints.shuttle.lines.mockResolvedValue({ data: [route] });
    endpoints.shuttle.myBookings.mockResolvedValue({ data: [] });
    endpoints.trips.list.mockResolvedValue({ data: [] });
    endpoints.trips.stations.mockResolvedValue({ data: [] });
    endpoints.trips.stationsEta.mockResolvedValue({ nextStation: null, remainingStations: [] });
    endpoints.shuttle.stateSnapshot.mockResolvedValue({});
    appStateListeners = [];
    (AppState as any).currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, cb: any) => {
      if (event === 'change') appStateListeners.push(cb);
      return { remove: jest.fn(() => { appStateListeners = appStateListeners.filter((l) => l !== cb); }) } as any;
    });
  });

  afterEach(async () => {
    if (currentUnmount) {
      await act(async () => { await currentUnmount!(); });
      currentUnmount = null;
    }
    currentQueryClient?.clear();
    currentQueryClient = null;
  });

  it('loads routes, bookings and driver trips, deriving allLines and the in-progress activeLine', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({ data: defaultStations() });

    const { result } = await setupHook();
    await flush();

    expect(result.current.routes).toHaveLength(1);
    expect(result.current.routes[0]).toMatchObject({ id: 1, name: 'Downtown Line' });
    expect(result.current.allLines).toHaveLength(1);
    expect(result.current.activeLine).toMatchObject({ tripId: '100', status: 'in-progress' });
    expect(endpoints.trips.stations).toHaveBeenCalledWith('100');
  });

  it('falls back to a placeholder line for a route with no active trip', async () => {
    const { result } = await setupHook();
    await flush();

    expect(result.current.allLines).toHaveLength(1);
    expect(result.current.allLines[0]).toMatchObject({ assigned: false, status: 'upcoming' });
    expect(result.current.activeLine).toBeNull();
  });

  it('keeps a trip visible even when its route was filtered out of /shuttle/lines', async () => {
    endpoints.shuttle.lines.mockResolvedValue({ data: [] });
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });

    const { result } = await setupHook();
    await flush();

    expect(result.current.allLines).toHaveLength(1);
    expect(result.current.allLines[0]).toMatchObject({ routeId: '1', assigned: true });
  });

  it('derives currentStopIndex from the arrived station, and builds passengers for that stop', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({ data: defaultStations() });
    endpoints.trips.stationsEta.mockResolvedValue({
      nextStation: { stationId: 12, etaMinutes: 5 },
      remainingStations: [{ stationId: 13, etaMinutes: 15 }],
    });

    const { result } = await setupHook();
    await flush();

    expect(result.current.currentStopIndex).toBe(1);
    expect(result.current.stops[1]).toMatchObject({ status: 'arrived', eta: '5 min' });
    expect(result.current.passengers).toHaveLength(1);
    expect(result.current.passengers[0]).toMatchObject({ id: '201', name: 'Sara', checkedIn: true });
  });

  it('falls back to the first pending station when none has arrived', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({
      data: [
        station({ id: 11, order: 1, status: 'completed' }),
        station({ id: 12, order: 2, status: 'completed' }),
        station({ id: 13, order: 3, status: 'pending' }),
      ],
    });

    const { result } = await setupHook();
    await flush();

    expect(result.current.currentStopIndex).toBe(2);
  });

  it('stays on the last stop once every station is completed', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({
      data: [
        station({ id: 11, order: 1, status: 'completed' }),
        station({ id: 12, order: 2, status: 'completed' }),
      ],
    });

    const { result } = await setupHook();
    await flush();

    expect(result.current.currentStopIndex).toBe(1);
  });

  it('mergeInstapayStatus wiring never regresses a locally-confirmed status on refetch', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({
      data: [station({ id: 12, order: 1, status: 'arrived', passengers: [{ ...boardedPassenger, instapayStatus: 'confirmed' }] })],
    });

    const { result } = await setupHook();
    await flush();
    expect(result.current.passengers[0].instapayStatus).toBe('confirmed');

    // A refetch (e.g. the 30s poll) that brings back a stale non-confirmed status.
    endpoints.trips.stations.mockResolvedValue({
      data: [station({ id: 12, order: 1, status: 'arrived', passengers: [{ ...boardedPassenger, instapayStatus: 'awaiting_confirmation' }] })],
    });
    await act(async () => { await currentQueryClient!.invalidateQueries({ queryKey: ['shuttle-trip-stations', '100'] }); });
    await flush();

    expect(result.current.passengers[0].instapayStatus).toBe('confirmed');
  });

  it('nextStop() advances the stop index and resets checked-in state for the new stop', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({ data: defaultStations() });

    const { result } = await setupHook();
    await flush();
    expect(result.current.currentStopIndex).toBe(1);

    await act(async () => { result.current.nextStop(); });

    expect(result.current.currentStopIndex).toBe(2);
  });

  it('togglePassenger flips only the targeted passenger', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({ data: defaultStations() });

    const { result } = await setupHook();
    await flush();
    expect(result.current.passengers[0].checkedIn).toBe(true);

    await act(async () => { result.current.togglePassenger('201'); });

    expect(result.current.passengers[0].checkedIn).toBe(false);
  });

  it('updatePassengerInstapayStatus never regresses an already-confirmed status', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({
      data: [station({ id: 12, order: 1, status: 'arrived', passengers: [{ ...boardedPassenger, instapayStatus: 'confirmed' }] })],
    });

    const { result } = await setupHook();
    await flush();

    await act(async () => { result.current.updatePassengerInstapayStatus('201', 'awaiting_confirmation'); });

    expect(result.current.passengers[0].instapayStatus).toBe('confirmed');
  });

  it('resetTrip() clears stop index, passengers and startedTripId', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({ data: defaultStations() });

    const { result } = await setupHook();
    await flush();
    await act(async () => { result.current.setStartedTripId('100'); });
    expect(result.current.currentStopIndex).toBe(1);

    await act(async () => { result.current.resetTrip(); });

    expect(result.current.currentStopIndex).toBe(0);
    expect(result.current.passengers).toEqual([]);
    expect(result.current.startedTripId).toBeNull();
  });

  it('shuttle:booking:cancelled removes the passenger locally and shows the cancellation banner', async () => {
    endpoints.trips.list.mockResolvedValue({ data: [activeTrip] });
    endpoints.trips.stations.mockResolvedValue({ data: defaultStations() });
    const socket = makeFakeSocket();
    useSocket.mockReturnValue({ socket });

    const { result } = await setupHook();
    await flush();
    expect(result.current.passengers).toHaveLength(1);

    await act(async () => {
      socket.__emit('shuttle:booking:cancelled', { bookingId: 201, routeId: 1, reason: 'no-show' });
    });

    expect(result.current.passengers).toHaveLength(0);
    expect(result.current.bookingStatusBanner).toMatchObject({ type: 'cancelled' });
    expect(result.current.bookingStatusBanner?.message).toContain('no-show');
  });

  it('shuttle:booking:reassigned shows a non-cancellation banner', async () => {
    const socket = makeFakeSocket();
    useSocket.mockReturnValue({ socket });

    const { result } = await setupHook();
    await flush();

    await act(async () => {
      socket.__emit('shuttle:booking:reassigned', { bookingId: 301, reason: 'bus swap' });
    });

    expect(result.current.bookingStatusBanner).toMatchObject({ type: 'reassigned' });
  });

  it('notification:new with category "trip" sets the trip-cancelled banner', async () => {
    const socket = makeFakeSocket();
    useSocket.mockReturnValue({ socket });

    const { result } = await setupHook();
    await flush();

    await act(async () => {
      socket.__emit('notification:new', { category: 'trip', title: 'Route 1', body: 'was automatically cancelled.' });
    });

    expect(result.current.tripCancelledBanner).toContain('Route 1');
    await act(async () => { result.current.dismissTripCancelledBanner(); });
    expect(result.current.tripCancelledBanner).toBeNull();
  });

  it('slot_released sets a dismissable slot-released alert for the route', async () => {
    const socket = makeFakeSocket();
    useSocket.mockReturnValue({ socket });

    const { result } = await setupHook();
    await flush();

    await act(async () => {
      socket.__emit('slot_released', { routeId: 1, routeName: 'Downtown Line' });
    });

    expect(result.current.slotReleasedAlert).toMatchObject({ routeId: 1, routeName: 'Downtown Line' });
    await act(async () => { result.current.dismissSlotReleasedAlert(); });
    expect(result.current.slotReleasedAlert).toBeNull();
  });

  it('a reconnect event triggers a state re-sync (refetches bookings/lines/trips)', async () => {
    const socket = makeFakeSocket();
    useSocket.mockReturnValue({ socket });

    await setupHook();
    await flush();
    endpoints.shuttle.myBookings.mockClear();

    await act(async () => { socket.io.__emit('reconnect'); });
    await flush();

    expect(endpoints.shuttle.myBookings).toHaveBeenCalled();
  });

  it('coming back to the foreground from the background re-syncs all shuttle queries', async () => {
    const { result } = await setupHook();
    await flush();
    endpoints.shuttle.myBookings.mockClear();
    endpoints.shuttle.lines.mockClear();

    await act(async () => { emitAppState('background'); });
    await act(async () => { emitAppState('active'); });
    await flush();

    expect(endpoints.shuttle.myBookings).toHaveBeenCalled();
    expect(endpoints.shuttle.lines).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('surfaces the driver-trips fetch error instead of silently showing an empty list', async () => {
    endpoints.trips.list.mockRejectedValue(new Error('trips endpoint down'));

    const { result } = await setupHook();
    await flush();

    expect(result.current.error).toBeTruthy();
    // Routes still loaded fine — a failed /driver/trips fetch degrades to
    // placeholder (unassigned) lines rather than wiping the route list.
    expect(result.current.allLines).toHaveLength(1);
    expect(result.current.allLines[0]).toMatchObject({ assigned: false });
  });
});
