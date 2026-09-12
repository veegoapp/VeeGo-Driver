// lib/api/_client.ts throws at import time if EXPO_PUBLIC_API_URL isn't set.
// Tests never make real network calls, but the module still needs a value
// present to import without crashing.
if (!process.env.EXPO_PUBLIC_API_URL) {
  process.env.EXPO_PUBLIC_API_URL = 'https://example.test/api';
}
