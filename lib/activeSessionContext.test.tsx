import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ActiveSessionProvider, useActiveSession } from './activeSessionContext';

// Self-contained fake socket + useSocket() mock. Built entirely inside the
// factory (per babel-plugin-jest-hoist's out-of-scope-variable restriction)
// and driven from tests via the __setSocket/__reset escape hatches exposed
// on the mocked module — same pattern as lib/api/_client.test.ts.
jest.mock('./socketContext', () => {
  let currentSocket: any = null;
  return {
    useSocket: () => ({ socket: currentSocket, connected: currentSocket !== null }),
    __setSocket: (socket: any) => { currentSocket = socket; },
    __reset: () => { currentSocket = null; },
  };
});

jest.mock('@/lib/api', () => ({
  endpoints: {
    session: {
      driverSession: jest.fn(),
    },
  },
}));

const socketContextMock = jest.requireMock('./socketContext');
const { endpoints } = jest.requireMock('@/lib/api');
const mockedDriverSession = endpoints.session.driverSession as jest.Mock;

function makeFakeSocket() {
  const listeners = new Map<string, Set<any>>();
  return {
    on: (event: string, cb: any) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off: (event: string, cb: any) => {
      listeners.get(event)?.delete(cb);
    },
    __emit: (event: string, payload: any) => {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

async function setupHook() {
  const rendered = await renderHook(() => useActiveSession(), {
    wrapper: ({ children }) => <ActiveSessionProvider>{children}</ActiveSessionProvider>,
  });
  return rendered;
}

const driver = { id: 7, name: 'Ahmed', phone: '+201000000000', avatar: null };
const rideBase = {
  sessionType: 'ride' as const,
  vehicleType: 'car' as const,
  rideId: 55,
  requestedCategory: null,
  pickup: { latitude: 30.0, longitude: 31.2, address: 'A' },
  dropoff: { latitude: 30.1, longitude: 31.3, address: 'B' },
  recipient: null,
  distanceKm: 5,
  estimatedDurationMinutes: 12,
  estimatedPrice: 40,
  finalPrice: null,
  waitingCharge: 0,
  paymentMethod: 'cash',
  passenger: driver,
  requestedAt: '2026-01-01T00:00:00.000Z',
  driverAssignedAt: null,
  driverArrivedAt: null,
  startedAt: null,
};

describe('ActiveSessionContext (driver) — full ride lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    socketContextMock.__reset();
    mockedDriverSession.mockResolvedValue({ data: null });
  });

  it('carries one ride through assigned → arrived → active → completed via socket snapshots', async () => {
    mockedDriverSession.mockResolvedValueOnce({
      data: { ...rideBase, status: 'driver_assigned', driverAssignedAt: rideBase.requestedAt },
    });
    const socket = makeFakeSocket();
    socketContextMock.__setSocket(socket);

    const { result, rerender } = await setupHook();
    // Re-render so the provider's useEffect (which depends on `socket` from
    // useSocket()) attaches the session:snapshot listener to this instance.
    await act(async () => { rerender(undefined); });

    await act(async () => { await result.current.initializeActiveSession(); });
    expect(result.current.initialized).toBe(true);
    expect(result.current.session).toMatchObject({ status: 'driver_assigned', rideId: 55 });

    await act(async () => {
      socket.__emit('session:snapshot', {
        data: { ...rideBase, status: 'driver_arrived', driverArrivedAt: '2026-01-01T00:05:00.000Z' },
      });
    });
    expect(result.current.session).toMatchObject({ status: 'driver_arrived' });

    await act(async () => {
      socket.__emit('session:snapshot', {
        data: { ...rideBase, status: 'active', startedAt: '2026-01-01T00:06:00.000Z' },
      });
    });
    expect(result.current.session).toMatchObject({ status: 'active' });

    // Trip completion: the server terminates the session and snapshots null.
    await act(async () => {
      socket.__emit('session:snapshot', { data: null });
    });
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.initialized).toBe(true);
  });

  it('keeps the previous session on a transient refresh failure mid-ride', async () => {
    mockedDriverSession.mockResolvedValueOnce({
      data: { ...rideBase, status: 'driver_assigned' },
    });
    const { result } = await setupHook();
    await act(async () => { await result.current.initializeActiveSession(); });
    expect(result.current.session).toMatchObject({ status: 'driver_assigned' });

    mockedDriverSession.mockRejectedValueOnce(new Error('network blip'));
    await act(async () => { await result.current.refreshActiveSession(); });

    expect(result.current.session).toMatchObject({ status: 'driver_assigned' });
    expect(result.current.error).toBeTruthy();
  });

  it('a REST refresh mid-ride can pick up a status the socket had not delivered yet', async () => {
    mockedDriverSession.mockResolvedValueOnce({
      data: { ...rideBase, status: 'driver_arrived' },
    });
    const { result } = await setupHook();
    await act(async () => { await result.current.initializeActiveSession(); });

    mockedDriverSession.mockResolvedValueOnce({ data: { ...rideBase, status: 'active' } });
    await act(async () => { await result.current.refreshActiveSession(); });

    expect(result.current.session).toMatchObject({ status: 'active' });
    expect(result.current.error).toBeNull();
  });

  it('clearActiveSession() drops the ride locally (e.g. on local logout) without touching initialized', async () => {
    mockedDriverSession.mockResolvedValueOnce({ data: { ...rideBase, status: 'active' } });
    const { result } = await setupHook();
    await act(async () => { await result.current.initializeActiveSession(); });
    expect(result.current.session).not.toBeNull();

    await act(async () => { result.current.clearActiveSession(); });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.initialized).toBe(true);
  });
});
