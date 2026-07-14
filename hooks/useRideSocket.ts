import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '../constants/socketEvents';
import type { CheckinRequiredPayload } from '@/lib/checkinDeadline';
import type { WaitingCharge, SurgeZone } from '@/lib/types';
export type { WaitingCharge, SurgeZone } from '@/lib/types';

const RideOfferSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.string().optional(),
  rider: z.object({ name: z.string(), rating: z.number(), avatar: z.string().optional() }),
  pickup: z.object({ address: z.string(), distance: z.string().optional(), eta: z.string().optional() }),
  dropoff: z.object({ address: z.string(), distance: z.string().optional() }),
  fare: z.number().optional(),
  payment: z.string().optional(),
  duration: z.string().optional(),
}).passthrough();

const OfferExpiredSchema = z.union([
  z.string(),
  z.object({ rideId: z.string().optional() }).passthrough(),
]);

const WaitingChargeSchema = z.object({
  rideId: z.string(),
  amount: z.number(),
  minutes: z.number(),
  capped: z.boolean().optional(),
});

const SurgeSchema = z.union([
  z.array(z.object({
    id: z.string(), latitude: z.number(), longitude: z.number(),
    radius: z.number(), multiplier: z.number(),
  }).passthrough()),
  z.object({ zones: z.array(z.any()).optional() }).passthrough(),
  z.object({ latitude: z.number(), longitude: z.number(), radius: z.number(), multiplier: z.number() }).passthrough(),
]);

export type RideRequest = {
  id: string;
  type?: string;
  rider: { name: string; rating: number; avatar?: string };
  pickup: { address: string; distance?: string; eta?: string };
  dropoff: { address: string; distance?: string };
  fare?: number;
  payment?: string;
  duration?: string;
  [key: string]: unknown;
};

type UseRideSocketOptions = {
  driverId: string | undefined;
  onRideOffer: (ride: RideRequest) => void;
  onOfferExpired?: (rideId: string) => void;
  onRideNoLongerAvailable?: () => void;
  onWaitingChargeUpdated?: (charge: WaitingCharge) => void;
  onWaitingChargeCapped?: (charge: WaitingCharge) => void;
  onCheckinRequired?: (data: CheckinRequiredPayload) => void;
  onCheckinRejected?: () => void;
  onCheckinApproved?: () => void;
  onCooldownCleared?: () => void;
  onSosTriggered?: (data: unknown) => void;
  onSurgeUpdated?: (zones: SurgeZone[]) => void;
};

type UseRideSocketResult = {
  connected: boolean;
};

