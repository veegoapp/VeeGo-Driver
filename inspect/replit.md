# VeeGo Driver App

## Project Overview

Driver-side mobile application for the VeeGo platform. Built with React Native (Expo SDK 54) + Expo Router. A single codebase serves two driver experiences selected by the backend-assigned service type:

- **Ride services** (Car / Scooter / Delivery) — go online, receive ride requests over WebSocket, drive pickup → dropoff, chat, track earnings.
- **Shuttle service** — book weekly route slots, run scheduled trips station-by-station, board passengers, manage bookings.

This repo is **mobile-only** — no backend code. The app talks to a separate VeeGo backend over HTTPS (REST) + Socket.IO.

## How to Run

The workflow runs `bash scripts/setup.sh` which:
1. Reads `EXPO_PUBLIC_API_URL` secret (falls back to demo mode if unset)
2. Writes `.env`
3. Installs dependencies via `pnpm install`
4. Starts Expo via tunnel (`pnpm exec expo start --tunnel --clear`)

Scan the QR code with **Expo Go** on your phone to preview the app.

## Required Secrets

| Secret | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL of the VeeGo backend API (e.g. `https://your-backend.replit.dev/api`) |
| `GOOGLE_MAPS_API_KEY_ANDROID` | Google Maps SDK key for Android |
| `GOOGLE_MAPS_API_KEY_IOS` | Google Maps SDK key for iOS |

Without `EXPO_PUBLIC_API_URL` the app starts in demo-only mode (no live backend calls).

## Tech Stack

- React Native 0.81 + Expo SDK 54 (new architecture, React Compiler experiment)
- Expo Router 6 (file-based routing, typed routes)
- TypeScript 5.9 (strict)
- TanStack React Query 5
- Socket.IO client 4
- react-native-maps (Google provider)
- pnpm workspace (app lives at repo root)

## Key Directories

```
app/              Expo Router screens (file-based routing)
components/       Shared UI components + design-system primitives
hooks/            Reusable hooks
lib/              Non-UI logic: API layer, i18n, auth, contexts
constants/        Design tokens (colors, spacing, typography, etc.)
assets/           Images, fonts, Lottie animations
scripts/          setup.sh (Replit bootstrap)
.agents/memory/   Architecture decision notes for AI/dev onboarding
```

## User Preferences

- Keep changes minimal and clean; avoid unnecessary restructuring.
- Do NOT touch `app/(tabs)/trips.tsx` or `app/ride/history.tsx` without explicit instruction — they serve different service types and are not redundant.
- Zero TypeScript errors required on every change.
- Bilingual support (English + Arabic) — all user-facing strings go in both `lib/i18n/translations/en.ts` and `lib/i18n/translations/ar.ts`.
