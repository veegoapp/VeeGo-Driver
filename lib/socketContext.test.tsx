import React from 'react';
import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { SocketProvider, useSocket } from './socketContext';

jest.mock('./authContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./auth', () => ({
  getToken: jest.fn().mockResolvedValue('fresh-token'),
}));

jest.mock('socket.io-client', () => {
  const created: any[] = [];
  return {
    io: jest.fn((url: string, opts: any) => {
      const listeners = new Map<string, Set<any>>();
      const socket = {
        connected: false,
        connect: jest.fn(function (this: any) { this.connected = true; }),
        disconnect: jest.fn(function (this: any) { this.connected = false; }),
        emit: jest.fn(),
        on: (event: string, cb: any) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(cb);
        },
        off: (event: string, cb: any) => { listeners.get(event)?.delete(cb); },
        __emit: (event: string, ...args: any[]) => { listeners.get(event)?.forEach((cb) => cb(...args)); },
        __opts: opts,
        __url: url,
      };
      created.push(socket);
      return socket;
    }),
    __created: created,
    __reset: () => { created.length = 0; },
  };
});

const { useAuth } = jest.requireMock('./authContext');
const socketIoMock = jest.requireMock('socket.io-client');

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  });
}

let currentUnmount: (() => Promise<void>) | null = null;
let appStateListeners: ((state: string) => void)[] = [];

function emitAppState(state: string) {
  appStateListeners.forEach((cb) => cb(state));
}

async function setupHook() {
  const rendered = await renderHook(() => useSocket(), {
    wrapper: ({ children }) => <SocketProvider>{children}</SocketProvider>,
  });
  currentUnmount = rendered.unmount;
  return rendered;
}

describe('SocketContext (driver)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    socketIoMock.__reset();
    useAuth.mockReturnValue({ token: null, isLoading: false });
    appStateListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, cb: any) => {
      if (event === 'change') appStateListeners.push(cb);
      return { remove: jest.fn(() => { appStateListeners = appStateListeners.filter((l) => l !== cb); }) } as any;
    });
  });

  afterEach(async () => {
    if (currentUnmount) {
      await act(async () => { await currentUnmount!(); });
      currentUnmount = null;
    }
    jest.useRealTimers();
  });

  it('does not create a socket while unauthenticated', async () => {
    const { result } = await setupHook();
    await flush();

    expect(socketIoMock.io).not.toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
    expect(result.current.connected).toBe(false);
  });

  it('waits for auth to resolve before connecting', async () => {
    useAuth.mockReturnValue({ token: null, isLoading: true });
    const { result } = await setupHook();
    await flush();

    expect(socketIoMock.io).not.toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
  });

  it('creates a socket once authenticated and reflects connect/disconnect events', async () => {
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
    const { result } = await setupHook();
    await flush();

    expect(socketIoMock.io).toHaveBeenCalledTimes(1);
    const [socket] = socketIoMock.__created;
    expect(result.current.socket).toBe(socket);
    expect(result.current.connected).toBe(false);

    await act(async () => { socket.__emit('connect'); });
    expect(result.current.connected).toBe(true);

    await act(async () => { socket.__emit('disconnect'); });
    expect(result.current.connected).toBe(false);
  });

  it('fetches a fresh token on every (re)connection attempt via the auth callback, not a captured value', async () => {
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
    await setupHook();
    await flush();

    const [socket] = socketIoMock.__created;
    const authFn = socket.__opts.auth;
    const cb = jest.fn();
    await act(async () => { await authFn(cb); });

    expect(cb).toHaveBeenCalledWith({ token: 'fresh-token' });
  });

  it('disconnects and clears the socket when the token disappears (logout)', async () => {
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
    const { result, rerender } = await setupHook();
    await flush();

    const [socket] = socketIoMock.__created;
    expect(result.current.socket).toBe(socket);

    useAuth.mockReturnValue({ token: null, isLoading: false });
    await act(async () => { rerender(undefined); });

    expect(socket.disconnect).toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
    expect(result.current.connected).toBe(false);
  });

  it('reconnects a disconnected socket when the app returns to the foreground', async () => {
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
    await setupHook();
    await flush();

    const [socket] = socketIoMock.__created;
    socket.connected = false;

    await act(async () => { emitAppState('active'); });

    expect(socket.connect).toHaveBeenCalled();
  });

  it('does not force-reconnect an already-connected socket on foreground', async () => {
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
    await setupHook();
    await flush();

    const [socket] = socketIoMock.__created;
    socket.connected = true;

    await act(async () => { emitAppState('active'); });

    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('emits a driver:heartbeat every 30s while connected, and stops after disconnect', async () => {
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
    const { result } = await setupHook();
    await flush();

    const [socket] = socketIoMock.__created;
    await act(async () => { socket.__emit('connect'); });
    expect(result.current.connected).toBe(true);

    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(socket.emit).toHaveBeenCalledWith('driver:heartbeat');

    socket.emit.mockClear();
    await act(async () => { socket.__emit('disconnect'); });
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(socket.emit).not.toHaveBeenCalledWith('driver:heartbeat');
  });
});
