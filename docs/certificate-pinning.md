# Certificate Pinning (TODO #8)

## What's pinned

The Driver app pins the VeeGo backend's HTTPS certificate using **SSL public-key
pinning** via [`react-native-ssl-public-key-pinning`](https://github.com/frw/react-native-ssl-public-key-pinning).
It patches the native networking layer — OkHttp `CertificatePinner` on Android,
TrustKit on iOS — once at startup (`lib/certificatePinning.ts`, invoked from
`app/_layout.tsx` before any screen renders). Every request made through the
standard `fetch`/`XMLHttpRequest` APIs is covered automatically, including
`lib/api.ts`, `lib/socketContext.tsx`, and the direct-fetch calls in
`components/MapBackdrop.native.tsx`, `hooks/useRoadEta.ts`, and
`hooks/useRoadPolyline.ts` — **no call sites were changed**.

## Why this approach

- **Least invasive**: no existing networking code changes. The library hooks
  the OS-level HTTP client, not our `fetch()` call sites.
- **Expo-compatible, no eject**: works with Expo's managed workflow via a
  custom dev client / EAS build (config-plugin/autolinking, not a manual
  eject — the project already has no `ios`/`android` folders and relies on
  Expo's Continuous Native Generation, which this library is compatible
  with).
- **Fail-closed**: if the live certificate doesn't match a pinned hash, the
  native TLS handshake itself is aborted by TrustKit/OkHttp — the request
  fails, there is no fallback to an unpinned connection. In production, a
  missing pin configuration throws at startup instead of booting unprotected.
- Rejected alternative: pure-JS pinning is not possible — RN's `fetch`/`XHR`
  delegate TLS validation to the OS, so certificate pinning fundamentally
  requires a native module either way.

## Where the pins are configured

`EXPO_PUBLIC_CERT_PIN_SHA256` (see `.env.example`) — a comma-separated list of
base64-encoded SHA-256 hashes of the backend certificate's **public key**
(Subject Public Key Info), not the certificate or any private key. These
hashes are safe to ship in the client bundle.

The pinned hostname is derived automatically from `EXPO_PUBLIC_API_URL`, so
pinning always targets whatever backend the build is already configured to
talk to — it does not need to be set separately.

## Rotating the certificate

Always keep **at least 2 hashes** configured (primary + backup) — TrustKit on
iOS requires 2+ pins and will throw otherwise, and a backup pin lets you
rotate without locking out installed apps.

1. Generate the new certificate's public-key hash ahead of deploying it:
   ```sh
   openssl s_client -servername <host> -connect <host>:443 < /dev/null 2>/dev/null \
     | openssl x509 -pubkey -noout \
     | openssl pkey -pubin -outform der \
     | openssl dgst -sha256 -binary \
     | openssl enc -base64
   ```
2. Add the new hash to `EXPO_PUBLIC_CERT_PIN_SHA256` alongside the current one
   (comma-separated) and ship that build **before** the backend rotates to the
   new certificate.
3. Once the backend has fully rotated and the update has reached users, drop
   the old hash in a follow-up release.
4. Optional: set an `expirationDate` in `lib/certificatePinning.ts`'s
   `initializeSslPinning` call if you want pins to auto-expire as a safety net
   against a stale, un-updated client — not enabled by default here since it
   requires coordinating an app release before that date.

## Limitations

- **Requires a custom dev client / EAS build** — this will not run in Expo
  Go, since it relies on a native module. This does not require ejecting;
  it's the same native-build step already implied by other native modules in
  this app (e.g. `expo-secure-store`, `react-native-maps`).
- **iOS TLS session caching**: a successful connection made before pinning
  changes may be reused from cache; a device needs to restart the app for a
  revoked pin to actually be enforced.
- Only `fetch`/`XMLHttpRequest`-based requests are covered. Any future native
  networking library that bypasses these APIs would need its own pinning
  configuration.
- Not yet verified end-to-end against a real device build in this
  environment (no Android/iOS SDKs available here) — verify with a dev-client
  build before shipping to production.
