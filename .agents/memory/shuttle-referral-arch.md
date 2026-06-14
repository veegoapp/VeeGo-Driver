---
name: Shuttle referral architecture
description: How the incoming-referral notification badge is wired across the shuttle tab bar, home screen, and socket layer.
---

## Pattern

`lib/referralContext.tsx` is a React Context (no Zustand) that holds `pendingReferrals[]` and exposes `addIncomingReferral`, `dismissReferral`, `clearReferralBadge`.

`hooks/useShuttleSocket.ts` — mirrors the stable-ref pattern of `useRideSocket.ts`. Binds `shuttle:referral:incoming` and `shuttle:referral:cancelled` on the shared socket instance from `socketContext`.

`app/(shuttle)/_layout.tsx` mounts a zero-render `ShuttleReferralBridge` component inside `ReferralProvider` to call `useShuttleSocket()`. This ensures the hook runs inside both `ReferralProvider` and `SocketProvider` contexts without polluting any screen.

`components/ShuttleTabBar.tsx` reads `useReferral()` to overlay a red badge dot on the Home (index 0) tab icon.

`app/(shuttle)/index.tsx` renders an orange banner CTA when `incomingReferralsCount > 0`, navigating to `referral-incoming` with the first pending referral's params.

`app/shuttle/referral-incoming.tsx` calls `dismissReferral(referralId)` in a `useEffect` on mount to auto-clear the badge when the screen is viewed.

## New route paths need `as any` cast

Expo Router generates typed route strings from the file system at bundle time. Newly created files (`/shuttle/trip-details`, etc.) are not in the compiled type list until the Metro bundler runs. Add `as any` to `pathname` strings for new routes — the cast can be removed after the first successful build regenerates the types.

**Why:** TypeScript strict mode on Expo Router's typed routes rejects unknown strings at compile time; `as any` is the standard escape hatch until types are regenerated.

## expo-clipboard not installed

`expo-clipboard` is not in `package.json`. Use `navigator.clipboard.writeText()` for web + `Alert.alert` as native fallback instead of importing the module.
