import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const SERVICE_TYPE_KEY = 'veego_service_type';
const SHUTTLE_TYPE = 'SHUTTLE';

/**
 * Determines and executes the correct post-authentication route.
 *
 * - If the driver has a previously persisted service type → go directly to the dashboard.
 * - If no service type is stored (first-time / fresh account) → go to service-select.
 *
 * This is the single source of truth for post-login routing.
 * login.tsx must call this instead of hard-coding any destination.
 */
export async function navigateAfterAuth(): Promise<void> {
  const serviceType = await AsyncStorage.getItem(SERVICE_TYPE_KEY);

  if (serviceType) {
    const destination = serviceType === SHUTTLE_TYPE ? '/(shuttle)' : '/(tabs)';
    console.log(`[PostAuth] service type found (${serviceType}) — routing to ${destination}`);
    router.replace(destination as Parameters<typeof router.replace>[0]);
  } else {
    console.log('[PostAuth] no service type — routing to /service-select (first-time onboarding)');
    router.replace('/service-select');
  }
}
