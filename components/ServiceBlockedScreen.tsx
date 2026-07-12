import { router } from 'expo-router';
import { Clock, WifiOff, Wrench, ArrowLeft, ArrowRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServiceStatus } from '@/lib/serviceControlContext';
import { useI18n } from '@/lib/i18nContext';
import { useColors } from '@/hooks/useColors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

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
  const { t, isRTL } = useI18n();
  const colors = useColors();
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
    status.displayMode === 'maintenance' ? t.service_blocked_maintenance_title
    : status.displayMode === 'coming_soon' ? t.service_blocked_coming_soon_title
    : status.displayMode === 'unavailable' ? t.service_blocked_unavailable_title
    : t.service_blocked_disabled_title;

  const message = status.message ?? (
    status.displayMode === 'maintenance'
      ? t.service_blocked_maintenance_msg
      : status.displayMode === 'coming_soon'
      ? t.service_blocked_coming_soon_msg
      : t.service_blocked_unavailable_msg
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
          <View style={[s.etaRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Clock size={14} color="rgba(255,255,255,0.6)" />
            <Text style={s.eta}>{t.service_blocked_back_online.replace('{eta}', status.eta)}</Text>
          </View>
        )}

        <View style={s.divider} />

        <Text style={s.redirectLabel}>
          {t.service_blocked_redirecting}{' '}
          <Text style={[s.redirectCount, { color: colors.info }]}>{countdown}s</Text>
        </Text>

        <Pressable
          style={({ pressed }) => [s.backBtn, isRTL && { flexDirection: 'row-reverse' }, pressed && { opacity: 0.75 }]}
          onPress={() => router.replace('/login')}
        >
          {isRTL ? <ArrowRight size={16} color="#1e1e28" /> : <ArrowLeft size={16} color="#1e1e28" />}
          <Text style={s.backBtnText}>{t.service_blocked_go_back}</Text>
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
    marginBottom: Spacing.sm,
  },
  serviceChip: {
    fontSize: 10,
    fontWeight: Typography.weight.bold,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.5,
    fontFamily: 'Inter_700Bold',
  },
  title: {
    fontSize: 26,
    fontWeight: Typography.weight.bold,
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.6,
    fontFamily: 'Inter_700Bold',
  },
  message: {
    fontSize: Typography.size.sm,
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
    fontWeight: Typography.weight.bold,
    fontFamily: 'Inter_700Bold',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#ffffff',
    borderRadius: 99,
    paddingHorizontal: 22,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  backBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: '#1e1e28',
    fontFamily: 'Inter_600SemiBold',
  },
});
