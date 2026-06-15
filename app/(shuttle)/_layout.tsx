import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShuttleTabBar } from '@/components/ShuttleTabBar';
import { useShuttle, type SlotReleasedAlert } from '@/lib/shuttleContext';
import { useDemoMode } from '@/lib/demo';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';
import { ReferralProvider } from '@/lib/referralContext';
import { useShuttleSocket } from '@/hooks/useShuttleSocket';
import { useI18n } from '@/lib/i18nContext';

function ShuttleReferralBridge() {
  useShuttleSocket();
  return null;
}

// ─── Slot-Released Toast ───────────────────────────────────────────────────────

function SlotReleasedToast() {
  const { slotReleasedAlert, dismissSlotReleasedAlert } = useShuttle();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const { t } = useI18n();

  const translateY = useRef(new Animated.Value(-120)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAlertRef = useRef<SlotReleasedAlert | null>(null);

  useEffect(() => {
    if (slotReleasedAlert) {
      activeAlertRef.current = slotReleasedAlert;

      if (timerRef.current) clearTimeout(timerRef.current);

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();

      timerRef.current = setTimeout(() => {
        slideOut();
      }, 5000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slotReleasedAlert]);

  const slideOut = (callback?: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(translateY, {
      toValue: -120,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      dismissSlotReleasedAlert();
      callback?.();
    });
  };

  const handlePress = () => {
    const alert = activeAlertRef.current;
    slideOut(() => {
      if (alert?.routeId != null) {
        router.push({
          pathname: '/(shuttle)/lines',
          params: { openRouteId: String(alert.routeId) },
        } as any);
      } else {
        router.push('/(shuttle)/lines' as any);
      }
    });
  };

  if (!slotReleasedAlert) return null;

  const label = slotReleasedAlert.routeName
    ? t.slot_available_route.replace('{name}', slotReleasedAlert.routeName)
    : t.slot_available;

  return (
    <Animated.View
      style={[
        styles.toastWrap,
        { top: topPad + 12, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable onPress={handlePress} style={styles.toastInner} android_ripple={{ color: '#e5e7eb' }}>
        <View style={styles.dot} />
        <Text style={styles.toastText} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.tapHint}>{t.tap_to_book_hint}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function ShuttleLayoutContent() {
  const { isDemoMode } = useDemoMode();
  const { isBlocked, status } = useServiceGuard('SHUTTLE');

  if (!isDemoMode && isBlocked) {
    return <ServiceBlockedScreen status={status} serviceName="Shuttle" />;
  }

  return (
    <ReferralProvider>
      <ShuttleReferralBridge />
      <View style={styles.root}>
        <Tabs
          tabBar={(props) => <ShuttleTabBar {...(props as any)} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="lines" options={{ title: 'Lines' }} />
          <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
          <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
        <SlotReleasedToast />
      </View>
    </ReferralProvider>
  );
}

export default function ShuttleLayout() {
  return <ShuttleLayoutContent />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toastWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 200,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    flexShrink: 0,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  tapHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#6b7280',
    flexShrink: 0,
  },
});
