import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { endpoints } from '@/lib/api';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_REGEX = /^\d+$/;
const VALID_TYPES = new Set(['ride_request', 'shuttle_trip', 'shuttle_referral', 'rate_passengers', 'renewal_prompt', 'slot_released', 'suspension', 'fine', 'warning']);

export type PushToken = string | null;

function safeSetNotificationHandler() {
  if (Platform.OS === 'web') return;
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
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
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
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    registerForPushNotifications().then(t => {
      if (!cancelled) {
        setToken(t ?? null);
        if (t) {
          endpoints.pushTokens.register(t).catch(() => {});
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
          if (data?.type === 'ride_request' && onRideRequest) onRideRequest();
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
          if (data?.type === 'ride_request') {
            if (data.rideId) {
              const rideId = String(data.rideId);
              if (!UUID_REGEX.test(rideId) && !INT_REGEX.test(rideId)) return;
              router.push(`/ride/${rideId}` as any);
            } else if (onRideRequest) {
              onRideRequest();
            }
            return;
          }

          // --- Active shuttle trip ---
          if (data?.type === 'shuttle_trip' && data.tripId) {
            router.push('/shuttle/trip-active');
            return;
          }

          // --- Shuttle trip referral (deep-link into referral-incoming screen) ---
          // Notification payload must include all IncomingReferralPayload fields
          // as top-level data keys alongside `type: "shuttle_referral"`.
          if (data?.type === 'shuttle_referral') {
            router.push({
              pathname: '/shuttle/referral-incoming',
              params: {
                referralId:    String(data.referralId    ?? ''),
                bookingId:     String(data.bookingId     ?? ''),
                routeName:     String(data.routeName     ?? ''),
                departureTime: String(data.departureTime ?? ''),
                fromStation:   String(data.fromStation   ?? ''),
                toStation:     String(data.toStation     ?? ''),
                ...(data.passengerCount != null && { passengerCount: String(data.passengerCount) }),
                ...(data.totalSeats     != null && { totalSeats:     String(data.totalSeats)     }),
                ...(data.lineNumber     != null && { lineNumber:     String(data.lineNumber)     }),
                ...(data.vehicleType    != null && { vehicleType:    String(data.vehicleType)    }),
                ...(data.weekStart      != null && { weekStart:      String(data.weekStart)      }),
              },
            } as any);
            return;
          }

          // --- Rate passengers after shuttle trip ---
          if (data?.type === 'rate_passengers' && data.tripId) {
            router.push({ pathname: '/shuttle/rate-passengers', params: { tripId: String(data.tripId) } } as any);
            return;
          }

          // --- Shuttle weekly renewal prompt (Wednesday 7:00 AM Cairo) ---
          // TODO: Backend Integration — sent by the Wednesday 7:00 AM cron job.
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

          // --- Slot released broadcast (Wednesday 17:00 Cairo grace period expired) ---
          // TODO: Backend Integration — sent to ALL drivers when a held slot is
          // released (driver declined or 10-hour deadline passed).
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

  return { token, permissionStatus };
}

async function registerForPushNotifications(): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return undefined;

    // Retrieve the Expo push token bound to this device + app.
    // TODO: Backend Integration - Save Expo Push Token
    // Forward this token to your backend immediately after retrieval:
    //   POST /driver/push-token  { token: tokenData.data }
    // The backend uses it to call Expo's push API when the driver is backgrounded.
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data as string;
  } catch {
    return undefined;
  }
}
