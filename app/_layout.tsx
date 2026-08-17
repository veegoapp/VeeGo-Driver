import { showAlert } from '@/lib/alert';
// Register background location task before any React rendering
import '@/lib/backgroundLocationTask';

import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
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

// Keep the native splash screen up until fonts, the stored-token check, and
// language init have all resolved (see the hideAsync() call in
// RootLayoutNav below). Without this, Expo auto-hides the native splash the
// moment JS starts executing — well before the auth check finishes — which
// on a cold launch can expose a blank frame or the OS's cached screenshot of
// whatever screen the app was last on (e.g. Login, if that's how the app was
// left) for the second or two it takes SecureStore + the auth guard to
// settle. Call this before any component renders — placement here, at
// module scope, guarantees it runs before RootLayout's first render.
SplashScreen.preventAutoHideAsync().catch(() => {});

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

/**
 * Reacts to the two criminal-record-suspension realtime events so a driver
 * who is currently inside the app doesn't have to background/reopen it (or
 * wait for the next Home focus) to see the effect:
 *  - NOTIFICATION_NEW with category "suspension" fires the instant
 *    checkCriminalRecordThreshold suspends the account (e.g. right after the
 *    driver completes their 30th trip) — redirect immediately instead of
 *    leaving them on Home where the GO toggle would otherwise let them try
 *    (and fail) to go online.
 *  - driver:account:reactivated fires when an admin approves the uploaded
 *    certificate — if the driver is sitting on the criminal-record-required
 *    screen, route them back into the app now that they're unblocked.
 */
