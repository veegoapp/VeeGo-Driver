import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getToken } from '@/lib/auth';
import { SOCKET_EVENTS } from '../constants/socketEvents';

const _rawApiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!_rawApiUrl) {
  throw new Error(
    '[VeeGo Driver] EXPO_PUBLIC_API_URL is not set. ' +
    'Create a .env file in artifacts/veego-driver/ with:\n' +
    '  EXPO_PUBLIC_API_URL=https://<your-replit-domain>/api'
  );
}
const _apiBase: string = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;
const SOCKET_URL = _apiBase.replace(/\/api\/?$/, '');

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
  onWaitingChargeUpdated?: (charge: WaitingCharge) => void;
  onWaitingChargeCapped?: (charge: WaitingCharge) => void;
  onCheckinRequired?: () => void;
  onCheckinRejected?: () => void;
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
  onWaitingChargeUpdated,
  onWaitingChargeCapped,
  onCheckinRequired,
  onCheckinRejected,
  onSosTriggered,
  onSurgeUpdated,
}: UseRideSocketOptions): UseRideSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onRideOffer);
  callbackRef.current = onRideOffer;

  const offerExpiredRef = useRef(onOfferExpired);
  offerExpiredRef.current = onOfferExpired;

  const waitingChargeUpdatedRef = useRef(onWaitingChargeUpdated);
  waitingChargeUpdatedRef.current = onWaitingChargeUpdated;

  const waitingChargeCappedRef = useRef(onWaitingChargeCapped);
  waitingChargeCappedRef.current = onWaitingChargeCapped;

  const checkinRequiredRef = useRef(onCheckinRequired);
  checkinRequiredRef.current = onCheckinRequired;

  const checkinRejectedRef = useRef(onCheckinRejected);
  checkinRejectedRef.current = onCheckinRejected;

  const sosTriggedRef = useRef(onSosTriggered);
  sosTriggedRef.current = onSosTriggered;

  const surgeUpdatedRef = useRef(onSurgeUpdated);
  surgeUpdatedRef.current = onSurgeUpdated;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!driverId) return;

    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (cancelled) return;

      const { io } = await import('socket.io-client');

      const socket = io(SOCKET_URL, {
        path: '/api/socket.io',
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket.emit(SOCKET_EVENTS.JOIN, `driver:${driverId}`);
      });

      socket.on('disconnect', (reason: string) => {
        setConnected(false);
        console.warn('[RideSocket] disconnected:', reason);
      });

      socket.on('connect_error', (err: Error) => {
        setConnected(false);
        console.error('[RideSocket] connect_error:', err.message);
      });

      socket.on(SOCKET_EVENTS.RIDE_OFFER, (ride: RideRequest) => {
        callbackRef.current(ride);
      });

      socket.on(SOCKET_EVENTS.RIDE_OFFER_EXPIRED, (data: { rideId?: string } | string) => {
        const rideId = typeof data === 'string' ? data : (data?.rideId ?? '');
        offerExpiredRef.current?.(rideId);
      });

      socket.on(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, (charge: WaitingCharge) => {
        waitingChargeUpdatedRef.current?.(charge);
      });

      socket.on(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, (charge: WaitingCharge) => {
        waitingChargeCappedRef.current?.(charge);
      });

      socket.on(SOCKET_EVENTS.DRIVER_CHECKIN_REQUIRED, () => {
        checkinRequiredRef.current?.();
      });

      socket.on(SOCKET_EVENTS.DRIVER_CHECKIN_REJECTED, () => {
        checkinRejectedRef.current?.();
      });

      socket.on(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, (data: unknown) => {
        console.warn('[RideSocket] service:control:changed', data);
      });

      socket.on(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, (data: unknown) => {
        console.warn('[RideSocket] service:settings:changed', data);
      });

      socket.on(SOCKET_EVENTS.SURGE_UPDATED, (data: unknown) => {
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
      });

      socket.on(SOCKET_EVENTS.SOS_TRIGGERED, (data: unknown) => {
        sosTriggedRef.current?.(data);
        console.warn('[RideSocket] sos:triggered', data);
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [driverId]);

  return { connected };
}
