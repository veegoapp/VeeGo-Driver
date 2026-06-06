/**
 * Socket event name constants for the driver app.
 * Mirrors artifacts/api-server/src/lib/socket-events.ts — keep in sync.
 */

export const SOCKET_EVENTS = {
  // Server → Driver
  RIDE_OFFER:             "ride:offer",
  RIDE_NEW_REQUEST:       "ride:new_request",
  ERROR:                  "error",

  // Client → Server
  DRIVER_LOCATION_UPDATE: "driver:location:update",
  DRIVER_RIDE_LOCATION:   "driver:ride:location",
  DRIVER_STATUS_ONLINE:   "driver:status:online",
  DRIVER_STATUS_OFFLINE:  "driver:status:offline",
  DRIVER_STATUS_BUSY:     "driver:status:busy",
  DRIVER_TRIP_START:      "driver:trip:start",
  DRIVER_TRIP_COMPLETE:   "driver:trip:complete",
  JOIN:                   "join",
} as const;

export type DriverSocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
