import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export function LanguageSwitchOverlay() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const checkAnim = useRef(new Animated.Value(0)).current;
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    // Fade in + scale up
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
    ]).start();

    // Spin the ring for ~1.3s then switch to checkmark
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    );
    spinLoop.start();

    const checkTimer = setTimeout(() => {
      spinLoop.stop();
      setShowCheck(true);
      Animated.spring(checkAnim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }).start();
    }, 1300);

    return () => {
      clearTimeout(checkTimer);
      spinLoop.stop();
    };
  }, []);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
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
            Vee<Text style={{ color: '#55c49a' }}>Go</Text>
          </Text>
        </View>

        {/* Spinner / Checkmark */}
        <View style={overlayStyles.iconWrap}>
          {!showCheck ? (
            <Animated.View style={[overlayStyles.spinner, { transform: [{ rotate: spin }] }]} />
          ) : (
            <Animated.View style={[overlayStyles.checkCircle, { transform: [{ scale: checkScale }] }]}>
              <Text style={overlayStyles.checkMark}>✓</Text>
            </Animated.View>
          )}
        </View>

        <Text style={overlayStyles.label}>
          {showCheck ? 'Done!' : 'Switching language…'}
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
  spinner: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 3,
    borderColor: '#55c49a',
    borderTopColor: 'transparent',
  },
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
