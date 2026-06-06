import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { getUserIdFromToken } from './auth';

// Per-user map key — value is JSON: { [userId]: ServiceType }
const SERVICE_MAP_KEY = 'veego_service_map';
const SHUTTLE_TYPE = 'SHUTTLE';

/**
 * Determines and executes the correct post-authentication route.
 *
 * Routing is user-scoped: the service type is looked up by userId decoded
 * from the JWT. A value that belongs to a different account is never used.
 *
 * - userId found AND has a stored service type → go directly to the dashboard.
 * - userId not found OR no service type for this user → /service-select.
 *
 * @param token  The current access token (just received on login, or from authContext).
 */
export async function navigateAfterAuth(token: string | null): Promise<void> {
  const userId = getUserIdFromToken(token);
  let serviceType: string | null = null;

  if (userId) {
    try {
      const mapJson = await AsyncStorage.getItem(SERVICE_MAP_KEY);
      if (mapJson) {
        const map = JSON.parse(mapJson) as Record<string, string>;
        serviceType = map[userId] ?? null;
      }
    } catch {
      serviceType = null;
    }
  }

  if (serviceType) {
    const destination = serviceType === SHUTTLE_TYPE ? '/(shuttle)' : '/(tabs)';
    console.log(`[PostAuth] userId=${userId} — service type "${serviceType}" found, routing to ${destination}`);
    router.replace(destination as Parameters<typeof router.replace>[0]);
  } else {
    console.log(`[PostAuth] userId=${userId ?? 'unknown'} — no service type stored, routing to /service-select`);
    router.replace('/service-select');
  }
}
