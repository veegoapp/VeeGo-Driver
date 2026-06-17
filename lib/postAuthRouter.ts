import { router } from 'expo-router';

/**
 * Always navigates to the shuttle dashboard after authentication.
 * Double-deferred (rAF inside setTimeout) so the Stack navigator has
 * fully registered all screens before the REPLACE action is dispatched.
 * A single requestAnimationFrame is not enough on slow/cold starts.
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  setTimeout(() => {
    requestAnimationFrame(() => {
      router.replace('/(shuttle)' as any);
    });
  }, 0);
}
