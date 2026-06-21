import { ConfigContext, ExpoConfig } from 'expo/config';

// Minimal dynamic config layer — reads app.json as the base and injects
// Google Maps API keys from EAS secrets (never committed to source control).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ios: {
    ...config.ios,
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS ?? '',
    },
  },
  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID ?? '',
      },
    },
  },
});
