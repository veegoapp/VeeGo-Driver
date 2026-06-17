import { router } from 'expo-router';

/**
 * Navigates to the shuttle dashboard after authentication.
 * Uses the explicit index path to avoid Expo Router's transparent-group
 * ambiguity — navigating to '/(shuttle)' dispatches a REPLACE action with
 * name="(shuttle)" that React Navigation can't resolve; navigating to the
 * concrete index screen always works.
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  setTimeout(() => {
    requestAnimationFrame(() => {
      router.replace('/(shuttle)/index' as any);
    });
  }, 0);
}
