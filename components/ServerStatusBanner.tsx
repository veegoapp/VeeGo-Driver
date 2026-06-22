import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Wifi } from 'lucide-react-native';
import { API_BASE_URL } from '@/lib/api';

const PING_INTERVAL_MS  = 8000;  // check every 8 seconds
const RECONNECT_SHOW_MS = 2500;  // show "Connected" toast for 2.5s then hide

type BannerState = 'hidden' | 'offline' | 'reconnected';

export function ServerStatusBanner() {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  const [banner, setBanner] = useState<BannerState>('hidden');
  const wasOfflineRef = useRef(false);
  const translateY = useRef(new Animated.Value(-80)).current;
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideIn = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    Animated.spring(translateY, {
      toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18,
    }).start();
  };

  const slideOut = () => {
    Animated.timing(translateY, {
      toValue: -80, useNativeDriver: true, duration: 300,
    }).start(() => setBanner('hidden'));
  };

  useEffect(() => {
    const check = async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 4000);
        await fetch(`${API_BASE_URL}/health`, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(timeout);

        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          setBanner('reconnected');
          slideIn();
          hideTimer.current = setTimeout(slideOut, RECONNECT_SHOW_MS);
        }
      } catch {
        if (!wasOfflineRef.current) {
          wasOfflineRef.current = true;
          setBanner('offline');
          slideIn();
        }
      }
    };

    check();
    const interval = setInterval(check, PING_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (banner === 'hidden') return null;

  const isOffline = banner === 'offline';

  return (
    <Animated.View
      style={[
        styles.wrap,
        { top: topPad, transform: [{ translateY }] },
        isOffline ? styles.offlineBg : styles.onlineBg,
      ]}
      pointerEvents="none"
    >
      <View style={styles.inner}>
        {isOffline
          ? <WifiOff size={14} color="#fff" strokeWidth={2.5} />
          : <Wifi     size={14} color="#fff" strokeWidth={2.5} />
        }
        <Text style={styles.text}>
          {isOffline
            ? 'Server offline — check Replit is running'
            : 'Server reconnected ✓'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  offlineBg: { backgroundColor: '#dc2626' },
  onlineBg:  { backgroundColor: '#16a34a' },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
