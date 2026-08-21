---
name: Expo app structure
description: Key structural facts about the VeeGo Driver frontend to avoid repeated exploration
---

# Expo App Structure

The React Native (Expo) frontend lives at the **monorepo root** — it is NOT a pnpm workspace package like the API server or DB package.

- `app/` — Expo Router screens (`(tabs)/index.tsx` = home, `ride/[id].tsx`, etc.)
- `components/` — shared UI (`MapBackdrop`, `GlassView`, etc.)
- `hooks/` — `useRideSocket.ts`, `useWaitingCharge.ts`, `useColors.ts`, etc.
- `lib/` — `api/` (domain-split backend endpoints, barrel at `lib/api/index.ts`), `i18nContext.tsx`
- `constants/socketEvents.ts` — all socket event name constants

## Platform split
- `MapBackdrop.native.tsx` is the real Google Maps implementation, used on iOS/Android
- `MapBackdrop.tsx` is a no-op stub (no map logic) that exists only so TypeScript/Expo Web can resolve the module on non-native targets; it re-exports `MapBackdropProps` and `SurgeZone`

## Workflow
- Workflow `VeeGo Driver` runs `bash setup.sh`
- Fails without `BACKEND_URL` env secret (pre-existing, unrelated to code)
