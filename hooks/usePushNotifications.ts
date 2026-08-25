import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import { endpoints } from '@/lib/api';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_REGEX = /^\d+$/;
// D7-2/D7-3: aligned with what the backend actually sends as push data.type
// (or, when no type is set, data.category) for Shuttle notifications.
// 'shuttle_trip' / 'shuttle_referral' / 'rate_passengers' were removed —
// confirmed via a backend-wide search that no push payload ever sets them
// (the referral flow is delivered over its own socket events instead, see
// hooks/useShuttleSocket.ts, not via push tap-navigation).
// 'ride_offer' (not 'ride_request') is what the backend actually sends for a
// ride offer — see lib/sendNotification.ts sendRideOfferExpoPush/FCMPush.
const VALID_TYPES = new Set(['ride_offer', 'shuttle_approaching', 'shuttle', 'shuttle_renewal', 'renewal_prompt', 'slot_released', 'suspension', 'fine', 'warning']);

export type PushToken = string | null;

function safeSetNotificationHandler() {
  // expo-notifications logs its own console.error on Android inside Expo Go SDK 53
  // ("remote notifications removed from Expo Go"). Suppress only that specific
  // message so the overlay doesn't appear; restore console.error immediately after.
  const _origError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('expo-notifications')) return;
    _origError.apply(console, args as Parameters<typeof console.error>);
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async (notification: any) => {
        // Ride-offer push is only there to alert a BACKGROUNDED/killed driver.
        // In the foreground the live socket already shows the offer sheet and
        // plays the in-app tone, so presenting the push too would double the
        // sound and stack a redundant banner over the sheet — suppress it
        // there. This does NOT mean suppressing it whenever this handler
        // runs: on Android (and on iOS while this app's background-location
        // task keeps it alive — see app.json isIosBackgroundLocationEnabled),
        // the JS engine keeps running for a while after the driver switches
        // to another app, so this handler DOES still fire for a backgrounded-
        // but-not-killed app — it is not iOS-suspended-only. The previous
        // unconditional suppression on `type === 'ride_offer'` silenced every
        // ride offer whenever the driver had merely switched apps (not just
        // when VeeGo Driver itself was on screen), which is exactly the
        // "driver has another app open and never hears/sees the request" bug.
        // AppState tells us whether the app is actually the one on screen —
        // only suppress when it genuinely is.
        const type = notification?.request?.content?.data?.type;
        const isForeground = AppState.currentState === 'active';
        if (type === 'ride_offer' && isForeground) {
          return {
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowAlert: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        return {
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    // expo-notifications not available in this environment (Expo Go SDK 53)
  } finally {
    console.error = _origError;
  }
}

safeSetNotificationHandler();

export function usePushNotifications(onRideRequest?: () => void) {
  const [token, setToken] = useState<PushToken>(null);
  const [fcmToken, setFcmToken] = useState<PushToken>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    registerForPushNotifications().then(({ expoToken, fcmToken: nativeFcmToken }) => {
      if (!cancelled) {
        setToken(expoToken ?? null);
        setFcmToken(nativeFcmToken ?? null);
        if (expoToken) {
          // Retry up to 2 times with a short delay before giving up silently.
          const registerWithRetry = async (attempt = 0): Promise<void> => {
            try {
              await endpoints.pushTokens.register(expoToken, Platform.OS as 'ios' | 'android' | 'web', nativeFcmToken);
            } catch (err) {
              if (attempt < 2) {
                await new Promise(res => setTimeout(res, 3000 * (attempt + 1)));
                if (!cancelled) return registerWithRetry(attempt + 1);
              }
              // All retries exhausted — app continues to function without push
              // notifications. Log for diagnostics (no token/PII, not shown to
              // the user); registration is attempted again automatically on
              // the next app launch/mount since this effect re-runs then.
              const reason = err instanceof Error ? err.message : String(err);
              console.error('[PushNotifications] Token registration failed after retries:', reason);
            }
          };
          registerWithRetry();
        }
      }
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');

      // Fired while the app is FOREGROUNDED — update in-app state / badges
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification: { request: { content: { data: Record<string, unknown> } } }) => {
          const data = notification.request.content.data;
          if (data?.type === 'ride_offer' && onRideRequest) onRideRequest();
        },
      );

      // Fired when the driver TAPS the notification from system tray (background / closed)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response: { notification: { request: { content: { data: Record<string, unknown> } } } }) => {
          const data = response.notification.request.content.data;

          // Validate notification type before processing
          const notifType = String(data?.type ?? data?.category ?? '');
          if (!VALID_TYPES.has(notifType)) return;

          // --- On-demand ride request ---
          if (data?.type === 'ride_offer') {
            if (data.rideId) {
              const rideId = String(data.rideId);
              if (!UUID_REGEX.test(rideId) && !INT_REGEX.test(rideId)) return;
              router.push(`/ride/${rideId}` as any);
            } else if (onRideRequest) {
              onRideRequest();
            }
            return;
          }

          // --- Shuttle station-approach alert (driver nearing next stop) ---
          // Payload from backend: { type: "shuttle_approaching", tripId, stationId }
          // (lib/sendNotification.ts). Reuses the same active-trip navigation
          // as the live in-progress screen — there is no separate destination.
          if (data?.type === 'shuttle_approaching' && data.tripId) {
            // Pass tripId explicitly — trip-active.tsx prefers this over
            // ShuttleContext's ambient "activeLine", which used to leave a
            // tap on a notification for a non-active trip landing on a
            // blank map with dashes everywhere.
            router.push({
              pathname: '/shuttle/trip-active' as any,
              params: { tripId: String(data.tripId) },
            });
            return;
          }

          // --- Admin route-booking management (cancelled/reassigned/assigned) ---
          // Sent with category "shuttle" (no `type`) via the shared sendNotification()
          // helper — no per-notification screen, so this lands on the driver's
          // Bookings tab where the affected booking's current state is visible.
          if (data?.type === 'shuttle' || data?.category === 'shuttle') {
            router.push('/(shuttle)/bookings' as any);
            return;
          }

          // --- Shuttle weekly renewal prompt (Wednesday 7:00 AM Cairo) ---
          // Sent by the Wednesday 7:00 AM cron job.
          // Payload from backend:
          //   { type: "renewal_prompt", bookingId, routeId, routeName, slotId, weekStart, deadline }
          // The driver is taken to their Bookings tab where the renewal banner
          // is already visible (bookings.tsx reads renewalDeadline from the
          // booking record and shows the "Confirm Renewal" / "Cancel Booking"
          // action buttons inside BookingDetailSheet).
          if (data?.type === 'renewal_prompt') {
            router.push('/(shuttle)/bookings' as any);
            return;
          }

          // --- Renewal window extended (admin action) ---
          // Sent with category "shuttle_renewal" (no `type`) — same destination
          // as the renewal prompt above, since it's the same booking's deadline.
          if (data?.type === 'shuttle_renewal' || data?.category === 'shuttle_renewal') {
            router.push('/(shuttle)/bookings' as any);
            return;
          }

          // --- Slot released broadcast (Wednesday 17:00 Cairo grace period expired) ---
          // Sent to ALL drivers when a held slot is released
          // (driver declined or 10-hour deadline passed).
          // Payload from backend:
          //   { type: "slot_released", routeId, routeName, slotId, weekStart }
          // Deep-links directly into the Lines screen so the driver can immediately
          // tap the newly available route and book the open slot.
          if (data?.type === 'slot_released') {
            router.push('/(shuttle)/lines' as any);
            return;
          }

          // --- Offence: account suspended — verify from server before redirecting ---
          if (data?.type === 'suspension' || data?.category === 'suspension') {
            (async () => {
              try {
                const me = await endpoints.driver.me() as { isBlocked?: boolean; isSuspended?: boolean } | null;
                if (me && (me.isBlocked || me.isSuspended)) {
                  router.replace('/suspended');
                }
              } catch {
                // do nothing — don't redirect based on unverified push data
              }
            })();
            return;
          }

          // --- Offence: fine deduction ---
          if (data?.type === 'fine' || data?.category === 'fine') {
            router.push('/(tabs)/wallet' as any);
            return;
          }

          // --- Offence: warning ---
          if (data?.type === 'warning' || data?.category === 'warning') {
            router.push('/(tabs)/wallet' as any);
            return;
          }
        },
      );
    } catch {
      // expo-notifications unavailable (Expo Go SDK 53)
    }

    return () => {
      cancelled = true;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [onRideRequest]);

  return { token, fcmToken, permissionStatus };
}