function CriminalRecordEventsBridge() {
  const { socket } = useSocket();
  const { token } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = React.useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!socket) return;

    const handleNotificationNew = (data?: { category?: string }) => {
      if (data?.category !== 'suspension') return;
      router.replace('/criminal-record-required');
    };

    const handleReactivated = () => {
      showAlert(t.criminal_record_reactivated_title, t.criminal_record_reactivated_body);
      if (segmentsRef.current[0] === 'criminal-record-required') {
        navigateAfterAuth(token);
      }
    };

    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
    socket.on(SOCKET_EVENTS.DRIVER_ACCOUNT_REACTIVATED, handleReactivated);
    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNotificationNew);
      socket.off(SOCKET_EVENTS.DRIVER_ACCOUNT_REACTIVATED, handleReactivated);
    };
  }, [socket, token, t, router]);

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
  // Tracks how many times a transient refresh failure has been retried so we
  // can schedule a re-attempt without leaving the driver stuck on the splash
  // screen indefinitely. Capped at MAX_REFRESH_RETRIES to prevent loops.
  const [refreshAttempt, setRefreshAttempt] = React.useState(0);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide the native splash the moment fonts + the stored-token check +
  // language init have all resolved — exactly when the render below stops
  // returning null and mounts the real <Stack> (starting on the branded
  // `index` splash screen). This is the earliest point at which there's
  // real, correct content to show, so the handoff from native splash to
  // in-app splash is seamless with no blank/stale frame in between.
  useEffect(() => {
    if (isLoading || isLanguageLoading) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [isLoading, isLanguageLoading]);

  useEffect(() => {
    // Fires on ANY 403 account_suspended response — a blocked user (admin/
    // no-show) or a criminal-record-suspended driver whose online/busy
    // attempt was just rejected (see setDriverStatusUnified on the backend;
    // turning offline is always allowed and never reaches this path). Check
    // the reason before deciding where to send the driver: only the
    // criminal-record case gets the document-upload screen, everything else
    // keeps the existing "contact support" screen.
    setOnAccountSuspended(() => {
      endpoints.driver.me().then((me: any) => {
        router.replace(
          me?.status === 'suspended' && me?.suspensionReason === 'criminal_record_required'
            ? '/criminal-record-required'
            : '/suspended'
        );
      }).catch(() => router.replace('/suspended'));
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
            } else {
              // newToken === undefined: transient network/server hiccup during
              // refresh, not a token rejection. A server outage used to log every
              // driver out the moment their access token expired; we do not clear
              // the session over a dropped connection or a temporary 5xx.
              //
              // Schedule a retry so the driver is not permanently stuck on the
              // splash screen. Without this, the effect's deps ([token, isLoading,
              // segments]) do not change after an undefined result, so the effect
              // never re-fires and navigation never happens.
              // Cap at 3 attempts to prevent an infinite retry loop.
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              if (refreshAttempt < 3) {
                retryTimerRef.current = setTimeout(
                  () => setRefreshAttempt((n) => n + 1),
                  3000,
                );
              } else {
                // Retry cap reached — refresh never succeeded or definitively
                // failed. Do not leave the driver stuck on the splash screen
                // forever: treat it the same as a rejected refresh token.
                queryClient.clear();
                await clearLocalSession();
                setTimeout(() => router.replace('/login'), 0);
              }
            }
          })();
          return () => {
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
          };
        }
      }
    } catch {}

    // Redirects a suspended driver to the right screen: the criminal-record
    // flow if that's specifically why they're suspended, otherwise the
    // generic "contact support" screen. Resolves to true when a redirect was
    // issued, so callers waiting on it (the inPreAuthZone branch below) know
    // not to also navigate the driver into the app.
    const suspensionCheck: Promise<boolean> = endpoints.driver.me().then((me: any) => {
      if (me?.status === 'suspended') {
        router.replace(
          me?.suspensionReason === 'criminal_record_required'
            ? '/criminal-record-required'
            : '/suspended'
        );
        return true;
      }
      return false;
    }).catch(() => false);

    if (inPendingZone) return;

    // Block auto navigation during OTP flow — token does not exist yet
    if (isOtpFlow) return;

    if (inPreAuthZone) {
      // Wait for the suspension check before routing the driver into the app
      // — entering Home first and redirecting a moment later (once this
      // promise resolved) used to cause a visible flash into Home, and on a
      // dropped/slow connection could leave a suspended driver on Home
      // altogether since navigateAfterAuth used to fire immediately,
      // unsynchronized with this check.
      suspensionCheck.then((redirected) => {
        if (!redirected) navigateAfterAuth(token);
      });
    }
  }, [token, isLoading, segments, refreshAttempt]);

  if (isLoading || isLanguageLoading) return null;

  return (
    <>
      <PushNotificationsBridge />
      <ForceDisconnectBridge />
      <CriminalRecordEventsBridge />
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
        <Stack.Screen name="criminal-record-required" />
        <Stack.Screen name="vehicle" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="personal-info" />
        <Stack.Screen name="bonus-targets" />
        <Stack.Screen name="driver-referral" />
        <Stack.Screen name="shuttle/profile-info" />
        <Stack.Screen name="shuttle/trip-active" />
        <Stack.Screen name="shuttle/trip-details" />
        <Stack.Screen name="shuttle/referral-incoming" />
        <Stack.Screen name="shuttle/trip-complete" />
        <Stack.Screen name="shuttle/history" />
        <Stack.Screen name="shuttle/earnings" />
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
      // ── Why background alerts were silent (and kept coming back) ──────────────
      // On Android 8+ the sound of a notification shown while the app is in the
      // background is decided by its NOTIFICATION CHANNEL, and channels are
      // IMMUTABLE: once a channel id exists on a device, its sound can never be
      // changed — re-calling setNotificationChannelAsync with a new sound is a
      // silent no-op. The previous bug was that the sound-carrying channel id
      // (`ride-requests-v2`) was ALSO wired as the app's `defaultChannel` in the
      // expo-notifications plugin. That let Firebase/Android auto-create that
      // channel WITHOUT a custom sound (default tone) before this JS ever ran —
      // and from then on the channel was permanently stuck on the default tone.
      //
      // The durable fix has two parts:
      //   1. Fresh channel ids (`-v3`) so we start from clean, uncorrupted
      //      channels on every device.
      //   2. `defaultChannel` in app.json now points at a SEPARATE `default`
      //      channel (created below), so the sound channels are only ever
      //      created here — with their sound — and can never be auto-created
      //      soundless. Keep the backend push `channelId`s in sync with these.
      //
      // NOTE: this only takes effect in a native build (EAS build), not an OTA
      // update — the .wav files are bundled into the native binary. A fresh
      // channel id (v3) means no uninstall is needed; Android has never seen it.

      // Neutral default channel — target of app.json `defaultChannel` and of any
      // generic notification that carries no explicit channelId. Uses the system
      // default sound on purpose.
      Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2d2d42',
      });
      Notifications.setNotificationChannelAsync('ride-requests-v3', {
        name: 'Ride Requests',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2d2d42',
        sound: 'trip_request.wav',
      });
      Notifications.setNotificationChannelAsync('shuttle-alerts-v3', {
        name: 'Shuttle Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2d2d42',
        sound: 'shuttle_approaching.wav',
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