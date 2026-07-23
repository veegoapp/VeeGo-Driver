import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '../api';
import { useSocket } from '../socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import type {
  ShuttleRoute,
  ShuttleBooking,
  ShuttleLine,
  ShuttleStop,
  BoardingPassenger,
  SlotReleasedAlert,
  BookingStatusBanner,
} from './types';
import type { BackendRoute, BackendTrip, BackendStationWithPassengers } from './helpers';
import {
  extractRoutes,
  extractTrips,
  extractBookings,
  extractTripStations,
  mapRoute,
  buildLine,
} from './helpers';

// ─── Context type ─────────────────────────────────────────────────────────────

type ShuttleContextType = {
  // New: booking layer
  routes: ShuttleRoute[];
  myBookings: ShuttleBooking[];
  renewalBooking: ShuttleBooking | null;
  // Legacy: trip execution layer (powers boarding / trip-active screens)
  activeLine: ShuttleLine | null;
  allLines: ShuttleLine[];
  stops: ShuttleStop[];
  currentStopIndex: number;
  passengers: BoardingPassenger[];
  loading: boolean;
  listLoading: boolean;
  error: Error | null;
  refetch: () => void;
  nextStop: () => void;
  togglePassenger: (id: string) => void;
  // Auto-cancel notification
  tripCancelledBanner: string | null;
  dismissTripCancelledBanner: () => void;
  // Gap A: optimistic trip ID set immediately when driver taps "Start Trip"
  // (bridges the gap before the backend refetch reflects activeLine.tripId)
  startedTripId: string | null;
  setStartedTripId: (id: string | null) => void;
  // Gap C: ordered lat/lng of each station for the map route polyline
  stationCoords: Array<{ latitude: number; longitude: number }>;
  // Resets all in-trip state (stop index, passengers, startedTripId) after trip completion
  resetTrip: () => void;
  // Real-time slot-released toast (populated by socket event, consumed by layout)
  slotReleasedAlert: SlotReleasedAlert | null;
  dismissSlotReleasedAlert: () => void;
  // Booking cancelled/reassigned notification (SHUTTLE_BOOKING_CANCELLED / SHUTTLE_BOOKING_REASSIGNED)
  bookingStatusBanner: BookingStatusBanner | null;
  dismissBookingStatusBanner: () => void;
};

