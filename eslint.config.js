const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    // Node-executed config/build scripts, not app/bundle code.
    files: ['app.config.js', 'babel.config.js', 'metro.config.js', 'jest.config.js', 'jest.setup.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', __filename: 'readonly', module: 'readonly', require: 'readonly', process: 'readonly' },
    },
  },
  {
    // These React Compiler readiness rules (added by eslint-config-expo) are
    // correct and worth fixing, but the existing codebase (pre-dating this
    // lint setup) has ~270 pre-existing violations across contexts and
    // hooks — too large to fix as part of adding CI linting. Downgraded to
    // warnings so `pnpm lint` is actionable in CI without blocking every
    // build; new code should still avoid introducing more of them, and this
    // can be raised back to 'error' once the backlog is cleared.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
