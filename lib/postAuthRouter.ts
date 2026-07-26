import { router } from 'expo-router';
import { api } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserIdFromToken } from '@/lib/auth';
import { emitServiceTypeFromBackend } from '@/lib/serviceTypeBridge';
import type { ServiceType } from '@/lib/serviceContext';

type RegistrationStep =
  | 'service_type'
  | 'vehicle_details'
  | 'plate_number'
  | 'documents'
  | 'pending_review'
  | 'approved'
  | 'rejected';

const STEP_ROUTES: Record<RegistrationStep, string> = {
  service_type:   '/register-service-type',
  vehicle_details:'/register-vehicle',
  plate_number:   '/register-plate',
  documents:      '/register-documents',
  pending_review: '/pending-approval',
  // 'approved' is intercepted before this map is consulted (see navigateToHome)
  approved:       '/(tabs)/home',
  rejected:       '/pending-approval',
};

/**
 * Route an approved driver to the correct home screen based on their service type.
 * Shuttle drivers → /(shuttle)/home
 * All other service types (car, scooter, delivery) → /(tabs)/home
 *
 * Also syncs the service type to the device-level AsyncStorage fallback so the
 * ServiceContext always shows the correct interface even on a fresh install.
 */
export function navigateToHome(
  serviceType: string | null | undefined,
  userId?: string | null,
): void {
  const type = (serviceType ?? '').toLowerCase();
  const appType: ServiceType = type === 'shuttle' ? 'SHUTTLE'
    : type === 'scooter' ? 'SCOOTER'
    : type === 'delivery' ? 'DELIVERY'
    : 'CAR';

  // 1. Notify ServiceContext immediately (no storage race condition).
  emitServiceTypeFromBackend(appType);

  // 2. Persist to device fallback for next cold start.
  AsyncStorage.setItem('veego_device_service', appType).catch(() => {});

  // 3. Persist to per-user map so returning users load correctly.
  if (userId) {
    AsyncStorage.getItem('veego_service_map')
      .then(json => {
        const map: Record<string, ServiceType> = json ? JSON.parse(json) : {};
        map[userId] = appType;
        return AsyncStorage.setItem('veego_service_map', JSON.stringify(map));
      })
      .catch(() => {});
  }

  if (appType === 'SHUTTLE') {
    router.replace('/(shuttle)/home' as any);
  } else {
    router.replace('/(tabs)/home' as any);
  }
}

/**
 * Silently refreshes the driver's onboarding state in the background after
 * the fast-path startup. Updates the local routing cache so the next cold
 * start has fresh data.
 *
 * Safety constraints:
 * - Never calls router.replace() or navigates. Driver is already inside the app.
 * - Never clears the session on network/server errors.
 * - A 401 response is handled by the API client's existing onSessionCleared
 *   callback, which calls clearLocalSession() in AuthContext and lets the
 *   RootLayoutNav guard handle the redirect — no navigation here.
 */
async function _syncOnboardingInBackground(userId: string): Promise<void> {
  try {
    const onboarding = await api.get<{
      registrationStep: RegistrationStep;
      onboardingStatus: string;
      serviceType: string | null;
    }>('/driver/me/onboarding');

    if (!onboarding?.serviceType) return;

    // Resolve the canonical ServiceType from the backend response.
    const type = (onboarding.serviceType ?? '').toLowerCase();
    const appType: ServiceType =
      type === 'shuttle' ? 'SHUTTLE'
      : type === 'scooter' ? 'SCOOTER'
      : type === 'delivery' ? 'DELIVERY'
      : 'CAR';

    // Update the per-user service map cache only — no navigation.
    const serviceMapJson = await AsyncStorage.getItem('veego_service_map');
    const map: Record<string, ServiceType> = serviceMapJson ? JSON.parse(serviceMapJson) : {};
    map[userId] = appType;
    await AsyncStorage.setItem('veego_service_map', JSON.stringify(map));

    // Keep the device-level fallback in sync too.
    await AsyncStorage.setItem('veego_device_service', appType);
  } catch {
    // Network errors and temporary server failures are silently ignored.
    // The cache from the previous successful session remains valid.
    // A 401 response is handled upstream by the API client (onSessionCleared →
    // clearLocalSession → AuthContext token cleared → RootLayoutNav redirects).
  }
}

