module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // lib/walletHelpers.ts transitively imports lib/auth.ts -> AsyncStorage,
  // whose native module isn't available under Jest. Use the package's own
  // official mock instead of the native binding.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
