import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { getUserIdFromToken } from './auth';

// Per-user map key — value is JSON: { [userId]: ServiceType }
const SERVICE_MAP_KEY = 'veego_service_map';
// Device-level fallback — used when the JWT has no parseable user ID field.
// This ensures service-select is skipped on subsequent logins even when the
// backend token format doesn't include a standard id claim.
const DEVICE_SERVICE_KEY = 'veego_device_service';
const SHUTTLE_TYPE = 'SHUTTLE';

/**
 * Determines and executes the correct post-authentication route.
 *
 * Lookup order (most specific → least specific):
 *  1. Per-user map keyed by userId decoded from the JWT (multi-account safe).
 *  2. Device-level fallback key (handles JWTs with no parseable id field).
 *
 * - A service type is found → go directly to the correct dashboard.
 * - No service type found anywhere → /service-select (first-time sign-up flow only).
 *
 * @param token  The current access token (just received on login, or from authContext).
 */
export async function navigateAfterAuth(token: string | null): Promise<void> {
  const userId = getUserIdFromToken(token);
  let serviceType: string | null = null;

  try {
    // 1. Try per-user lookup first (most reliable when JWT has an id claim)
    if (userId) {
      const mapJson = await AsyncStorage.getItem(SERVICE_MAP_KEY);
      if (mapJson) {
        const map = JSON.parse(mapJson) as Record<string, string>;
        serviceType = map[userId] ?? null;
      }
    }

    // 2. Fallback: device-level key (handles null userId or missing per-user entry)
    if (!serviceType) {
      serviceType = await AsyncStorage.getItem(DEVICE_SERVICE_KEY);
    }
  } catch {
    serviceType = null;
  }

  if (serviceType) {
    const destination = serviceType === SHUTTLE_TYPE ? '/(shuttle)' : '/(tabs)';
    console.log(`[PostAuth] userId=${userId ?? 'unknown'} — service "${serviceType}" found, routing to ${destination}`);
    router.replace(destination as Parameters<typeof router.replace>[0]);
  } else {
    console.log(`[PostAuth] userId=${userId ?? 'unknown'} — no service stored, routing to /service-select`);
    router.replace('/service-select');
  }
}

/**
 * Persists the chosen service type for the current driver.
 *
 * Saves to BOTH storage locations so the lookup in navigateAfterAuth always
 * finds a value regardless of whether the JWT has a parseable user ID:
 *  - Per-user map (when userId is available) — multi-account safe.
 *  - Device-level fallback — always written as a safety net.
 */
export async function saveServiceType(serviceType: string, token: string | null): Promise<void> {
  const userId = getUserIdFromToken(token);

  const writes: Promise<void>[] = [
    AsyncStorage.setItem(DEVICE_SERVICE_KEY, serviceType),
  ];

  if (userId) {
    const write = AsyncStorage.getItem(SERVICE_MAP_KEY).then((mapJson) => {
      const map: Record<string, string> = mapJson ? JSON.parse(mapJson) : {};
      map[userId] = serviceType;
      return AsyncStorage.setItem(SERVICE_MAP_KEY, JSON.stringify(map));
    });
    writes.push(write);
  }

  await Promise.all(writes).catch(() => {});
}
