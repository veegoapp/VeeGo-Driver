import { renderHook, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useServiceControl } from '@/lib/serviceControlContext';
import { useService } from '@/lib/serviceContext';
import { useAuth } from '@/lib/authContext';
import { useServiceGuard } from './useServiceGuard';
import type { ServiceStatus } from '@/lib/serviceControlContext';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/lib/serviceControlContext', () => ({
  useServiceControl: jest.fn(),
}));

jest.mock('@/lib/serviceContext', () => ({
  useService: jest.fn(),
}));

jest.mock('@/lib/authContext', () => ({
  useAuth: jest.fn(),
}));

const mockedUseServiceControl = useServiceControl as jest.Mock;
const mockedUseService = useService as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedReplace = router.replace as jest.Mock;

function statusFixture(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    visible: true,
    displayMode: 'live',
    isEnabled: true,
    ...overrides,
  } as ServiceStatus;
}

function setup({
  status,
  authLoading = false,
  servicesLoading = false,
  servicesError = null as string | null,
  refresh = jest.fn(),
}: {
  status: ServiceStatus;
  authLoading?: boolean;
  servicesLoading?: boolean;
  servicesError?: string | null;
  refresh?: jest.Mock;
}) {
  const getServiceStatus = jest.fn().mockReturnValue(status);
  mockedUseService.mockReturnValue({ serviceType: 'CAR' });
  mockedUseAuth.mockReturnValue({ isLoading: authLoading });
  mockedUseServiceControl.mockReturnValue({
    getServiceStatus,
    refresh,
    isLoading: servicesLoading,
    error: servicesError,
  });
  return { refresh, getServiceStatus };
}

describe('useServiceGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not block when the service is visible and live', async () => {
    setup({ status: statusFixture() });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(false);
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('blocks when the service config is not visible at all', async () => {
    setup({ status: statusFixture({ visible: false }) });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(true);
  });

  it.each(['unavailable', 'maintenance'] as const)('blocks on displayMode=%s', async (displayMode) => {
    setup({ status: statusFixture({ displayMode }) });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(true);
  });

  it('does NOT block on displayMode=coming_soon (deliberately excluded)', async () => {
    setup({ status: statusFixture({ displayMode: 'coming_soon' }) });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(false);
  });

  it('never blocks while auth is still loading, even if the status looks blocked', async () => {
    setup({ status: statusFixture({ visible: false }), authLoading: true });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(false);
  });

  it('never blocks while the services fetch is loading', async () => {
    setup({ status: statusFixture({ visible: false }), servicesLoading: true });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(false);
  });

  it('never blocks on a transient services-fetch error (a network hiccup is not an admin decision)', async () => {
    setup({ status: statusFixture({ visible: false }), servicesError: 'network error' });

    const { result } = await renderHook(() => useServiceGuard());

    expect(result.current.isBlocked).toBe(false);
  });

  it('calls refresh() on mount', async () => {
    const { refresh } = setup({ status: statusFixture() });

    await renderHook(() => useServiceGuard());

    expect(refresh).toHaveBeenCalled();
  });

  it('schedules a redirect to /login after the delay when blocked', async () => {
    setup({ status: statusFixture({ visible: false }) });

    await renderHook(() => useServiceGuard());
    expect(mockedReplace).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(2800); });

    expect(mockedReplace).toHaveBeenCalledWith('/login');
  });

  it('does not schedule a redirect when suppressRedirect is true, even though isBlocked is still true', async () => {
    setup({ status: statusFixture({ visible: false }) });

    const { result } = await renderHook(() => useServiceGuard(undefined, true));
    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(result.current.isBlocked).toBe(true);
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('cancels a pending redirect if the block condition clears before the delay elapses', async () => {
    const { getServiceStatus } = setup({ status: statusFixture({ visible: false }) });

    const { rerender } = await renderHook(() => useServiceGuard());

    // Clear the block before the 2800ms timer fires.
    getServiceStatus.mockReturnValue(statusFixture({ visible: true }));
    await act(async () => { rerender(undefined); });
    await act(async () => { jest.advanceTimersByTime(2800); });

    expect(mockedReplace).not.toHaveBeenCalled();
  });
});
