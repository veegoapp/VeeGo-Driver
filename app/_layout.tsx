// Register background location task before any React rendering
import '@/lib/backgroundLocationTask';

// Certificate pinning (TODO #8) must be active before any network request
// fires. Fail closed: an initialization error in production is rethrown so
// the app does not silently boot with an unpinned connection to the backend.
import { initializeCertificatePinning } from '@/lib/certificatePinning';
const _certPinningInit = initializeCertificatePinning().catch((err) => {
  console.error('[CertPinning] Failed to initialize certificate pinning:', err);
  if (!__DEV__) throw err;
});

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
import { I18nProvider, useI18n } from '@/lib/i18nContext';
import { useQueryClient } from '@tanstack/react-query';
import { ServiceProvider } from '@/lib/serviceContext';
import { ServiceControlProvider } from '@/lib/serviceControlContext';
import { AuthProvider, useAuth } from '@/lib/authContext';
import { SocketProvider, useSocket } from '@/lib/socketContext';
import { ReferralProvider, useReferral } from '@/lib/referralContext';
import { navigateAfterAuth } from '@/lib/postAuthRouter';
import { setOnAccountSuspended, endpoints } from '@/lib/api';
import { deleteToken, deleteRefreshToken } from '@/lib/auth';
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

// 🚀 FIX: removed verify-otp from pre-auth screens
const PRE_AUTH_SCREENS = new Set([
  'login',
  'language-select',
  'onboarding',
  'index',
]);

const PENDING_SCREENS = new Set([
  'pending-approval',
  'register-vehicle',
  'register-documents',
  'register-info',
  'register-service-type',
  'register-plate',
]);

function PushNotificationsBridge() {
  usePushNotifications();
  return null;
}

function ReferralSocketBridge() {
  const { socket } = useSocket();
  const { addIncomingReferral } = useReferral();

  useEffect(() => {
    if (!socket) return;

    const handleReferral = (data: any) => {
      addIncomingReferral({
        referralId: String(data.referralId ?? data.id ?? ''),
        bookingId: String(data.bookingId ?? ''),
        routeName: data.routeName ?? '',
        routeNameAr: data.routeNameAr,
        departureTime: data.departureTime ?? '',
        fromStation: data.fromStation ?? '',
        toStation: data.toStation ?? '',
        fromStationAr: data.fromStationAr,
        toStationAr: data.toStationAr,
        passengerCount: data.passengerCount,
        totalSeats: data.totalSeats,
        lineNumber: data.lineNumber,
        vehicleType: data.vehicleType,
        weekStart: data.weekStart,
      });
    };

    socket.on('shuttle:referral:incoming', handleReferral);
    return () => socket.off('shuttle:referral:incoming', handleReferral);
  }, [socket, addIncomingReferral]);

  return null;
}

