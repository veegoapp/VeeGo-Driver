module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    env: {
      // Metro/Hermes handle dynamic import() natively; Jest's CommonJS
      // environment doesn't, so under test only, rewrite it to a
      // Promise-wrapped require() (e.g. the deferred `@/lib/auth` import in
      // postAuthRouter.ts).
      test: {
        plugins: ['babel-plugin-dynamic-import-node'],
      },
    },
  };
};
