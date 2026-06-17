import { router } from 'expo-router';

/**
 * Always navigates to the shuttle dashboard after authentication.
 * Deferred by one frame so the Stack navigator has time to register
 * the (shuttle) group before the REPLACE action is dispatched.
 */
export async function navigateAfterAuth(_token: string | null): Promise<void> {
  // requestAnimationFrame ensures the navigator is fully mounted before
  // we try to replace — without this, the action fires before (shuttle)
  // is registered and the navigator rejects it.
  requestAnimationFrame(() => {
    router.replace('/(shuttle)' as any);
  });
}
