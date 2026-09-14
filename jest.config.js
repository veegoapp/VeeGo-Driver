module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // lib/walletHelpers.ts transitively imports lib/auth.ts -> AsyncStorage,
  // whose native module isn't available under Jest. Use the package's own
  // official mock instead of the native binding.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    // Mirrors the "@/*" -> "./*" path alias declared in tsconfig.json so
    // modules under test can be imported with the same paths app code uses.
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Ratchets test coverage on the lib/ modules that actually have unit
  // tests today (pure logic: API client, routing decisions, helpers,
  // translations). Contexts, native-module wrappers (location, battery,
  // image compression...) and UI need component/E2E tests, not unit
  // coverage, and are deliberately left out rather than counted against a
  // global number they'll never move. Add a module's path here as it gains
  // real tests; thresholds are set just below current coverage so CI fails
  // on a regression and can be raised over time.
  collectCoverageFrom: [
    'lib/postAuthRouter.ts',
    'lib/checkinDeadline.ts',
    'lib/rtlUtils.ts',
    'lib/shuttleHistoryHelpers.ts',
    'lib/walletHelpers.ts',
    'lib/api/_client.ts',
    'lib/i18n/translations/en.ts',
    'lib/i18n/translations/ar.ts',
    'lib/shuttle/helpers.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 40,
      functions: 45,
      lines: 55,
    },
  },
};
