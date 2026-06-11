import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

export type PushToken = string | null;

function safeSetNotificationHandler() {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // expo-notifications not available in this environment
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
      if (!cancelled) setToken(t ?? null);
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');

      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification: { request: { content: { data: Record<string, unknown> } } }) => {
          const data = notification.request.content.data;
          if (data?.type === 'ride_request' && onRideRequest) onRideRequest();
        },
      );

      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response: { notification: { request: { content: { data: Record<string, unknown> } } } }) => {
          const data = response.notification.request.content.data;

          if (data?.type === 'ride_request') {
            if (data.rideId) {
              router.push(`/ride/${data.rideId}` as any);
            } else if (onRideRequest) {
              onRideRequest();
            }
            return;
          }

          if (data?.type === 'shuttle_trip' && data.tripId) {
            router.push('/shuttle/trip-active');
            return;
          }

          // Fix 7: rate passengers after shuttle trip
          if (data?.type === 'rate_passengers' && data.tripId) {
            router.push({ pathname: '/shuttle/rate-passengers', params: { tripId: String(data.tripId) } } as any);
            return;
          }

          // Fix 8: offence notification routing
          if (data?.type === 'suspension' || data?.category === 'suspension') {
            router.replace('/suspended');
            return;
          }

          if (data?.type === 'fine' || data?.category === 'fine') {
            // Navigate to wallet — the deduction will be visible there
            router.push('/(tabs)/wallet' as any);
            return;
          }

          if (data?.type === 'warning' || data?.category === 'warning') {
            // Navigate to wallet (or offences screen if one exists)
            router.push('/(tabs)/wallet' as any);
            return;
          }
        },
      );
    } catch {
      // expo-notifications unavailable
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
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return undefined;
  }
}
