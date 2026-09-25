// react-native-restart@0.1.0 ships a `types` field in its package.json that
// points at a path its own build doesn't produce (lib/typescript/src/index.d.ts
// vs. the actual lib/typescript/index.d.ts), so TS can't resolve it. Minimal
// ambient declaration until upstream fixes their packaging.
declare module 'react-native-restart' {
  const RNRestart: {
    restart: () => void;
  };
  export default RNRestart;
}
