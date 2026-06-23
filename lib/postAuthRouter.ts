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
  // 'approved' is handled dynamically based on serviceType — not in this map
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
 * Called after sign-in (existing driver).
 * Routes based on registrationStep from /driver/me/onboarding.
 */
export async function navigateAfterAuth(token: string | null): Promise<void> {
  // Defer by one frame so expo-router's navigator tree is fully initialized.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  const userId = getUserIdFromToken(token);

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
    } else {
      router.replace('/login');
    }
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

    console.log('[navigateAfterOtp] registrationStep:', onboarding?.registrationStep, '| totalUploaded:', onboarding?.totalUploaded);

    if (onboarding?.registrationStep === 'approved') {
      navigateToHome(onboarding.serviceType, userId);
      return;
    }

    const step = onboarding?.registrationStep as RegistrationStep | undefined;

    // If backend says pending_review but no documents uploaded yet, the driver record
    // was created before the user completed registration — restart from service type.
    if (step === 'pending_review' && (onboarding?.totalUploaded ?? 0) === 0) {
      console.log('[navigateAfterOtp] pending_review with 0 docs → /register-service-type');
      router.replace('/register-service-type' as any);
      return;
    }

    if (step && step in STEP_ROUTES) {
      router.replace(STEP_ROUTES[step] as any);
    } else {
      router.replace('/register-service-type' as any);
    }
  } catch (err: any) {
    // No driver record (404) or network error — start from beginning
    console.log('[navigateAfterOtp] Error/404:', err?.status, '→ /register-service-type');
    router.replace('/register-service-type' as any);
  }
}
