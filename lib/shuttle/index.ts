// Public barrel — re-exports the same symbols that lib/shuttleContext.tsx
// previously exported directly. Internal helpers and backend shapes are
// intentionally NOT re-exported here.

export type {
  ShuttleTimeslot,
  ShuttleRoute,
  ShuttleBooking,
  ShuttleStop,
  VehicleType,
  ShuttleLine,
  BoardingPassenger,
  SlotReleasedAlert,
  BookingStatusBanner,
} from './types';

export { ShuttleContext, ShuttleProvider, useShuttle } from './ShuttleContext';
