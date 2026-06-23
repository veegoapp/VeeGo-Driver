import { router } from 'expo-router';

/**
 * Go back if there is a screen to return to, otherwise navigate to a
 * safe fallback so the user is never left on an orphaned screen.
 */
export function safeBack(fallback: string = '/login') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as any);
  }
}
