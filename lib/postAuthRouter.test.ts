import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { getUserIdFromToken } from '@/lib/auth';
import { emitServiceTypeFromBackend } from '@/lib/serviceTypeBridge';
import { navigateAfterAuth, navigateAfterOtp, navigateToHome } from './postAuthRouter';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
}));

jest.mock('@/lib/auth', () => ({
  getUserIdFromToken: jest.fn(),
  deleteToken: jest.fn().mockResolvedValue(undefined),
  deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/serviceTypeBridge', () => ({
  emitServiceTypeFromBackend: jest.fn(),
}));

const mockedApiGet = api.get as jest.Mock;
const mockedGetUserId = getUserIdFromToken as jest.Mock;
const mockedReplace = router.replace as jest.Mock;
const mockedEmit = emitServiceTypeFromBackend as jest.Mock;

describe('navigateToHome', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('routes shuttle drivers to the shuttle home screen', () => {
    navigateToHome('shuttle');
    expect(mockedReplace).toHaveBeenCalledWith('/(shuttle)/home');
  });

  it.each(['car', 'scooter', 'delivery', 'unknown', null, undefined])(
    'routes every non-shuttle service type (%s) to the tabs home screen',
    (serviceType) => {
      navigateToHome(serviceType as any);
      expect(mockedReplace).toHaveBeenCalledWith('/(tabs)/home');
    },
  );

  it('is case-insensitive when resolving the service type', () => {
    navigateToHome('SHUTTLE');
    expect(mockedReplace).toHaveBeenCalledWith('/(shuttle)/home');
  });

  it('notifies ServiceContext synchronously before persisting to storage', () => {
    navigateToHome('scooter');
    expect(mockedEmit).toHaveBeenCalledWith('SCOOTER');
  });

  it('persists the resolved service type to the device-level fallback', async () => {
    navigateToHome('delivery');
    await Promise.resolve();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('veego_device_service')).toBe('DELIVERY');
  });

  it('persists the resolved service type to the per-user map when a userId is given', async () => {
    navigateToHome('car', 'driver-42');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const map = JSON.parse((await AsyncStorage.getItem('veego_service_map')) ?? '{}');
    expect(map['driver-42']).toBe('CAR');
  });

  it('does not touch the per-user map when no userId is given', async () => {
    navigateToHome('car');
    await Promise.resolve();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('veego_service_map')).toBeNull();
  });
});

describe('navigateAfterAuth', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedGetUserId.mockReturnValue('driver-1');
  });

  it('enters the app immediately from a cached service type without calling the backend', async () => {
    await AsyncStorage.setItem('veego_service_map', JSON.stringify({ 'driver-1': 'CAR' }));
    // Background sync call still resolves, but must not itself navigate.
    mockedApiGet.mockResolvedValue({ registrationStep: 'approved', onboardingStatus: 'ok', serviceType: 'car' });

    await navigateAfterAuth('token');

    expect(mockedReplace).toHaveBeenCalledTimes(1);
    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('falls back to the blocking API call when there is no cache entry', async () => {
    mockedApiGet.mockResolvedValue({ registrationStep: 'approved', onboardingStatus: 'ok', serviceType: 'shuttle' });

    await navigateAfterAuth('token');

    expect(mockedApiGet).toHaveBeenCalledWith('/driver/me/onboarding');
    expect(mockedReplace).toHaveBeenCalledWith('/(shuttle)/home');
  });

  it('routes to the step-specific screen when onboarding is incomplete', async () => {
    mockedApiGet.mockResolvedValue({ registrationStep: 'documents', onboardingStatus: 'incomplete', serviceType: null });

    await navigateAfterAuth('token');

    expect(mockedReplace).toHaveBeenCalledWith('/register-documents');
  });

  it('clears the session and returns to login on a 404 (no driver profile)', async () => {
    const { deleteToken, deleteRefreshToken } = jest.requireMock('@/lib/auth');
    mockedApiGet.mockRejectedValue({ status: 404 });

    await navigateAfterAuth('token');

    expect(deleteToken).toHaveBeenCalled();
    expect(deleteRefreshToken).toHaveBeenCalled();
    expect(mockedReplace).toHaveBeenCalledWith('/login');
  });

  it('redirects to login on a 401 without clearing tokens itself', async () => {
    const { deleteToken } = jest.requireMock('@/lib/auth');
    mockedApiGet.mockRejectedValue({ status: 401 });

    await navigateAfterAuth('token');

    expect(deleteToken).not.toHaveBeenCalled();
    expect(mockedReplace).toHaveBeenCalledWith('/login');
  });

  it('stays on the current screen for a network error and does not navigate', async () => {
    mockedApiGet.mockRejectedValue({ status: 0 });

    await navigateAfterAuth('token');

    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('stays on the current screen for a transient 5xx server error', async () => {
    mockedApiGet.mockRejectedValue({ status: 503 });

    await navigateAfterAuth('token');

    expect(mockedReplace).not.toHaveBeenCalled();
  });
});

describe('navigateAfterOtp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetUserId.mockReturnValue('driver-1');
  });

  it('routes an already-approved driver straight home', async () => {
    mockedApiGet.mockResolvedValue({ registrationStep: 'approved', onboardingStatus: 'ok', serviceType: 'car' });

    await navigateAfterOtp('token');

    expect(mockedReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('routes a brand-new sign-up to the first registration step', async () => {
    mockedApiGet.mockRejectedValue({ status: 404 });

    await navigateAfterOtp('token');

    expect(mockedReplace).toHaveBeenCalledWith('/register-service-type');
  });

  it('routes to the matching registration step when one is returned', async () => {
    mockedApiGet.mockResolvedValue({ registrationStep: 'vehicle_details', onboardingStatus: 'incomplete', serviceType: null });

    await navigateAfterOtp('token');

    expect(mockedReplace).toHaveBeenCalledWith('/register-vehicle');
  });
});
