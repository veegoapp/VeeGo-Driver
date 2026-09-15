import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ServiceControlProvider, useServiceControl } from './serviceControlContext';

jest.mock('./authContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./socketContext', () => {
  let currentSocket: any = null;
  return {
    useSocket: () => ({ socket: currentSocket }),
    __setSocket: (socket: any) => { currentSocket = socket; },
    __reset: () => { currentSocket = null; },
  };
});

jest.mock('./api', () => ({
  api: { get: jest.fn() },
}));

const { useAuth } = jest.requireMock('./authContext');
const socketContextMock = jest.requireMock('./socketContext');
const { api } = jest.requireMock('./api');
const mockedGet = api.get as jest.Mock;

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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function setupHook() {
  return renderHook(() => useServiceControl(), {
    wrapper: ({ children }) => <ServiceControlProvider>{children}</ServiceControlProvider>,
  });
}

function shuttleControl(overrides: Record<string, any> = {}) {
  return {
    serviceType: 'shuttle',
    isEnabled: true,
    displayMode: 'live',
    ...overrides,
  };
}

describe('ServiceControlContext (driver)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    socketContextMock.__reset();
    useAuth.mockReturnValue({ token: 'access-1', isLoading: false });
  });

  it('loads services on mount when authenticated, then re-attaches on token appearing after auth resolves', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()], currency: { code: 'EGP', symbol: 'EGP', symbolAr: 'ج.م' } });

    const { result } = await setupHook();
    await flush();

    expect(result.current.services).toEqual([shuttleControl()]);
    expect(result.current.currency).toEqual({ code: 'EGP', symbol: 'EGP', symbolAr: 'ج.م' });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('clears services and skips the fetch entirely when there is no token', async () => {
    useAuth.mockReturnValue({ token: null, isLoading: false });

    const { result } = await setupHook();
    await flush();

    expect(mockedGet).not.toHaveBeenCalled();
    expect(result.current.services).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('waits for auth to resolve before fetching', async () => {
    useAuth.mockReturnValue({ token: null, isLoading: true });
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });

    const { result } = await setupHook();
    await flush();

    expect(mockedGet).not.toHaveBeenCalled();
    expect(result.current.services).toEqual([]);
  });

  it('falls back to the default EGP currency on a non-EGP or malformed currency payload', async () => {
    mockedGet.mockResolvedValue({ services: [], currency: { code: 'USD', symbol: '$' } });

    const { result } = await setupHook();
    await flush();

    expect(result.current.currency).toEqual({ code: 'EGP', symbol: 'EGP', symbolAr: 'ج.م' });
  });

  it('sets a fail-secure error state and clears services when the initial fetch fails', async () => {
    mockedGet.mockRejectedValue(new Error('network down'));

    const { result } = await setupHook();
    await flush();

    expect(result.current.error).toBeTruthy();
    expect(result.current.services).toEqual([]);
    expect(result.current.getServiceStatus('shuttle')).toMatchObject({ available: false, displayMode: 'unavailable' });
  });

  it('applies a full-array service:control:changed snapshot, replacing prior state', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });
    const socket = makeFakeSocket();
    socketContextMock.__setSocket(socket);

    const { result, rerender } = await setupHook();
    await act(async () => { rerender(undefined); });
    await flush();

    await act(async () => {
      socket.__emit('service:control:changed', [shuttleControl({ isEnabled: false, displayMode: 'maintenance' })]);
    });

    expect(result.current.services).toEqual([shuttleControl({ isEnabled: false, displayMode: 'maintenance' })]);
  });

  it('merges a single-object service:control:changed patch into the matching entry only', async () => {
    mockedGet.mockResolvedValue({
      services: [shuttleControl(), { serviceType: 'car', isEnabled: true, displayMode: 'live' }],
    });
    const socket = makeFakeSocket();
    socketContextMock.__setSocket(socket);

    const { result, rerender } = await setupHook();
    await act(async () => { rerender(undefined); });
    await flush();

    await act(async () => {
      socket.__emit('service:control:changed', { serviceType: 'shuttle', isEnabled: false, displayMode: 'unavailable' });
    });

    expect(result.current.services.find((s) => s.serviceType === 'shuttle')).toMatchObject({ isEnabled: false });
    expect(result.current.services.find((s) => s.serviceType === 'car')).toMatchObject({ isEnabled: true });
  });

  it('ignores a malformed service:control:changed payload instead of corrupting state', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });
    const socket = makeFakeSocket();
    socketContextMock.__setSocket(socket);

    const { result, rerender } = await setupHook();
    await act(async () => { rerender(undefined); });
    await flush();

    await act(async () => {
      socket.__emit('service:control:changed', { garbage: true });
    });

    expect(result.current.services).toEqual([shuttleControl()]);
  });

  it('applies service:settings:changed eligibility rules and enforces them in getServiceStatus', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });
    const socket = makeFakeSocket();
    socketContextMock.__setSocket(socket);

    const { result, rerender } = await setupHook();
    await act(async () => { rerender(undefined); });
    await flush();

    await act(async () => {
      socket.__emit('service:settings:changed', [{ serviceType: 'shuttle', minimumRating: 4.5, requiresLicense: true }]);
    });

    expect(
      result.current.getServiceStatus('shuttle', { rating: 4.0, licenseVerified: true }),
    ).toMatchObject({ available: false, ineligibilityReason: expect.stringContaining('4.5') });

    expect(
      result.current.getServiceStatus('shuttle', { rating: 4.8, licenseVerified: false }),
    ).toMatchObject({ available: false, ineligibilityReason: expect.stringContaining('license') });

    expect(
      result.current.getServiceStatus('shuttle', { rating: 4.8, licenseVerified: true }),
    ).toMatchObject({ available: true });
  });

  it('getServiceStatus is fail-closed (CONFIG_BLOCKED) for a service type the backend never returned', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });
    const { result } = await setupHook();
    await flush();

    expect(result.current.getServiceStatus('delivery')).toMatchObject({ visible: false, available: false });
  });

  it('normalizes the SCOOTER frontend key to the backend "scooter" serviceType', async () => {
    mockedGet.mockResolvedValue({ services: [{ serviceType: 'scooter', isEnabled: true, displayMode: 'live' }] });
    const { result } = await setupHook();
    await flush();

    expect(result.current.getServiceStatus('SCOOTER')).toMatchObject({ available: true });
  });

  it('refresh() re-fetches and updates services', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });
    const { result } = await setupHook();
    await flush();

    mockedGet.mockResolvedValueOnce({ services: [shuttleControl({ displayMode: 'coming_soon' })] });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.services[0]).toMatchObject({ displayMode: 'coming_soon' });
  });

  it('logging out (token clears) resets services back to empty', async () => {
    mockedGet.mockResolvedValue({ services: [shuttleControl()] });
    const { result, rerender } = await setupHook();
    await flush();
    expect(result.current.services).toHaveLength(1);

    useAuth.mockReturnValue({ token: null, isLoading: false });
    await act(async () => { rerender(undefined); });

    expect(result.current.services).toEqual([]);
  });
});