export function useRideSocket({
  driverId,
  onRideOffer,
  onOfferExpired,
  onRideNoLongerAvailable,
  onWaitingChargeUpdated,
  onWaitingChargeCapped,
  onCheckinRequired,
  onCheckinRejected,
  onCheckinApproved,
  onCooldownCleared,
  onSosTriggered,
  onSurgeUpdated,
}: UseRideSocketOptions): UseRideSocketResult {
  const { socket, connected } = useSocket();

  // Stable callback refs — updated every render so handlers always see current closures
  const callbackRef = useRef(onRideOffer);
  callbackRef.current = onRideOffer;
  const offerExpiredRef = useRef(onOfferExpired);
  offerExpiredRef.current = onOfferExpired;
  const rideNoLongerAvailableRef = useRef(onRideNoLongerAvailable);
  rideNoLongerAvailableRef.current = onRideNoLongerAvailable;
  const waitingChargeUpdatedRef = useRef(onWaitingChargeUpdated);
  waitingChargeUpdatedRef.current = onWaitingChargeUpdated;
  const waitingChargeCappedRef = useRef(onWaitingChargeCapped);
  waitingChargeCappedRef.current = onWaitingChargeCapped;
  const checkinRequiredRef = useRef(onCheckinRequired);
  checkinRequiredRef.current = onCheckinRequired;
  const checkinRejectedRef = useRef(onCheckinRejected);
  checkinRejectedRef.current = onCheckinRejected;
  const checkinApprovedRef = useRef(onCheckinApproved);
  checkinApprovedRef.current = onCheckinApproved;
  const cooldownClearedRef = useRef(onCooldownCleared);
  cooldownClearedRef.current = onCooldownCleared;
  const sosTriggedRef = useRef(onSosTriggered);
  sosTriggedRef.current = onSosTriggered;
  const surgeUpdatedRef = useRef(onSurgeUpdated);
  surgeUpdatedRef.current = onSurgeUpdated;

  // No-op: the backend already auto-joins the driver's personal room on every
  // connect/reconnect from the auth handshake, so no join emit is needed here.
  useEffect(() => {
    if (!socket) return;

    const joinRoom = async () => {};

    const onConnect = () => { joinRoom(); };

    if (connected) {
      joinRoom();
    }

    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, connected]);

  // Attach ride-specific event handlers to the shared socket
  useEffect(() => {
    if (!socket) return;

    const handleRideOffer = (raw: unknown) => {
      const parsed = RideOfferSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.RIDE_OFFER} payload`, parsed.error.issues);
        return;
      }
      callbackRef.current(parsed.data as RideRequest);
    };

    const handleOfferExpired = (raw: unknown) => {
      const parsed = OfferExpiredSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.RIDE_OFFER_EXPIRED} payload`, parsed.error.issues);
        return;
      }
      const data = parsed.data;
      const rideId = typeof data === 'string' ? data : (data?.rideId ?? '');
      offerExpiredRef.current?.(rideId);
    };

    const handleRideNoLongerAvailable = () => {
      rideNoLongerAvailableRef.current?.();
    };

    const handleWaitingChargeUpdated = (raw: unknown) => {
      const parsed = WaitingChargeSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.WAITING_CHARGE_UPDATED} payload`, parsed.error.issues);
        return;
      }
      waitingChargeUpdatedRef.current?.(parsed.data);
    };

    const handleWaitingChargeCapped = (raw: unknown) => {
      const parsed = WaitingChargeSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.WAITING_CHARGE_CAPPED} payload`, parsed.error.issues);
        return;
      }
      waitingChargeCappedRef.current?.(parsed.data);
    };

    const handleCheckinRequired = (raw: unknown) => {
      const data = (raw && typeof raw === 'object' ? raw : {}) as CheckinRequiredPayload;
      checkinRequiredRef.current?.(data);
    };

    const handleCheckinRejected = () => {
      checkinRejectedRef.current?.();
    };

    const handleCheckinApproved = () => {
      checkinApprovedRef.current?.();
    };

    const handleCooldownCleared = () => {
      cooldownClearedRef.current?.();
    };

    const handleSurgeUpdated = (raw: unknown) => {
      const parsed = SurgeSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.SURGE_UPDATED} payload`, parsed.error.issues);
        return;
      }
      const data = parsed.data;
      let zones: SurgeZone[];
      if (Array.isArray(data)) {
        zones = data as SurgeZone[];
      } else if (data && typeof data === 'object' && 'zones' in data) {
        zones = ((data as { zones?: SurgeZone[] }).zones) ?? [];
      } else if (data && typeof data === 'object' && 'latitude' in data) {
        zones = [data as unknown as SurgeZone];
      } else {
        zones = [];
      }
      surgeUpdatedRef.current?.(zones);
    };

    const handleSosTriggered = (data: unknown) => {
      sosTriggedRef.current?.(data);
    };

    socket.on(SOCKET_EVENTS.RIDE_OFFER, handleRideOffer);
    socket.on(SOCKET_EVENTS.RIDE_OFFER_EXPIRED, handleOfferExpired);
    socket.on(SOCKET_EVENTS.RIDE_NO_LONGER_AVAILABLE, handleRideNoLongerAvailable);
    socket.on(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, handleWaitingChargeUpdated);
    socket.on(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, handleWaitingChargeCapped);
    socket.on(SOCKET_EVENTS.DRIVER_CHECKIN_REQUIRED, handleCheckinRequired);
    socket.on(SOCKET_EVENTS.DRIVER_CHECKIN_REJECTED, handleCheckinRejected);
    socket.on(SOCKET_EVENTS.DRIVER_CHECKIN_APPROVED, handleCheckinApproved);
    socket.on(SOCKET_EVENTS.DRIVER_COOLDOWN_CLEARED, handleCooldownCleared);
    socket.on(SOCKET_EVENTS.SURGE_UPDATED, handleSurgeUpdated);
    socket.on(SOCKET_EVENTS.SOS_TRIGGERED, handleSosTriggered);

    return () => {
      socket.off(SOCKET_EVENTS.RIDE_OFFER, handleRideOffer);
      socket.off(SOCKET_EVENTS.RIDE_OFFER_EXPIRED, handleOfferExpired);
      socket.off(SOCKET_EVENTS.RIDE_NO_LONGER_AVAILABLE, handleRideNoLongerAvailable);
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, handleWaitingChargeUpdated);
      socket.off(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, handleWaitingChargeCapped);
      socket.off(SOCKET_EVENTS.DRIVER_CHECKIN_REQUIRED, handleCheckinRequired);
      socket.off(SOCKET_EVENTS.DRIVER_CHECKIN_REJECTED, handleCheckinRejected);
      socket.off(SOCKET_EVENTS.DRIVER_CHECKIN_APPROVED, handleCheckinApproved);
      socket.off(SOCKET_EVENTS.DRIVER_COOLDOWN_CLEARED, handleCooldownCleared);
      socket.off(SOCKET_EVENTS.SURGE_UPDATED, handleSurgeUpdated);
      socket.off(SOCKET_EVENTS.SOS_TRIGGERED, handleSosTriggered);
    };
  }, [socket]);

  return { connected };
}
