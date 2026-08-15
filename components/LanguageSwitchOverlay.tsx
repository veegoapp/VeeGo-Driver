import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';

export function LanguageSwitchOverlay() {
  const { t } = useI18n();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    // Fade in + scale up
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
    ]).start();

    // Show veego-loader for ~1.3s then switch to checkmark
    const checkTimer = setTimeout(() => {
      setShowCheck(true);
      Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }).start();
    }, 1300);

    return () => {
      clearTimeout(checkTimer);
    };
  }, []);

  const checkScale = checkAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.15, 1] });

  return (
    <Animated.View style={[overlayStyles.root, { opacity: fadeAnim }]}>
      <Animated.View style={[overlayStyles.card, { transform: [{ scale: scaleAnim }] }]}>
        {/* Logo */}
        <View style={overlayStyles.logoRow}>
          <View style={overlayStyles.logoIcon}>
            <Text style={overlayStyles.logoArrow}>➤</Text>
          </View>
          <Text style={overlayStyles.logoText}>
            Vee<Text style={{ color: '#507BE9' }}>Go</Text>
          </Text>
        </View>

        {/* veego-loader / Checkmark */}
        <View style={overlayStyles.iconWrap}>
          {!showCheck ? (
            <AppLoader size={64} />
          ) : (
            <Animated.View style={[overlayStyles.checkCircle, { transform: [{ scale: checkScale }] }]}>
              <Text style={overlayStyles.checkMark}>✓</Text>
            </Animated.View>
          )}
        </View>

        <Text style={overlayStyles.label}>
          {showCheck ? t.done_exclaim : t.switching_language_msg}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const overlayStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,25,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#1e1e28',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 20,
    minWidth: 220,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#2d2d42',
    alignItems: 'center', justifyContent: 'center',
  },
  logoArrow: { fontSize: 16, color: '#fff' },
  logoText: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: -0.5 },
  iconWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#55c49a',
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { fontSize: 26, color: '#fff', fontFamily: 'Inter_700Bold' },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.2,
  },
});
