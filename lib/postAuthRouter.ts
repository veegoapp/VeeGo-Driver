import { router } from 'expo-router';

/**
 * Always navigates to the shuttle dashboard after authentication.
 * Service selection is removed — the app is shuttle-only.
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  router.replace('/(shuttle)/index' as any);
}
