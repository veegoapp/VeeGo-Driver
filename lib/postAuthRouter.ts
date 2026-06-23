import { router } from 'expo-router';
import { api } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
export function navigateToHome(serviceType: string | null | undefined): void {
  const type = (serviceType ?? '').toLowerCase();
  if (type === 'shuttle') {
    // Persist so ServiceContext reads 'SHUTTLE' on next load
    AsyncStorage.setItem('veego_device_service', 'SHUTTLE').catch(() => {});
    router.replace('/(shuttle)/home' as any);
  } else {
    // Persist the correct service type so the non-shuttle interface loads
    const appType = type === 'scooter' ? 'SCOOTER'
      : type === 'delivery' ? 'DELIVERY'
      : 'CAR';
    AsyncStorage.setItem('veego_device_service', appType).catch(() => {});
    router.replace('/(tabs)/home' as any);
  }
}

export async function navigateAfterAuth(_token: string | null): Promise<void> {
  // Defer navigation by one frame to allow expo-router's navigator tree to
  // fully initialize before dispatching a REPLACE into a route group.
  // Without this, '/(shuttle)' resolves to {name:'index'} which is a no-op.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  try {
    const onboarding = await api.get<{
      registrationStep: RegistrationStep;
      onboardingStatus: string;
      serviceType: string | null;
    }>('/driver/me/onboarding');

    const step = onboarding?.registrationStep;

    // Approved drivers must be routed based on their service type
    if (step === 'approved') {
      navigateToHome(onboarding?.serviceType);
      return;
    }

    const route = step ? STEP_ROUTES[step] : null;

    if (route) {
      router.replace(route as any);
    } else {
      // Unknown step — fall back based on service type if available
      navigateToHome(onboarding?.serviceType);
    }
  } catch {
    // On error we can't determine service type — default to shuttle
    router.replace('/(shuttle)/home' as any);
  }
}
