import { router } from 'expo-router';

/**
 * Navigates to the shuttle dashboard after authentication.
 * Route groups like (shuttle) are transparent — their index maps to the group
 * path itself, so we navigate to '/(shuttle)/' (trailing slash = index tab).
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  // Double-defer so the root Stack navigator is fully mounted before we navigate.
  setTimeout(() => {
    requestAnimationFrame(() => {
      router.replace('/(shuttle)/' as any);
    });
  }, 50);
}
