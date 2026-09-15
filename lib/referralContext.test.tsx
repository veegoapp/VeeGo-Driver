import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReferralProvider, useReferral } from './referralContext';

jest.mock('./authContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('./api', () => ({
  endpoints: {
    shuttle: {
      incomingReferrals: jest.fn(),
    },
  },
}));

const { useAuth } = jest.requireMock('./authContext');
const { endpoints } = jest.requireMock('./api');
const mockedIncomingReferrals = endpoints.shuttle.incomingReferrals as jest.Mock;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

let currentUnmount: (() => Promise<void>) | null = null;
let currentQueryClient: QueryClient | null = null;

async function setupHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  currentQueryClient = queryClient;
  const rendered = await renderHook(() => useReferral(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ReferralProvider>{children}</ReferralProvider>
      </QueryClientProvider>
    ),
  });
  currentUnmount = rendered.unmount;
  return rendered;
}

function rawReferral(overrides: Record<string, any> = {}) {
  return {
    referralId: 'r1',
    tripId: 55,
    routeName: 'Downtown Line',
    departureTime: '2026-01-01T08:00:00.000Z',
    fromStation: 'Station A',
    toStation: 'Station B',
    ...overrides,
  };
}

describe('ReferralContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ token: null });
    mockedIncomingReferrals.mockResolvedValue({ data: [] });
  });

  afterEach(async () => {
    if (currentUnmount) {
      await act(async () => { await currentUnmount!(); });
      currentUnmount = null;
    }
    currentQueryClient?.clear();
    currentQueryClient = null;
  });

  it('does not query the backend while there is no auth token', async () => {
    const { result } = await setupHook();
    await flush();

    expect(mockedIncomingReferrals).not.toHaveBeenCalled();
    expect(result.current.pendingReferrals).toEqual([]);
  });

  it('hydrates pending referrals from the backend once authenticated (app was closed when the socket event fired)', async () => {
    useAuth.mockReturnValue({ token: 'access-1' });
    mockedIncomingReferrals.mockResolvedValue({ data: [rawReferral()] });

    const { result } = await setupHook();
    await flush();

    expect(result.current.pendingReferrals).toHaveLength(1);
    expect(result.current.pendingReferrals[0]).toMatchObject({ referralId: 'r1', tripId: '55' });
    expect(result.current.incomingReferralsCount).toBe(1);
  });

  it('coerces numeric ids to strings and omits fields the backend left out', async () => {
    useAuth.mockReturnValue({ token: 'access-1' });
    mockedIncomingReferrals.mockResolvedValue({
      data: [rawReferral({ tripId: undefined, bookingId: 77 })],
    });

    const { result } = await setupHook();
    await flush();

    expect(result.current.pendingReferrals[0]).toMatchObject({ bookingId: '77' });
    expect(result.current.pendingReferrals[0].tripId).toBeUndefined();
  });

  it('addIncomingReferral (live socket path) dedupes by referralId instead of adding a duplicate card', async () => {
    const { result } = await setupHook();
    await flush();

    await act(async () => { result.current.addIncomingReferral({ referralId: 'r1', routeName: 'A', departureTime: 't', fromStation: 'x', toStation: 'y' }); });
    await act(async () => { result.current.addIncomingReferral({ referralId: 'r1', routeName: 'A-updated', departureTime: 't', fromStation: 'x', toStation: 'y' }); });

    expect(result.current.pendingReferrals).toHaveLength(1);
    expect(result.current.pendingReferrals[0].routeName).toBe('A');
  });

  it('addIncomingReferral prepends new referrals, newest first', async () => {
    const { result } = await setupHook();
    await flush();

    await act(async () => { result.current.addIncomingReferral({ referralId: 'r1', routeName: 'first', departureTime: 't', fromStation: 'x', toStation: 'y' }); });
    await act(async () => { result.current.addIncomingReferral({ referralId: 'r2', routeName: 'second', departureTime: 't', fromStation: 'x', toStation: 'y' }); });

    expect(result.current.pendingReferrals.map((r) => r.referralId)).toEqual(['r2', 'r1']);
  });

  it('dismissReferral removes only the targeted referral', async () => {
    const { result } = await setupHook();
    await flush();

    await act(async () => { result.current.addIncomingReferral({ referralId: 'r1', routeName: 'A', departureTime: 't', fromStation: 'x', toStation: 'y' }); });
    await act(async () => { result.current.addIncomingReferral({ referralId: 'r2', routeName: 'B', departureTime: 't', fromStation: 'x', toStation: 'y' }); });

    await act(async () => { result.current.dismissReferral('r1'); });

    expect(result.current.pendingReferrals.map((r) => r.referralId)).toEqual(['r2']);
  });

  it('a backend hydration referral and a live socket referral with the same id do not duplicate', async () => {
    useAuth.mockReturnValue({ token: 'access-1' });
    mockedIncomingReferrals.mockResolvedValue({ data: [rawReferral()] });

    const { result } = await setupHook();
    await flush();
    expect(result.current.pendingReferrals).toHaveLength(1);

    await act(async () => {
      result.current.addIncomingReferral({
        referralId: 'r1', tripId: '55', routeName: 'Downtown Line',
        departureTime: '2026-01-01T08:00:00.000Z', fromStation: 'Station A', toStation: 'Station B',
      });
    });

    expect(result.current.pendingReferrals).toHaveLength(1);
  });
});
