import { router } from 'expo-router';
import { api } from '@/lib/api';

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
  approved:       '/(shuttle)/index',
  rejected:       '/pending-approval',
};

export async function navigateAfterAuth(_token: string | null): Promise<void> {
  // Defer navigation by one frame to allow expo-router's navigator tree to
  // fully initialize before dispatching a REPLACE into a route group.
  // Without this, '/(shuttle)' resolves to {name:'index'} which is a no-op.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  try {
    const onboarding = await api.get<{
      registrationStep: RegistrationStep;
      onboardingStatus: string;
    }>('/driver/me/onboarding');

    const step = onboarding?.registrationStep;
    const route = step ? STEP_ROUTES[step] : null;

    if (route) {
      router.replace(route as any);
    } else {
      router.replace('/(shuttle)/index' as any);
    }
  } catch {
    router.replace('/(shuttle)/index' as any);
  }
}
