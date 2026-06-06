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
