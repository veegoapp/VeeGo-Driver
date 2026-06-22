export default ({ config }) => ({
  ...config,

  ios: {
    ...config.ios,
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS || "",
    },
  },

  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID || "",
      },
    },
  },

  plugins: [
    "expo-secure-store"
  ],
});