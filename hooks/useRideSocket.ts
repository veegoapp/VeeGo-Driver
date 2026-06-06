import { useEffect, useRef } from 'react';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '../constants/socketEvents';

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

export type WaitingCharge = {
  rideId: string;
  amount: number;
  minutes: number;
  capped?: boolean;
};

export type SurgeZone = {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  multiplier: number;
};

type UseRideSocketOptions = {
  driverId: string | undefined;
  onRideOffer: (ride: RideRequest) => void;
  onOfferExpired?: (rideId: string) => void;
  onRideNoLongerAvailable?: () => void;
  onWaitingChargeUpdated?: (charge: WaitingCharge) => void;
  onWaitingChargeCapped?: (charge: WaitingCharge) => void;
  onCheckinRequired?: () => void;
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

  // JOIN the driver room whenever the shared socket connects (or reconnects)
  useEffect(() => {
    if (!socket || !driverId) return;

    const onConnect = () => {
      socket.emit(SOCKET_EVENTS.JOIN, `driver:${driverId}`);
    };

    // If already connected, join immediately
    if (connected) {
      socket.emit(SOCKET_EVENTS.JOIN, `driver:${driverId}`);
    }

    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, driverId, connected]);

  // Attach ride-specific event handlers to the shared socket
  useEffect(() => {
    if (!socket) return;

    const handleRideOffer = (ride: RideRequest) => {
      callbackRef.current(ride);
    };

    const handleOfferExpired = (data: { rideId?: string } | string) => {
      const rideId = typeof data === 'string' ? data : (data?.rideId ?? '');
      offerExpiredRef.current?.(rideId);
    };

    const handleRideNoLongerAvailable = () => {
      rideNoLongerAvailableRef.current?.();
    };

    const handleWaitingChargeUpdated = (charge: WaitingCharge) => {
      waitingChargeUpdatedRef.current?.(charge);
    };

    const handleWaitingChargeCapped = (charge: WaitingCharge) => {
      waitingChargeCappedRef.current?.(charge);
    };

    const handleCheckinRequired = () => {
      checkinRequiredRef.current?.();
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

    const handleSurgeUpdated = (data: unknown) => {
      let zones: SurgeZone[];
      if (Array.isArray(data)) {
        zones = data as SurgeZone[];
      } else if (data && typeof data === 'object' && 'zones' in data) {
        zones = (data as { zones: SurgeZone[] }).zones ?? [];
      } else if (data && typeof data === 'object' && 'latitude' in data) {
        zones = [data as SurgeZone];
      } else {
        zones = [];
      }
      surgeUpdatedRef.current?.(zones);
    };

    const handleSosTriggered = (data: unknown) => {
      sosTriggedRef.current?.(data);
      console.warn('[RideSocket] sos:triggered', data);
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
