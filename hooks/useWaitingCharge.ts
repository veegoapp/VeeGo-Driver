import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getToken } from '@/lib/auth';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

const _rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const _apiBase: string = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;
const SOCKET_URL = _apiBase.replace(/\/api\/?$/, '');

export type WaitingCharge = {
  rideId: string;
  amount: number;
  minutes: number;
  capped?: boolean;
};

export function useWaitingCharge(
  driverId: string | undefined,
  rideId: string | undefined,
): WaitingCharge | null {
  const socketRef = useRef<Socket | null>(null);
  const [charge, setCharge] = useState<WaitingCharge | null>(null);

  useEffect(() => {
    if (!driverId || !rideId || !SOCKET_URL) return;
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
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit(SOCKET_EVENTS.JOIN, `driver:${driverId}`);
      });

      socket.on(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, (c: WaitingCharge) => {
        if (c.rideId === rideId) setCharge(c);
      });

      socket.on(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, (c: WaitingCharge) => {
        if (c.rideId === rideId) setCharge({ ...c, capped: true });
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [driverId, rideId]);

  return charge;
}
