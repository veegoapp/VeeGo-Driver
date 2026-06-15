import React, { useReducer } from 'react';
import { ShuttleContext } from '@/lib/shuttleContext';
import type { ShuttleStop, BoardingPassenger } from '@/lib/shuttleContext';
import {
  DEMO_LINE,
  DEMO_BOOKING,
  DEMO_ROUTE,
  DEMO_STOPS_TEMPLATE,
  DEMO_PASSENGERS_TEMPLATE,
  DEMO_STATION_COORDS,
} from './mockData';
import { demoReducer, DEMO_INITIAL_STATE } from './demoEngine';

// Provides a fully mock ShuttleContext value.
// The value shape is identical to ShuttleContextType — screens call useShuttle()
// and receive this mock data without any knowledge of demo mode.
export function DemoShuttleProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, DEMO_INITIAL_STATE);

  // ── Passengers for the current stop (checkedIn driven by reducer) ──────────
  const checkedInMap = state.checkedInByStop[state.currentStopIndex] ?? {};
  const passengers: BoardingPassenger[] = (
    DEMO_PASSENGERS_TEMPLATE[state.currentStopIndex] ?? []
  ).map(p => ({ ...p, checkedIn: checkedInMap[p.id] ?? false }));

  // ── Stops computed to exactly match the real ShuttleProvider derivation ────
  const stops: ShuttleStop[] = DEMO_STOPS_TEMPLATE.map((template, idx) => ({
    ...template,
    boarded:
      idx === state.currentStopIndex
        ? passengers.filter(p => p.checkedIn).length
        : 0,
    expected:
      idx === state.currentStopIndex ? passengers.length : 0,
    status:
      idx < state.currentStopIndex
        ? 'completed'
        : idx === state.currentStopIndex
        ? 'arrived'
        : 'pending',
  }));

  return (
    <ShuttleContext.Provider
      value={{
        routes: [DEMO_ROUTE],
        myBookings: [DEMO_BOOKING],
        renewalBooking: null,
        activeLine: DEMO_LINE,
        allLines: [DEMO_LINE],
        stops,
        currentStopIndex: state.currentStopIndex,
        passengers,
        loading: false,
        listLoading: false,
        error: null,
        refetch: () => {},
        nextStop: () => dispatch({ type: 'NEXT_STOP' }),
        togglePassenger: (id: string) =>
          dispatch({
            type: 'TOGGLE_PASSENGER',
            id,
            stopIndex: state.currentStopIndex,
          }),
        tripCancelledBanner: null,
        dismissTripCancelledBanner: () => {},
        startedTripId: null,
        setStartedTripId: () => {},
        stationCoords: DEMO_STATION_COORDS,
        resetTrip: () => dispatch({ type: 'RESET' }),
        slotReleasedAlert: null,
        dismissSlotReleasedAlert: () => {},
      }}
    >
      {children}
    </ShuttleContext.Provider>
  );
}
