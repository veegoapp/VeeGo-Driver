/**
 * Socket event name constants for the driver app.
 * Mirrors artifacts/api-server/src/lib/socket-events.ts — keep in sync.
 */

export const SOCKET_EVENTS = {
  // Server → Driver: ride lifecycle
  RIDE_OFFER:               "ride:offer",
  RIDE_NEW_REQUEST:         "ride:new_request",
  RIDE_OFFER_EXPIRED:       "ride:offer_expired",

  // Server → Driver: waiting charge
  WAITING_CHARGE_STARTED:   "ride:waiting:charge:started",
  WAITING_CHARGE_UPDATED:   "ride:waiting:charge:updated",
  WAITING_CHARGE_CAPPED:    "ride:waiting:charge:capped",

  // Server → Driver: check-in
  DRIVER_CHECKIN_REQUIRED:  "driver:checkin:required",
  DRIVER_CHECKIN_REJECTED:  "driver:checkin:rejected",
  DRIVER_CHECKIN_APPROVED:  "driver:checkin:approved",

  // Server → Driver: cooldown
  DRIVER_COOLDOWN_CLEARED:  "driver:cooldown:cleared",

  // Server → Driver: ride no longer available
  RIDE_NO_LONGER_AVAILABLE: "ride:no_longer_available",

  // Server → Driver: service control
  SERVICE_CONTROL_CHANGED:  "service:control:changed",
  SERVICE_SETTINGS_CHANGED: "service:settings:changed",

  // Server → Driver: location ack
  DRIVER_LOCATION_ACK:      "driver:location:ack",

  // Server → Driver: surge
  SURGE_UPDATED:            "surge:updated",

  // Server → Driver: SOS
  SOS_TRIGGERED:            "sos:triggered",

  // Server → Driver: shuttle bookings
  SHUTTLE_BOOKING_CREATED:   "shuttle:booking:created",
  SHUTTLE_BOOKING_CANCELLED:  "shuttle:booking:cancelled",
  SHUTTLE_RENEWAL_CONFIRMED:  "shuttle:renewal:confirmed",
  SHUTTLE_BOOKING_REASSIGNED: "shuttle:booking:reassigned",

  // Server → Driver: misc
  ERROR:                    "error",

  // Client → Server
  JOIN:                     "join",
} as const;

export type DriverSocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
