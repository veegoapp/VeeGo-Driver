import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';
import { useAuth } from './authContext';
import { getToken } from './auth';
import { SOCKET_EVENTS } from '@/constants/socketEvents';

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
      if (cancelledRef.current) return;

      const { io } = await import('socket.io-client');

      const socket = io(SOCKET_URL, {
        path: '/api/socket.io',
        // Fetch the freshest token on EVERY (re)connection attempt instead of
        // capturing one token at creation time. The access token lives only
        // ~10 minutes, and socket.io reuses the initial `auth` for all of its
        // own built-in reconnections — so a static token that expired mid-ride
        // made every reconnect fail auth ("Invalid token"), and with a capped
        // reconnectionAttempts the socket died permanently. Once the driver's
        // socket stays dead past the backend's 30s disconnect grace, the ride
        // is released and the passenger is told "your driver disconnected" —
        // which is what made the passenger's notification bar buzz mid-ride.
        // As a function, `auth` is re-invoked before each attempt and picks up
        // the token the REST layer's 401→refresh flow rotated into storage.
        auth: async (cb: (data: Record<string, unknown>) => void) => {
          try {
            const fresh = await getToken();
            cb(fresh ? { token: fresh } : {});
          } catch {
            cb({});
          }
        },
        transports: ['polling', 'websocket'],
        reconnection: true,
        // Never permanently give up. Combined with the fresh-token `auth`
        // above, the socket keeps retrying with backoff and self-heals as soon
        // as a valid token / working network is available, instead of freezing
        // dead after 10 stale-token failures.
        reconnectionAttempts: Infinity,
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

      socket.on(SOCKET_EVENTS.CONNECT, () => {
        setConnected(true);
      });

      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        setConnected(false);
      });

      socket.on('connect_error', (err) => {
        // Connection error — socket.io will retry automatically per reconnectionAttempts config.
        if (__DEV__) console.warn('[Socket] connect_error:', err?.message ?? err);
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

  // Reconnect socket when the app returns to the foreground after being
  // backgrounded or suspended. The OS may have dropped the TCP connection.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const s = socketRef.current;
        if (s && !s.connected) {
          s.connect();
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Emit driver:heartbeat every 30 s while the socket is connected.
  // The interval is cleared automatically when the socket disconnects or
  // the component unmounts (return cleanup), preventing duplicate timers.
  useEffect(() => {
    if (!connected || !socketInstance) return;
    const id = setInterval(() => {
      socketInstance.emit(SOCKET_EVENTS.DRIVER_HEARTBEAT);
    }, 30_000);
    return () => clearInterval(id);
  }, [connected, socketInstance]);

  const value = useMemo(() => ({ socket: socketInstance, connected }), [socketInstance, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
