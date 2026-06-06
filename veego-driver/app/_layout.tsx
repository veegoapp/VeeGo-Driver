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
import { AuthProvider, useAuth } from '@/lib/authContext';

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

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen =
      segments[0] === 'login' ||
      segments[0] === 'language-select' ||
      segments[0] === 'index' ||
      segments[0] === 'onboarding';

    if (!token && !inAuthScreen) {
      queryClient.clear();
      router.replace('/login');
    }
  }, [token, isLoading, segments]);

  return (
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
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="service-select" />
      <Stack.Screen name="register-info" />
      <Stack.Screen name="selfie" />
    </Stack>
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
                  <ServiceProvider>
                    <RootLayoutNav />
                  </ServiceProvider>
                </I18nProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
