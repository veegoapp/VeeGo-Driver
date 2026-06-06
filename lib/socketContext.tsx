import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from './authContext';
import { getToken } from './auth';

const _rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const _apiBase = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;
const SOCKET_URL = _apiBase.replace(/\/api\/?$/, '');

type SocketContextValue = {
  socket: Socket | null;
  connected: boolean;
};

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, isLoading: authIsLoading } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const cancelledRef = useRef(false);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (authIsLoading || !token || !SOCKET_URL) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      setConnected(false);
      return;
    }

    cancelledRef.current = false;

    (async () => {
      const t = await getToken();
      if (cancelledRef.current) return;

      const { io } = await import('socket.io-client');

      const socket = io(SOCKET_URL, {
        path: '/api/socket.io',
        auth: { token: t },
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
      });

      if (cancelledRef.current) {
        socket.disconnect();
        return;
      }

      socketRef.current = socket;
      setSocketInstance(socket);

      socket.on('connect', () => {
        console.log('[SOCKET_CONNECT] id:', socket.id);
        console.log('[SOCKET_SHARED_INSTANCE] single shared connection active');
        setConnected(true);
      });

      socket.on('disconnect', (reason: string) => {
        console.log('[SOCKET_DISCONNECT] reason:', reason);
        setConnected(false);
      });

      socket.on('reconnect', (attempt: number) => {
        console.log('[SOCKET_RECONNECT] attempt:', attempt);
        setConnected(true);
      });

      socket.on('connect_error', (err: Error) => {
        console.warn('[SOCKET] connect_error:', err.message);
      });
    })();

    return () => {
      cancelledRef.current = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      setConnected(false);
    };
  }, [token, authIsLoading]);

  const value = useMemo(() => ({ socket: socketInstance, connected }), [socketInstance, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
