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

export async function navigateAfterAuth(token: string | null): Promise<void> {
  // Defer navigation by one frame to allow expo-router's navigator tree to
  // fully initialize before dispatching a REPLACE into a route group.
  // Without this, '/(shuttle)' resolves to {name:'index'} which is a no-op.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  const userId = getUserIdFromToken(token);

  try {
    const onboarding = await api.get<{
      registrationStep: RegistrationStep;
      onboardingStatus: string;
      serviceType: string | null;
    }>('/driver/me/onboarding');

    const step = onboarding?.registrationStep;

    // Approved drivers must be routed based on their service type
    if (step === 'approved') {
      navigateToHome(onboarding?.serviceType, userId);
      return;
    }

    const route = step ? STEP_ROUTES[step] : null;

    if (route) {
      router.replace(route as any);
    } else {
      // Unknown step — fall back based on service type if available
      navigateToHome(onboarding?.serviceType, userId);
    }
  } catch {
    // On API error we cannot determine service type from backend — navigate
    // to the route that matches what storage has (do not guess a service type).
    router.replace('/(shuttle)/home' as any);
  }
}
