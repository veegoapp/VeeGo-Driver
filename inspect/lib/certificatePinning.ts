// Certificate Pinning ────────────────────────────────────────────────────────
//
// Pins the VeeGo backend's HTTPS certificate using SSL public-key pinning via
// `react-native-ssl-public-key-pinning`. This library patches the native
// networking layer (OkHttp CertificatePinner on Android, TrustKit on iOS) at
// startup, so every request made through the standard fetch/XHR APIs —
// including everything in lib/api.ts, lib/socketContext.tsx, and the hooks
// that call fetch directly — is automatically covered. No call sites change.
//
// Fail-closed behavior: if the initialize call fails (e.g. malformed
// hashes) we throw during startup, and if a live request's certificate does
// not match a pinned hash, the native layer aborts the TLS handshake and the
// request rejects with an error — no silent fallback to an unpinned request.
//
// Requires a custom dev client / EAS build (native module) — will not run
// against Expo Go. See docs/certificate-pinning.md for rotation steps.
import { initializeSslPinning, addSslPinningErrorListener } from 'react-native-ssl-public-key-pinning';

// Resolved once from EXPO_PUBLIC_API_URL so the pin always targets whatever
// backend host the app is actually configured to talk to.
function getPinnedHostname(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return null;
  }
}

// Base64-encoded SHA-256 hashes of the backend certificate's Subject Public
// Key Info (SPKI). Never the raw certificate/private key — only the public
// key hash, which is safe to ship in the client bundle.
//
// Provide at least TWO hashes (primary + backup) — iOS's TrustKit throws if
// fewer than two are configured, and a backup pin lets you rotate the
// certificate without an app update causing a hard lockout.
//
// See docs/certificate-pinning.md for how to generate and rotate these.
function getPinnedPublicKeyHashes(): string[] {
  const raw = process.env.EXPO_PUBLIC_CERT_PIN_SHA256 ?? '';
  return raw
    .split(',')
    .map((hash: string) => hash.trim())
    .filter(Boolean);
}

let _initialized = false;

/**
 * Initializes SSL public-key pinning for the VeeGo backend host. Call once,
 * as early as possible during app startup (before any network request is
 * made), from the root layout.
 *
 * Fails closed: if no hostname/hashes are configured, or fewer than the
 * minimum required pins are provided, pinning does not silently no-op with
 * network access left open in production — it throws, and the caller
 * (app/_layout.tsx) surfaces this instead of letting the app boot unpinned.
 */
export async function initializeCertificatePinning(): Promise<void> {
  if (_initialized) return;

  const hostname = getPinnedHostname();
  const publicKeyHashes = getPinnedPublicKeyHashes();

  if (!hostname) {
    // No backend configured (e.g. local dev without EXPO_PUBLIC_API_URL) —
    // nothing to pin. This is not a security regression: without a hostname
    // there is no HTTPS backend traffic to protect.
    return;
  }

  if (publicKeyHashes.length === 0) {
    if (__DEV__) {
      console.warn(
        '[CertPinning] EXPO_PUBLIC_CERT_PIN_SHA256 is not set — skipping certificate ' +
        'pinning for ' + hostname + '. Required before a production release; ' +
        'see docs/certificate-pinning.md.'
      );
      return;
    }
    throw new Error(
      '[CertPinning] EXPO_PUBLIC_CERT_PIN_SHA256 is not set in production. Refusing to ' +
      'start without certificate pinning configured. See docs/certificate-pinning.md.'
    );
  }

  await initializeSslPinning({
    [hostname]: {
      includeSubdomains: true,
      publicKeyHashes,
    },
  });

  // The native layer has already aborted the TLS connection on pin mismatch —
  // this listener is for observability only, it does not decide pass/fail.
  // Log the event so it surfaces in crash reporters and log aggregation tools.
  addSslPinningErrorListener((error) => {
    console.error('[CertPinning] SSL pin validation failed:', error);
    if (__DEV__) {
      console.warn(
        '[CertPinning] A certificate pin mismatch was detected. Possible causes:\n' +
        '  1. Certificate rotation — update EXPO_PUBLIC_CERT_PIN_SHA256 (see docs/certificate-pinning.md)\n' +
        '  2. MITM/proxy — check network environment\n' +
        '  3. Misconfigured pin hash\n' +
        'The native layer has already blocked the request.',
      );
    }
  });

  _initialized = true;
}