/**
 * Called after sign-in (existing driver).
 * Routes based on registrationStep from /driver/me/onboarding.
 *
 * Fast path (returning approved driver):
 *   Reads the locally-cached service type written by navigateToHome on the
 *   previous session. If a cache entry exists the driver is navigated home
 *   immediately — no network call blocks startup. The onboarding endpoint is
 *   then contacted in the background to refresh the cache for the next start.
 *
 * Slow path (first login / fresh install / no cache):
 *   Calls the backend synchronously to determine the correct route, identical
 *   to the previous behaviour. On network error the driver remains on the
 *   current screen; tokens are never cleared for transient failures.
 */
export async function navigateAfterAuth(token: string | null): Promise<void> {
  // Defer by one frame so expo-router's navigator tree is fully initialized.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  const userId = getUserIdFromToken(token);

  // ── Fast path: use locally-cached routing from previous successful session ──
  // veego_service_map is populated by navigateToHome whenever the backend
  // confirms registrationStep === 'approved'. Its presence for this userId
  // means the driver is approved and we know their service type — no network
  // call is required to enter the app.
  if (userId) {
    try {
      const serviceMapJson = await AsyncStorage.getItem('veego_service_map');
      if (serviceMapJson) {
        const map: Record<string, ServiceType> = JSON.parse(serviceMapJson);
        const cachedServiceType = map[userId];
        if (cachedServiceType) {
          // Navigate immediately from cache — driver enters the app now.
          navigateToHome(cachedServiceType, userId);
          // Refresh the cache in the background. Does not block entry and
          // must not trigger further navigation (see _syncOnboardingInBackground).
          _syncOnboardingInBackground(userId);
          return;
        }
      }
    } catch {
      // Malformed storage entry — fall through to the blocking API call.
    }
  }

  // ── Slow path: no cache (first login / fresh install) ──
  // Must call the backend to determine the correct route.
  try {
    const onboarding = await api.get<{
      registrationStep: RegistrationStep;
      onboardingStatus: string;
      serviceType: string | null;
    }>('/driver/me/onboarding');

    if (onboarding?.registrationStep === 'approved') {
      navigateToHome(onboarding.serviceType, userId);
      return;
    }

    const step = onboarding?.registrationStep as RegistrationStep | undefined;
    if (step && step in STEP_ROUTES) {
      router.replace(STEP_ROUTES[step] as any);
    } else {
      router.replace('/pending-approval');
    }
  } catch (err: any) {
    if (err?.status === 404) {
      // No driver profile — user started sign-up but never completed it.
      // Clear the token so login screen is shown fresh.
      const { deleteToken, deleteRefreshToken } = await import('@/lib/auth');
      await deleteToken();
      await deleteRefreshToken();
      router.replace('/login');
    } else if (err?.status === 401) {
      // The server explicitly rejected the token — the session is invalid.
      router.replace('/login');
    }
    // Network errors (status 0), timeouts, and temporary server errors (5xx)
    // are not authentication failures. Do not redirect to login — the driver
    // retains their session and the app remains on the current screen until
    // connectivity is restored.
  }
}

/**
 * Called after OTP verification (new sign-up flow).
 * Routes based on registrationStep. If driver record doesn't exist yet (404),
 * goes to the first registration step instead of login.
 */
export async function navigateAfterOtp(token: string): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  const userId = getUserIdFromToken(token);

  try {
    const onboarding = await api.get<{
      registrationStep: RegistrationStep;
      onboardingStatus: string;
      serviceType: string | null;
      totalUploaded?: number;
    }>('/driver/me/onboarding');

    if (onboarding?.registrationStep === 'approved') {
      navigateToHome(onboarding.serviceType, userId);
      return;
    }

    const step = onboarding?.registrationStep as RegistrationStep | undefined;
    if (step && step in STEP_ROUTES) {
      router.replace(STEP_ROUTES[step] as any);
    } else {
      router.replace('/register-service-type' as any);
    }
  } catch (err: any) {
    // No driver record (404) or network error — start from beginning
    if (__DEV__) console.log('[navigateAfterOtp] Error/404:', err?.status, '→ /register-service-type');
    router.replace('/register-service-type' as any);
  }
}
