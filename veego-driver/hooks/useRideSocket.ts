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

type UseRideSocketOptions = {
  driverId: string | undefined;
  onRideOffer: (ride: RideRequest) => void;
};

type UseRideSocketResult = {
  connected: boolean;
};

export function useRideSocket({ driverId, onRideOffer }: UseRideSocketOptions): UseRideSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onRideOffer);
  callbackRef.current = onRideOffer;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!driverId) return;

    let cancelled = false;
    let locationInterval: ReturnType<typeof setInterval> | null = null;

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
    })();

    return () => {
      cancelled = true;
      if (locationInterval !== null) {
        clearInterval(locationInterval);
        locationInterval = null;
      }
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [driverId]);

  return { connected };
}