export const ShuttleContext = createContext<ShuttleContextType>({
  routes: [],
  myBookings: [],
  renewalBooking: null,
  activeLine: null,
  allLines: [],
  stops: [],
  currentStopIndex: 0,
  passengers: [],
  loading: false,
  listLoading: false,
  error: null,
  refetch: () => {},
  nextStop: () => {},
  togglePassenger: () => {},
  tripCancelledBanner: null,
  dismissTripCancelledBanner: () => {},
  startedTripId: null,
  setStartedTripId: () => {},
  stationCoords: [],
  resetTrip: () => {},
  slotReleasedAlert: null,
  dismissSlotReleasedAlert: () => {},
  bookingStatusBanner: null,
  dismissBookingStatusBanner: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ShuttleProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [passengers, setPassengers] = useState<BoardingPassenger[]>([]);
  const [tripCancelledBanner, setTripCancelledBanner] = useState<string | null>(null);
  // Gap A: optimistic tripId stored immediately on Start Trip press
  const [startedTripId, setStartedTripId] = useState<string | null>(null);
  // Real-time slot-released toast state
  const [slotReleasedAlert, setSlotReleasedAlert] = useState<SlotReleasedAlert | null>(null);
  // Booking cancelled/reassigned banner state
  const [bookingStatusBanner, setBookingStatusBanner] = useState<BookingStatusBanner | null>(null);

  // ── AppState: pause polling in background, force-refetch on foreground ───

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasActive = appStateRef.current === 'active';
      const nowActive = nextState === 'active';
      appStateRef.current = nextState;
      setIsAppActive(nowActive);

      if (!wasActive && nowActive) {
        // Returned to foreground — immediately refresh all shuttle state
        queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
        queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
        queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: routesRaw,
    isLoading: routesLoading,
    error: routesError,
    refetch: refetchRoutes,
  } = useQuery({
    queryKey: ['shuttle-lines'],
    queryFn: async () => {
      const raw = await endpoints.shuttle.lines() as unknown;
      return raw;
    },
    refetchInterval: 60000,
    enabled: isAppActive,
  });

  const {
    data: bookingsRaw,
    isLoading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ['shuttle-my-bookings'],
    queryFn: async () => {
      const raw = await endpoints.shuttle.myBookings() as unknown;
      return raw;
    },
    refetchInterval: 20000,
    enabled: isAppActive,
  });

  const refetch = () => {
    refetchRoutes();
    refetchBookings();
  };

  const {
    data: tripsRaw,
    isLoading: tripsLoading,
    error: tripsError,
  } = useQuery({
    queryKey: ['shuttle-driver-trips'],
    queryFn: () => endpoints.trips.list() as Promise<unknown>,
    // No polling — invalidated by socket events (SLOT_TAKEN, SLOT_RELEASED,
    // SHUTTLE_BOOKING_CANCELLED, NOTIFICATION_NEW). Manual refresh via refetch().
  });

  // ── Derived data ─────────────────────────────────────────────────────────

  const backendRoutes: BackendRoute[] = extractRoutes(routesRaw);
  const routes: ShuttleRoute[] = backendRoutes.map(mapRoute);

  const myBookings: ShuttleBooking[] = extractBookings(bookingsRaw);

  const renewalBooking: ShuttleBooking | null =
    myBookings.find(b => b.status === 'pending_renewal') ?? null;

  // Trip execution layer.
  // Trips are grouped by routeId — NOT collapsed to one per route — so a
  // route running both an outbound and a return trip surfaces one
  // ShuttleLine per trip. Each trip keeps buildLine()'s tripId-based
  // identity instead of one trip silently overwriting the other.
  const driverTrips: BackendTrip[] = extractTrips(tripsRaw);
  const tripsByRouteId = new Map<number, BackendTrip[]>();
  for (const trip of driverTrips) {
    const list = tripsByRouteId.get(trip.routeId);
    if (list) list.push(trip);
    else tripsByRouteId.set(trip.routeId, [trip]);
  }

  const allLines: ShuttleLine[] = backendRoutes.flatMap(route => {
    const trips = tripsByRouteId.get(route.id);
    return trips && trips.length > 0
      ? trips.map(trip => buildLine(route, trip))
      : [buildLine(route, undefined)];
  });

  // A route can now have more than one line (outbound + return); this keeps
  // the pre-existing "single active trip drives the map" assumption used by
  // location tracking, which is out of scope for this change.
  const activeLine = allLines.find(l => l.status === 'in-progress') ?? null;

  const activeTripId = activeLine?.tripId;

  // Load per-station passenger lists from GET /driver/trips/:id/stations (NEW endpoint)
  const {
    data: tripStationsRaw,
    isLoading: stationsLoading,
    error: stationsError,
  } = useQuery({
    queryKey: ['shuttle-trip-stations', activeTripId],
    queryFn: () => endpoints.trips.stations(activeTripId!),
    enabled: !!activeTripId && isAppActive,
    refetchInterval: 30000,
  });

  const tripStations: BackendStationWithPassengers[] = extractTripStations(tripStationsRaw);

  // Gap C: ordered lat/lng coordinates for each active route station
  const stationCoords: Array<{ latitude: number; longitude: number }> = tripStations.map(st => ({
    latitude: st.latitude,
    longitude: st.longitude,
  }));

  const stops: ShuttleStop[] = tripStations.map((st, idx) => ({
    id: String(st.id),
    name: st.name,
    address: st.name,
    eta: `Stop ${idx + 1}`,
    boarded: idx === currentStopIndex ? passengers.filter(p => p.checkedIn).length : 0,
    expected: idx === currentStopIndex ? passengers.length : 0,
    status:
      idx < currentStopIndex ? 'completed' : idx === currentStopIndex ? 'arrived' : 'pending',
    // Carried through from the backend station record instead of being
    // discarded — the stations endpoint is already scoped to this trip, so
    // this is preserved for display, not used to re-filter the list.
    direction: st.direction,
  }));

  // Load per-station passengers whenever the active trip stations data or current stop changes.
  // Merges server-reported status (boarded/absent) with any local optimistic updates.
  useEffect(() => {
    if (!tripStations.length || currentStopIndex >= tripStations.length) return;
    const station = tripStations[currentStopIndex];
    const allPassengers = [
      ...station.passengers,
      ...(currentStopIndex === 0 ? (station.unassignedPassengers ?? []) : []),
    ];
    if (allPassengers.length === 0) return;
    setPassengers(prev => {
      const prevMap = new Map(prev.map(p => [p.id, p]));
      return allPassengers.map(sp => {
        const existing = prevMap.get(String(sp.bookingId));
        const method = (sp.paymentMethod ?? '').toLowerCase();
        const paymentMethod: BoardingPassenger['paymentMethod'] =
          method === 'cash' ? 'cash' :
          method === 'card' || method === 'credit' || method === 'credit_card' ? 'card' :
          method === 'online' || method === 'wallet' || method === 'prepaid' ? 'online' :
          'unknown';
        return {
          id: String(sp.bookingId),
          name: sp.userName || 'Passenger',
          avatar: '',
          phone: sp.userPhone || '—',
          ticket: String(sp.bookingId).slice(0, 8).toUpperCase(),
          checkedIn:
            sp.status === 'boarded' ? true :
            sp.status === 'absent' ? false :
            (existing?.checkedIn ?? false),
          luggage: false,
          paymentMethod,
          fareAmount: sp.fareAmount ?? sp.price ?? sp.amount ?? 0,
        };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStationsRaw, currentStopIndex]);

  // ── Socket: shuttle trip events ───────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    // Backend sends trip auto-cancel + shuttle renewal via notification:new
    // with category="trip" or "shuttle_renewal" to the passenger:<userId> room
    const handleNotification = (data?: {
      category?: string;
      title?: string;
      body?: string;
      bookingId?: number;
      deadlineIso?: string;
    }) => {
      if (data?.category === 'trip') {
        // Trip auto-cancelled notification
        const name = data?.title ?? 'A trip';
        setTripCancelledBanner(`${name} — ${data?.body ?? 'was automatically cancelled.'}`);
        queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
        queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      }
      if (data?.category === 'shuttle_renewal' || data?.category === 'shuttle') {
        // Renewal reminder or booking change — refresh bookings
        queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      }
    };

    // Backend sends { bookingId, routeId, reason } — use payload for targeted invalidation.
    // SHUTTLE_BOOKING_CANCELLED: the booking is gone — show cancellation wording.
    const handleShuttleBookingCancelled = (data?: { bookingId?: string | number; routeId?: string | number; reason?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      if (data?.bookingId != null) {
        queryClient.invalidateQueries({ queryKey: ['shuttle-booking-detail', String(data.bookingId)] });
      }
      setBookingStatusBanner({
        type: 'cancelled',
        message: data?.reason
          ? `Your shuttle booking has been cancelled: ${data.reason}`
          : 'Your shuttle booking has been cancelled.',
      });
    };

    // SHUTTLE_BOOKING_REASSIGNED: the booking still exists, moved to a
    // different bus/trip — this is NOT a cancellation and must never use
    // cancellation wording.
    const handleShuttleBookingReassigned = (data?: { bookingId?: string | number; routeId?: string | number; reason?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      if (data?.bookingId != null) {
        queryClient.invalidateQueries({ queryKey: ['shuttle-booking-detail', String(data.bookingId)] });
      }
      setBookingStatusBanner({
        type: 'reassigned',
        message: data?.reason
          ? `Your shuttle booking has been reassigned: ${data.reason}`
          : 'Your shuttle booking has been reassigned to a different trip. Your booking is still active.',
      });
    };

    // Trip crossed the minimum-passenger threshold (pending → active)
    const handleTripStatus = () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
    };

    // Task 3b: SHUTTLE_RENEWAL_CONFIRMED — show success alert + refresh bookings
    const handleRenewalConfirmed = () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      Alert.alert('', 'Your booking for next week has been confirmed');
    };

    // Task 3c: SHUTTLE_BOOKING_CREATED — silent refresh of bookings.
    // Also reused by manual single-trip driver assignment (assign-driver), so
    // refresh the assigned-trip list too — the driver should see a manually
    // assigned trip immediately instead of waiting for the next poll.
    const handleBookingCreated = () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
    };

    // Real-time slot availability: another driver booked a slot
    const handleSlotTaken = (data?: { routeId?: string | number }) => {
      if (data?.routeId != null) {
        queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks', data.routeId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks'] });
      }
    };

    // Real-time slot availability: a slot was freed up
    const handleSlotReleased = (data?: { routeId?: string | number; routeName?: string }) => {
      if (data?.routeId != null) {
        queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks', data.routeId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['shuttle-available-weeks'] });
      }
      if (data?.routeId != null) {
        setSlotReleasedAlert({
          routeId: data.routeId,
          routeName: data.routeName ?? '',
        });
      }
    };

    // Server emits shuttle:state:sync on every connect + reconnect.
    // We call the snapshot endpoint to get fresh bookings + today's trips in one shot,
    // then invalidate the relevant query keys so React Query re-renders with fresh data.
    const handleStateSync = async () => {
      try {
        await endpoints.shuttle.stateSnapshot();
      } catch { /* snapshot is best-effort; polling will recover */ }
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
    };

    // trip:activated fires when the booking threshold is crossed and the trip
    // status flips from pending → active. Refresh both bookings and lines so
    // the trip card shows the updated status immediately.
    const handleTripActivated = () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
    };

    // On socket reconnect after an outage, force-refresh all shuttle state.
    // shuttle:state:sync will also fire on reconnect, but handle 'reconnect' as
    // a belt-and-suspenders fallback in case the server didn't emit it.
    const handleReconnect = () => {
      queryClient.invalidateQueries({ queryKey: ['shuttle-my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-lines'] });
      queryClient.invalidateQueries({ queryKey: ['shuttle-driver-trips'] });
    };

    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotification);
    socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_CANCELLED, handleShuttleBookingCancelled);
    socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED, handleShuttleBookingReassigned);
    socket.on(SOCKET_EVENTS.SHUTTLE_RENEWAL_CONFIRMED, handleRenewalConfirmed);
    socket.on(SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED, handleBookingCreated);
    socket.on(SOCKET_EVENTS.SLOT_TAKEN, handleSlotTaken);
    socket.on(SOCKET_EVENTS.SLOT_RELEASED, handleSlotReleased);
    socket.on(SOCKET_EVENTS.SHUTTLE_TRIP_STATUS, handleTripStatus);
    socket.on(SOCKET_EVENTS.SHUTTLE_STATE_SYNC, handleStateSync);
    socket.on(SOCKET_EVENTS.TRIP_ACTIVATED, handleTripActivated);
    socket.io.on('reconnect', handleReconnect);

    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotification);
      socket.off(SOCKET_EVENTS.SHUTTLE_BOOKING_CANCELLED, handleShuttleBookingCancelled);
      socket.off(SOCKET_EVENTS.SHUTTLE_BOOKING_REASSIGNED, handleShuttleBookingReassigned);
      socket.off(SOCKET_EVENTS.SHUTTLE_RENEWAL_CONFIRMED, handleRenewalConfirmed);
      socket.off(SOCKET_EVENTS.SHUTTLE_BOOKING_CREATED, handleBookingCreated);
      socket.off(SOCKET_EVENTS.SLOT_TAKEN, handleSlotTaken);
      socket.off(SOCKET_EVENTS.SLOT_RELEASED, handleSlotReleased);
      socket.off(SOCKET_EVENTS.SHUTTLE_TRIP_STATUS, handleTripStatus);
      socket.off(SOCKET_EVENTS.SHUTTLE_STATE_SYNC, handleStateSync);
      socket.off(SOCKET_EVENTS.TRIP_ACTIVATED, handleTripActivated);
      socket.io.off('reconnect', handleReconnect);
    };
  }, [socket, queryClient]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const nextStop = () => {
    if (currentStopIndex < stops.length - 1) {
      setCurrentStopIndex(i => i + 1);
      setPassengers(prev => prev.map(p => ({ ...p, checkedIn: false })));
    }
  };

  const togglePassenger = (id: string) => {
    setPassengers(prev =>
      prev.map(p => (p.id === id ? { ...p, checkedIn: !p.checkedIn } : p))
    );
  };

  const dismissTripCancelledBanner = () => setTripCancelledBanner(null);
  const dismissSlotReleasedAlert = () => setSlotReleasedAlert(null);
  const dismissBookingStatusBanner = () => setBookingStatusBanner(null);

  // Gap A + B: resets all in-trip local state after trip completion
  const resetTrip = () => {
    setCurrentStopIndex(0);
    setPassengers([]);
    setStartedTripId(null);
  };

  return (
    <ShuttleContext.Provider
      value={{
        routes,
        myBookings,
        renewalBooking,
        activeLine,
        allLines,
        stops,
        currentStopIndex,
        passengers,
        loading:
          routesLoading || bookingsLoading || tripsLoading || stationsLoading,
        listLoading: routesLoading || bookingsLoading,
        error: (routesError ?? bookingsError) as Error | null,
        refetch,
        nextStop,
        togglePassenger,
        tripCancelledBanner,
        dismissTripCancelledBanner,
        startedTripId,
        setStartedTripId,
        stationCoords,
        resetTrip,
        slotReleasedAlert,
        dismissSlotReleasedAlert,
        bookingStatusBanner,
        dismissBookingStatusBanner,
      }}
    >
      {children}
    </ShuttleContext.Provider>
  );
}

export function useShuttle() {
  return useContext(ShuttleContext);
}
