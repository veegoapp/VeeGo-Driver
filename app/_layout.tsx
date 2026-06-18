import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider } from '@/lib/i18nContext';
import { ServiceProvider } from '@/lib/serviceContext';
import { ServiceControlProvider } from '@/lib/serviceControlContext';
import { AuthProvider, useAuth } from '@/lib/authContext';
import { SocketProvider } from '@/lib/socketContext';
import { navigateAfterAuth } from '@/lib/postAuthRouter';
import { setOnAccountSuspended } from '@/lib/api';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ServerStatusBanner } from '@/components/ServerStatusBanner';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
  },
});

// Screens that only unauthenticated users should ever see.
// Authenticated users landing on any of these are redirected to the dashboard.
const PRE_AUTH_SCREENS = new Set(['login', 'language-select', 'onboarding', 'index']);

// Screens that authenticated-but-pending drivers are allowed to stay on.
const PENDING_SCREENS = new Set([
  'pending-approval',
  'register-vehicle',
  'register-documents',
  'register-info',
  'verify-otp',
  'register-service-type',
  'register-plate',
]);

/**
 * PushNotificationsBridge — zero-render component.
 * Mounts the push notification listeners inside the router context so that
 * deep-link navigation (router.push) works correctly when the driver taps a
 * notification from the system tray while the app is backgrounded or closed.
 */
function PushNotificationsBridge() {
  usePushNotifications();
  return null;
}

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Fix 8: redirect to /suspended whenever any API call returns 403 account_suspended
  useEffect(() => {
    setOnAccountSuspended(() => {
      router.replace('/suspended');
    });
  }, [router]);

  useEffect(() => {
    // Wait until auth state is fully resolved before making any routing decision.
    if (isLoading) return;

    // segments[0] is undefined at the root route "/" (app/index.tsx).
    const currentScreen = segments[0] as string | undefined;
    const inPreAuthZone = !currentScreen || PRE_AUTH_SCREENS.has(currentScreen);
    const inPendingZone = !!currentScreen && PENDING_SCREENS.has(currentScreen);

    if (!token) {
      // Unauthenticated user on a protected screen → send to login.
      if (!inPreAuthZone) {
        queryClient.clear();
        router.replace('/login');
      }
      return;
    }

    // Authenticated user on a registration/pending screen → leave them there.
    if (inPendingZone) return;

    // Authenticated user on a pre-auth screen (splash, onboarding, login) →
    // check registration progress and route to the correct next step.
    if (inPreAuthZone) {
      navigateAfterAuth(token);
    }
  }, [token, isLoading, segments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hold the stack while auth is resolving to prevent any flash of pre-auth screens.
  if (isLoading) return null;

  return (
    <>
      <PushNotificationsBridge />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="language-select" />
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(shuttle)" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ride/[rideId]" />
        <Stack.Screen name="ratings" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="support" />
        <Stack.Screen name="safety" />
        <Stack.Screen name="documents" />
        <Stack.Screen name="vehicle" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="shuttle/trip-active" />
        <Stack.Screen name="shuttle/boarding" />
        <Stack.Screen name="shuttle/trip-details" />
        <Stack.Screen name="shuttle/referral-incoming" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="shuttle/trip-complete" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="shuttle/history" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="shuttle/earnings" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="register-info" />
        <Stack.Screen name="selfie" />
        <Stack.Screen name="suspended" options={{ gestureEnabled: false }} />
        <Stack.Screen name="shuttle/rate-passengers" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="verify-otp" />
        <Stack.Screen name="register-service-type" />
        <Stack.Screen name="register-vehicle" />
        <Stack.Screen name="register-plate" />
        <Stack.Screen name="register-documents" />
        <Stack.Screen name="pending-approval" />
        <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auth/vehicle-specs" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (Constants.appOwnership !== 'expo' && Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('ride-requests', {
        name: 'Ride Requests',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2d2d42',
        sound: 'default',
      });
      Notifications.setNotificationChannelAsync('shuttle-referrals', {
        name: 'Shuttle Referrals',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#f97316',
        sound: 'default',
        description: 'Trip referral requests from colleagues',
      });
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <I18nProvider>
                  <ServiceProvider>
                    <SocketProvider>
                      <ServiceControlProvider>
                        <RootLayoutNav />
                      </ServiceControlProvider>
                    </SocketProvider>
                  </ServiceProvider>
                </I18nProvider>
              </KeyboardProvider>
              <ServerStatusBanner />
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
