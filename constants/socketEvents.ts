/**
 * Socket event name constants for the driver app.
 * Mirrors artifacts/api-server/src/lib/socket-events.ts — keep in sync.
 */

export const SOCKET_EVENTS = {
  // Server → Driver: ride lifecycle
  RIDE_OFFER:               "ride:offer",
  /* unused — reserved for future */
  RIDE_NEW_REQUEST:         "ride:new_request",
  RIDE_OFFER_EXPIRED:       "ride:offer_expired",

  // Server → Driver: waiting charge
  WAITING_CHARGE_STARTED:   "ride:waiting:charge:started",
  WAITING_CHARGE_UPDATED:   "ride:waiting:charge:updated",
  WAITING_CHARGE_CAPPED:    "ride:waiting:charge:capped",

  // Server → Driver: check-in (on-demand)
  DRIVER_CHECKIN_REQUIRED:  "driver:checkin:required",
  DRIVER_CHECKIN_REJECTED:  "driver:checkin:rejected",
  DRIVER_CHECKIN_APPROVED:  "driver:checkin:approved",

  // Server → Driver: shuttle check-in (Fix 2)
  SHUTTLE_CHECKIN_REQUIRED: "shuttle:checkin:required",

  // Server → Driver: shuttle station timeout (Fix 3)
  SHUTTLE_STATION_TIMEOUT:  "shuttle:station:timeout",

  // Server → Driver: cooldown
  DRIVER_COOLDOWN_CLEARED:  "driver:cooldown:cleared",

  // Server → Driver: ride no longer available
  RIDE_NO_LONGER_AVAILABLE: "ride:no_longer_available",

  // Server → Driver: service control
  SERVICE_CONTROL_CHANGED:  "service:control:changed",
  SERVICE_SETTINGS_CHANGED: "service:settings:changed",

  /* unused — reserved for future */
  DRIVER_LOCATION_ACK:      "driver:location:ack",

  // Server → Driver: surge
  SURGE_UPDATED:            "surge:updated",

  // Server → Driver: SOS
  SOS_TRIGGERED:            "sos:triggered",

  // Server → Driver: shuttle booking events (sent to driver:<userId> room)
  SHUTTLE_BOOKING_CREATED:    "shuttle:booking:created",
  SHUTTLE_BOOKING_CANCELLED:  "shuttle:booking:cancelled",
  SHUTTLE_BOOKING_REASSIGNED: "shuttle:booking:reassigned",
  SHUTTLE_RENEWAL_CONFIRMED:  "shuttle:renewal:confirmed",

  // Server → All Drivers: real-time slot availability (broadcast to "drivers" room)
  SLOT_TAKEN:                 "slot_taken",
  SLOT_RELEASED:              "slot_released",

  // TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners
  // Server → Driver 2: a colleague (Driver 1) has submitted a trip-referral request
  // Payload: IncomingReferralPayload (see lib/referralContext.tsx)
  SHUTTLE_INCOMING_REFERRAL:  "shuttle:referral:incoming",
  // Server → Driver 2: Driver 1 has cancelled or withdrawn the referral request before Driver 2 responded
  SHUTTLE_REFERRAL_CANCELLED: "shuttle:referral:cancelled",

  // Server → Driver: real-time seat count update for active shuttle trip
  BOOKING_PASSENGER_UPDATED: "booking:passenger_updated",

  // Server → Driver/User: notifications
  NOTIFICATION_NEW:         "notification:new",

  // Server → Driver: misc
  ERROR:                    "error",

  // Client → Server
  JOIN:                     "join",
  /* unused — reserved for future */
  DRIVER_STATUS_ONLINE:     "driver:status:online",
  /* unused — reserved for future */
  DRIVER_STATUS_OFFLINE:    "driver:status:offline",
  /* unused — reserved for future */
  DRIVER_STATUS_BUSY:       "driver:status:busy",
  DRIVER_LOCATION_UPDATE:   "driver:location:update",
  /* unused — reserved for future */
  DRIVER_TRIP_START:        "driver:trip:start",
  /* unused — reserved for future */
  DRIVER_TRIP_COMPLETE:     "driver:trip:complete",
} as const;

export type DriverSocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
