import { renderHook, act } from '@testing-library/react-native';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { useWaitingCharge } from './useWaitingCharge';

jest.mock('@/lib/socketContext', () => ({
  useSocket: jest.fn(),
}));

const mockedUseSocket = useSocket as jest.Mock;

function makeFakeSocket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  return {
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: jest.fn((event: string, cb: (...args: any[]) => void) => {
      handlers.get(event)?.delete(cb);
    }),
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

describe('useWaitingCharge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when there is no socket', async () => {
    mockedUseSocket.mockReturnValue({ socket: null });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', 'ride-1'));

    expect(result.current).toBeNull();
  });

  it('returns null when there is no rideId', async () => {
    mockedUseSocket.mockReturnValue({ socket: makeFakeSocket() });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', undefined));

    expect(result.current).toBeNull();
  });

  it('sets a zero-amount charge when the free window expires', async () => {
    const socket = makeFakeSocket();
    mockedUseSocket.mockReturnValue({ socket });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', 'ride-1'));

    await act(async () => {
      socket.emit(SOCKET_EVENTS.WAITING_CHARGE_STARTED, {
        rideId: 'ride-1', ratePerMinute: 1, freeWindowMinutes: 5, maxCharge: 50,
      });
    });

    expect(result.current).toEqual({ rideId: 'ride-1', amount: 0, minutes: 0 });
  });

  it('updates the running charge as minutes elapse', async () => {
    const socket = makeFakeSocket();
    mockedUseSocket.mockReturnValue({ socket });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', 'ride-1'));

    await act(async () => {
      socket.emit(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, {
        rideId: 'ride-1', elapsedMinutes: 3, currentCharge: 3, chargedMinutes: 3, runningTotal: 3, maxCharge: 50,
      });
    });

    expect(result.current).toEqual({ rideId: 'ride-1', amount: 3, minutes: 3 });
  });

  it('marks the charge as capped once the max is reached', async () => {
    const socket = makeFakeSocket();
    mockedUseSocket.mockReturnValue({ socket });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', 'ride-1'));

    await act(async () => {
      socket.emit(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, {
        rideId: 'ride-1', finalCharge: 50, chargedMinutes: 50, maxCharge: 50,
      });
    });

    expect(result.current).toEqual({ rideId: 'ride-1', amount: 50, minutes: 50, capped: true });
  });

  it('ignores events for a different rideId', async () => {
    const socket = makeFakeSocket();
    mockedUseSocket.mockReturnValue({ socket });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', 'ride-1'));

    await act(async () => {
      socket.emit(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, {
        rideId: 'some-other-ride', elapsedMinutes: 3, currentCharge: 3, chargedMinutes: 3, runningTotal: 3, maxCharge: 50,
      });
    });

    expect(result.current).toBeNull();
  });

  it('matches a numeric backend rideId against the string rideId prop', async () => {
    const socket = makeFakeSocket();
    mockedUseSocket.mockReturnValue({ socket });

    const { result } = await renderHook(() => useWaitingCharge('driver-1', '42'));

    await act(async () => {
      socket.emit(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, {
        rideId: 42, elapsedMinutes: 1, currentCharge: 1, chargedMinutes: 1, runningTotal: 1, maxCharge: 50,
      });
    });

    expect(result.current).toEqual({ rideId: '42', amount: 1, minutes: 1 });
  });

  it('unsubscribes all three listeners on unmount', async () => {
    const socket = makeFakeSocket();
    mockedUseSocket.mockReturnValue({ socket });

    const { unmount } = await renderHook(() => useWaitingCharge('driver-1', 'ride-1'));
    await act(async () => { unmount(); });

    expect(socket.off).toHaveBeenCalledWith(SOCKET_EVENTS.WAITING_CHARGE_STARTED, expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith(SOCKET_EVENTS.WAITING_CHARGE_UPDATED, expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith(SOCKET_EVENTS.WAITING_CHARGE_CAPPED, expect.any(Function));
  });
});
