import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// SecureStore is not available on web or in Expo Go on some configs
// Fall back to AsyncStorage in those cases
const canUseSecureStore = Platform.OS !== 'web';

async function setItem(key: string, value: string): Promise<void> {
  try {
    if (canUseSecureStore) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  try {
    if (canUseSecureStore) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  } catch {
    return await AsyncStorage.getItem(key);
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    if (canUseSecureStore) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

export async function saveToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return await getItem(TOKEN_KEY);
}

export async function deleteToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null && token.length > 0;
}

export async function saveRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return await getItem(REFRESH_TOKEN_KEY);
}

export async function deleteRefreshToken(): Promise<void> {
  await removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Decodes the JWT payload and returns the driver's user ID.
 * Tries the standard fields: sub, id, userId, driverId, driver_id.
 * Returns null if the token is absent, malformed, or contains no recognisable ID field.
 *
 * This is intentionally a local decode — no network call is made.
 */
export function getUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // Base64url → standard base64, then pad to a multiple of 4
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const id = payload.sub ?? payload.id ?? payload.userId ?? payload.driverId ?? payload.driver_id;
    if (typeof id === 'string' && id.length > 0) return id;
    if (typeof id === 'number') return String(id);
    return null;
  } catch {
    return null;
  }
}
