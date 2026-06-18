import { router } from 'expo-router';
import { api } from '@/lib/api';

/**
 * Called every time an authenticated user lands on a pre-auth screen.
 * Uses GET /driver/me/onboarding as the single source of truth to decide
 * where the driver should be in the registration flow.
 *
 * Decision tree:
 *   approved                    → /(shuttle)/  (dashboard)
 *   no serviceType              → /register-service-type
 *   no vehicle                  → /register-vehicle
 *   vehicle but no plate        → /register-plate
 *   missing required documents  → /register-documents
 *   pending / pending_review    → /pending-approval
 *   rejected                    → /pending-approval  (shows rejection UI)
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  setTimeout(async () => {
    requestAnimationFrame(async () => {
      try {
        // Single call — contains everything we need
        const onboarding = await api.get<{
          onboardingStatus: 'pending' | 'pending_review' | 'approved' | 'rejected';
          serviceType: string | null;
          missingDocuments: string[];
        }>('/driver/me/onboarding');

        // ── 1. Fully approved → dashboard
        if (onboarding?.onboardingStatus === 'approved') {
          router.replace('/(shuttle)/' as any);
          return;
        }

        // ── 2. No service type selected yet
        if (!onboarding?.serviceType) {
          router.replace('/register-service-type');
          return;
        }

        // ── 3. Check vehicle + plate
        let hasVehicle = false;
        let hasPlate = false;
        try {
          const vehicle = await api.get<{ id?: unknown; plateLetters?: string | null } | null>('/driver/me/vehicle');
          hasVehicle = !!(vehicle && (vehicle as any).id != null);
          // plateLetters is null until POST /driver/register/plate-number is called
          hasPlate = hasVehicle && !!(vehicle as any).plateLetters;
        } catch {
          hasVehicle = false;
          hasPlate = false;
        }

        if (!hasVehicle) {
          router.replace('/register-vehicle');
          return;
        }

        if (!hasPlate) {
          router.replace('/register-plate');
          return;
        }

        // ── 4. Check missing documents
        const missing = onboarding?.missingDocuments ?? [];
        if (missing.length > 0) {
          router.replace('/register-documents');
          return;
        }

        // ── 5. All steps done — waiting for admin review or rejected
        router.replace('/pending-approval');
      } catch {
        // Fallback — unexpected error (network, auth expired, etc.)
        router.replace('/(shuttle)/' as any);
      }
    });
  }, 50);
}