function LanguageCacheInvalidator() {
  const { language } = useI18n();
  const queryClient = useQueryClient();
  const prevLang = React.useRef(language);

  useEffect(() => {
    if (prevLang.current !== null && prevLang.current !== language) {
      queryClient.invalidateQueries();
    }
    prevLang.current = language;
  }, [language]);

  return null;
}

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    setOnAccountSuspended(() => {
      router.replace('/suspended');
    });
  }, [router]);

  useEffect(() => {
    if (isLoading) return;
    // Guard: navigator tree not yet mounted — segments is empty on the very
    // first render cycle. Firing router.replace here causes the
    // "REPLACE action was not handled by any navigator" error.
    if (segments.length === 0) return;

    const currentScreen = segments[0] as string | undefined;
    const inPreAuthZone = !currentScreen || PRE_AUTH_SCREENS.has(currentScreen);
    const inPendingZone = !!currentScreen && PENDING_SCREENS.has(currentScreen);
    const isOtpFlow = currentScreen === 'verify-otp';
    // Account can be suspended before a token ever exists (e.g. login itself
    // returns 403 account_suspended) — same carve-out as isOtpFlow, so the
    // redirect below doesn't immediately bounce back to /login. Scoped to the
    // !token branch only: an authenticated user landing on /suspended must
    // stay put, which relies on inPreAuthZone (used further down for
    // navigateAfterAuth) staying false for this screen.
    const isSuspendedFlow = currentScreen === 'suspended';

    if (!token) {
      // Allow verify-otp without a token — the token doesn't exist yet during
      // the sign-up OTP flow. Redirecting here would kick the user back to login
      // right after registration.
      if (!inPreAuthZone && !isOtpFlow && !isSuspendedFlow) {
        queryClient.clear();
        // Defer to next tick so the navigator tree is fully mounted before
        // the REPLACE action is dispatched, preventing UnhandledAction errors.
        setTimeout(() => router.replace('/login'), 0);
      }
      return;
    }

    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        const payload = JSON.parse(atob(padded));

        if (payload.role && payload.role !== 'driver') {
          queryClient.clear();
          deleteToken();
          deleteRefreshToken();
          setTimeout(() => router.replace('/login'), 0);
          return;
        }

        if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000)) {
          queryClient.clear();
          deleteToken();
          deleteRefreshToken();
          setTimeout(() => router.replace('/login'), 0);
          return;
        }
      }
    } catch {}

    endpoints.driver.me().then((me: any) => {
      if (me && (me.isBlocked || me.isSuspended)) {
        router.replace('/suspended');
      }
    }).catch(() => {});

    if (inPendingZone) return;

    // 🚀 FIX: block ALL auto navigation during OTP flow
    if (isOtpFlow) return;

    if (inPreAuthZone) {
      navigateAfterAuth(token);
    }
  }, [token, isLoading, segments]);

  if (isLoading) return null;

  return (
    <>
      <PushNotificationsBridge />
      <ReferralSocketBridge />

      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="language-select" />
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(shuttle)" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ride/[rideId]" />
        <Stack.Screen name="ratings" />
        <Stack.Screen name="support" />
        <Stack.Screen name="safety" />
        <Stack.Screen name="documents" />
        <Stack.Screen name="vehicle" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="personal-info" />
        <Stack.Screen name="bonus-targets" />
        <Stack.Screen name="driver-referral" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="shuttle/profile-info" />
        <Stack.Screen name="shuttle/trip-active" />
        <Stack.Screen name="shuttle/boarding" />
        <Stack.Screen name="shuttle/trip-details" />
        <Stack.Screen name="shuttle/referral-incoming" />
        <Stack.Screen name="shuttle/trip-complete" />
        <Stack.Screen name="shuttle/history" />
        <Stack.Screen name="shuttle/earnings" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="register-info" />
        <Stack.Screen name="selfie" />
        <Stack.Screen name="suspended" />
        <Stack.Screen name="shuttle/rate-passengers" />
        <Stack.Screen name="verify-otp" />
        <Stack.Screen name="register-service-type" />
        <Stack.Screen name="register-vehicle" />
        <Stack.Screen name="register-plate" />
        <Stack.Screen name="register-documents" />
        <Stack.Screen name="pending-approval" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="auth/vehicle-specs" />
        <Stack.Screen name="shuttle/history-detail" />
        <Stack.Screen name="shuttle/referral-request" />
        <Stack.Screen name="shuttle/direct-cancel" />
        <Stack.Screen name="shuttle/trip-cancel" />
        <Stack.Screen name="shuttle/history-export" />
        <Stack.Screen name="ride/chat" />
        <Stack.Screen name="ride/history" />
        <Stack.Screen name="trips/[tripId]" />
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
                  <LanguageCacheInvalidator />
                  <ServiceProvider>
                    <ReferralProvider>
                      <SocketProvider>
                        <ServiceControlProvider>
                          <RootLayoutNav />
                        </ServiceControlProvider>
                      </SocketProvider>
                    </ReferralProvider>
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