import { showAlert } from '@/lib/alert';
// Register background location task before any React rendering
import '@/lib/backgroundLocationTask';

// Certificate pinning must be active before any network request
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
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider, useI18n } from '@/lib/i18nContext';
import { useQueryClient } from '@tanstack/react-query';
import { ServiceProvider, useService } from '@/lib/serviceContext';
import { ServiceControlProvider } from '@/lib/serviceControlContext';
import { AuthProvider, useAuth } from '@/lib/authContext';
import { SocketProvider, useSocket } from '@/lib/socketContext';
import { ReferralProvider } from '@/lib/referralContext';
import { ShuttleProvider } from '@/lib/shuttleContext';
import { navigateAfterAuth } from '@/lib/postAuthRouter';
import { ActiveSessionProvider, useActiveSession } from '@/lib/activeSessionContext';
import { setOnAccountSuspended, setOnSessionCleared, refreshAccessToken, endpoints } from '@/lib/api';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import { deleteToken, deleteRefreshToken } from '@/lib/auth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { GPSProvider } from '@/hooks/useGPSProvider';
import { ServerStatusBanner } from '@/components/ServerStatusBanner';
import { AppAlert } from '@/components/ui';

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

// verify-otp is excluded: the token does not exist yet during the sign-up OTP flow.
// Redirecting here would kick the user back to login right after registration.
const PRE_AUTH_SCREENS = new Set([
  'login',
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

/**
 * Listens for the server-initiated `force:disconnect` event, clears local
 * auth credentials, and redirects the driver to the suspended screen.
 * Navigation happens before token deletion so the auth guard's isSuspendedFlow
 * carve-out prevents it from bouncing the driver back to /login.
 */
function ForceDisconnectBridge() {
  const { socket } = useSocket();
  const { clearLocalSession } = useAuth();
  const router = useRouter();
  const handledRef = React.useRef(false);

  useEffect(() => {
    if (!socket) return;
    const handle = async (_data?: { reason?: string }) => {
      if (handledRef.current) return;
      handledRef.current = true;
      // Disconnect before any state or navigation changes so no more socket
      // events can be processed during the forced session shutdown.
      socket.disconnect();
      router.replace('/suspended');
      await clearLocalSession();
      queryClient.clear();
    };
    socket.on(SOCKET_EVENTS.FORCE_DISCONNECT, handle);
    return () => { socket.off(SOCKET_EVENTS.FORCE_DISCONNECT, handle); };
  }, [socket, clearLocalSession, router]);

  return null;
}

function SosAcknowledgementBridge() {
  const { socket } = useSocket();
  const { t } = useI18n();

  useEffect(() => {
    if (!socket) return;
    const handle = (data?: { ok?: boolean; message?: string; triggeredAt?: string }) => {
      showAlert(t.sos_ack_title, data?.message ?? t.sos_ack_msg);
    };
    socket.on(SOCKET_EVENTS.DRIVER_SOS_ACK, handle);
    return () => { socket.off(SOCKET_EVENTS.DRIVER_SOS_ACK, handle); };
  }, [socket, t]);

  return null;
}

/**
 * Activates the REST cold-start recovery path defined in the ActiveSession
 * contract (GET /api/driver/session) exactly once per authenticated session.
 *
 * Fires initializeActiveSession() as soon as:
 *   - auth loading has finished
 *   - a valid token is present
 *   - it has not already been called for the current login session
 *
 * Resets the guard when the token becomes null (logout) so the next login
 * triggers a fresh fetch. Does not read session state, does not navigate,
 * and does not interfere with the existing session:snapshot socket listener
 * inside ActiveSessionProvider, which continues to operate independently.
 */
function ActiveSessionInitBridge() {
  const { token, isLoading } = useAuth();
  const { initializeActiveSession } = useActiveSession();
  const hasInitializedRef = React.useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!token) {
      // Reset so the next successful login triggers a fresh initialization.
      hasInitializedRef.current = false;
      return;
    }
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    initializeActiveSession();
  }, [token, isLoading, initializeActiveSession]);

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

// Driver accounts are permanently locked to one service type at signup and
// can never switch interfaces, so the Shuttle interface (context, polling,
// queries) has no reason to exist for CAR/SCOOTER/DELIVERY accounts and
// vice versa. Only mount ShuttleProvider for shuttle accounts.
function ShuttleGate({ children }: { children: React.ReactNode }) {
  const { serviceType } = useService();
  if (serviceType !== 'SHUTTLE') return <>{children}</>;
  return <ShuttleProvider>{children}</ShuttleProvider>;
}

function RootLayoutNav() {
  const { token, isLoading, login, clearLocalSession } = useAuth();
  const { isLanguageLoading } = useI18n();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    setOnAccountSuspended(() => {
      router.replace('/suspended');
    });
  }, [router]);

  // Keep AuthContext in sync when the API client clears tokens after an
  // unrecoverable 401. Without this, AuthContext would still hold the old
  // token in React state while SecureStore is already empty, causing the
  // next cold start to require login without a visible reason this session.
  useEffect(() => {
    setOnSessionCleared(() => {
      clearLocalSession();
    });
  }, [clearLocalSession]);

  useEffect(() => {
    if (isLoading) return;
    // Guard: navigator tree not yet mounted — segments is empty on the very
    // first render cycle. Firing router.replace here causes the
    // "REPLACE action was not handled by any navigator" error.
    if ((segments as string[]).length === 0) return;

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
          // Access token is expired — attempt a silent refresh before giving up.
          // Do not delete the refresh token yet; it may still be valid.
          (async () => {
            const newToken = await refreshAccessToken();
            if (newToken) {
              // Refresh succeeded: update AuthContext state. The effect will
              // re-fire with the new token and continue the authenticated flow.
              await login(newToken);
            } else if (newToken === null) {
              // Refresh token itself was rejected (or none exists) — the
              // session is genuinely over.
              queryClient.clear();
              await deleteToken();
              await deleteRefreshToken();
              setTimeout(() => router.replace('/login'), 0);
            }
            // newToken === undefined: a network/server hiccup during
            // refresh, not a rejection — a server outage used to log every
            // driver out the moment their access token expired. Leave the
            // session as-is; this effect re-fires on the next token/segments
            // change and will retry then.
          })();
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

    // Block auto navigation during OTP flow — token does not exist yet
    if (isOtpFlow) return;

    if (inPreAuthZone) {
      navigateAfterAuth(token);
    }
  }, [token, isLoading, segments]);

  if (isLoading || isLanguageLoading) return null;

  return (
    <>
      <PushNotificationsBridge />
      <ForceDisconnectBridge />
      <SosAcknowledgementBridge />
      <ActiveSessionInitBridge />

      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="language-select" />
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
        <Stack.Screen name="trips/[tripId]" />
        <Stack.Screen name="ride-history/[rideId]" />
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
        sound: 'trip_request.wav',
      });
    }
  }, []);

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
                        <ActiveSessionProvider>
                          <ShuttleGate>
                            <ServiceControlProvider>
                              <GPSProvider>
                                <RootLayoutNav />
                              </GPSProvider>
                            </ServiceControlProvider>
                          </ShuttleGate>
                        </ActiveSessionProvider>
                      </SocketProvider>
                    </ReferralProvider>
                  </ServiceProvider>
                </I18nProvider>
              </KeyboardProvider>
              <ServerStatusBanner />
              <AppAlert />
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </AuthProvider>
  );
}