async function registerForPushNotifications(): Promise<{ expoToken?: string; fcmToken?: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return {};

    // Retrieve the Expo push token bound to this device + app.
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const expoToken = tokenData.data as string;

    // Native FCM device token — Android only. On iOS, getDevicePushTokenAsync()
    // returns a raw APNs token (type 'apns'), which Firebase Admin's
    // getMessaging().send({ token }) cannot use directly (it expects a real FCM
    // registration token), so we only register it as the FCM fallback route
    // when the platform actually produces one. iOS keeps working exactly as
    // before, on the Expo push token alone.
    let fcmToken: string | null = null;
    if (Platform.OS === 'android') {
      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        if (deviceToken?.type === 'fcm' && typeof deviceToken.data === 'string') {
          fcmToken = deviceToken.data;
        }
      } catch {
        // Native FCM token unavailable (e.g. Expo Go) — Expo push still works.
      }
    }

    return { expoToken, fcmToken };
  } catch (err) {
    // Do NOT swallow this silently. The most common cause on a real Android
    // build is a missing google-services.json / FCM configuration, which makes
    // getExpoPushTokenAsync() throw ("Default FirebaseApp is not initialized").
    // When that happens the driver gets NO push token at all, so no ride-offer
    // alert can ever reach a backgrounded/killed app. Surfacing the reason here
    // is what lets us tell "push infra not set up" apart from "code bug".
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[PushNotifications] Could not obtain a push token on ${Platform.OS}. ` +
        `Background ride-request alerts will NOT work until this is fixed. ` +
        `Reason: ${reason}`,
    );
    return {};
  }
}
