import { router } from 'expo-router';
import { api } from '@/lib/api';

/**
 * Called every time an authenticated user lands on a pre-auth screen.
 * Checks registration progress and routes to the correct next step:
 *
 *   no vehicle       → /register-vehicle
 *   vehicle, no docs → /register-documents
 *   vehicle + docs   → /pending-approval  (not yet active)
 *   active driver    → /(shuttle)/
 *
 * Falls back to the shuttle dashboard on any unexpected error so the
 * app never gets stuck.
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  // Double-defer so the root Stack navigator is fully mounted before we navigate.
  setTimeout(async () => {
    requestAnimationFrame(async () => {
      try {
        // 1. Check if driver is already active
        const me = await api.get<{ isActive?: boolean }>('/driver/me');

        if (me?.isActive) {
          router.replace('/(shuttle)/' as any);
          return;
        }

        // 2. Not yet active — check vehicle registration
        let hasVehicle = false;
        try {
          const vehicle = await api.get<Record<string, unknown> | null>('/driver/me/vehicle');
          hasVehicle = !!(vehicle && vehicle.id != null);
        } catch {
          hasVehicle = false;
        }

        if (!hasVehicle) {
          router.replace('/register-vehicle');
          return;
        }

        // 3. Has vehicle — check if any documents have been submitted
        let hasDocuments = false;
        try {
          const docs = await api.get<unknown>('/driver/me/documents');
          if (Array.isArray(docs)) {
            hasDocuments = (docs as unknown[]).length > 0;
          } else if (docs && typeof docs === 'object') {
            const d = docs as Record<string, unknown>;
            const arr = d.documents ?? d.data ?? [];
            hasDocuments = Array.isArray(arr) && (arr as unknown[]).length > 0;
          }
        } catch {
          hasDocuments = false;
        }

        if (!hasDocuments) {
          router.replace('/register-documents');
          return;
        }

        // 4. Vehicle + docs submitted — waiting for admin approval
        router.replace('/pending-approval');
      } catch {
        // Unexpected error — fall back to dashboard
        router.replace('/(shuttle)/' as any);
      }
    });
  }, 50);
}
