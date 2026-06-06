import { router } from 'expo-router';
import { Clock, WifiOff, Wrench, ArrowLeft } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServiceStatus } from '@/lib/serviceControlContext';

const REDIRECT_DELAY_S = 3;

interface Props {
  status: ServiceStatus;
  serviceName?: string;
}

function IconFor({ mode }: { mode: string }) {
  const props = { size: 36, color: '#fff' };
  if (mode === 'maintenance') return <Wrench {...props} />;
  if (mode === 'coming_soon') return <Clock {...props} />;
  return <WifiOff {...props} />;
}

export function ServiceBlockedScreen({ status, serviceName }: Props) {
  const insets = useSafeAreaInsets();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_S);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing icon animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Countdown ticker
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const title =
    status.displayMode === 'maintenance' ? 'Under Maintenance'
    : status.displayMode === 'coming_soon' ? 'Coming Soon'
    : status.displayMode === 'unavailable' ? 'Service Unavailable'
    : 'Service Disabled';

  const message = status.message ?? (
    status.displayMode === 'maintenance'
      ? 'This service is temporarily under maintenance.'
      : status.displayMode === 'coming_soon'
      ? 'This service will be available soon.'
      : 'This service is currently not available.'
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      {/* Background gradient overlay */}
      <View style={s.gradient} />

      <View style={s.content}>
        <Animated.View style={[s.iconRing, { transform: [{ scale: pulseAnim }] }]}>
          <IconFor mode={status.displayMode} />
        </Animated.View>

        {serviceName && (
          <Text style={s.serviceChip}>{serviceName.toUpperCase()}</Text>
        )}

        <Text style={s.title}>{title}</Text>
        <Text style={s.message}>{message}</Text>

        {status.displayMode === 'maintenance' && status.eta && (
          <View style={s.etaRow}>
            <Clock size={14} color="rgba(255,255,255,0.6)" />
            <Text style={s.eta}>Back online: {status.eta}</Text>
          </View>
        )}

        <View style={s.divider} />

        <Text style={s.redirectLabel}>
          Returning to services in{' '}
          <Text style={s.redirectCount}>{countdown}s</Text>
        </Text>

        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.75 }]}
          onPress={() => router.replace('/service-select')}
        >
          <ArrowLeft size={16} color="#1e1e28" />
          <Text style={s.backBtnText}>Back to Services</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(61,82,213,0.08)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 36,
    gap: 14,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  serviceChip: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.5,
    fontFamily: 'Inter_700Bold',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.6,
    fontFamily: 'Inter_700Bold',
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  eta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Inter_400Regular',
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 6,
  },
  redirectLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Inter_400Regular',
  },
  redirectCount: {
    color: '#6b7fff',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 99,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e1e28',
    fontFamily: 'Inter_600SemiBold',
  },
});
