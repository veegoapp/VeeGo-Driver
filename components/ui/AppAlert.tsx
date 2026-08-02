/**
 * AppAlert — themed replacement for the native Alert.alert dialog.
 * Mount once inside RootLayout (above the Stack navigator). It registers
 * itself as the global handler via _registerAlertHandler so any showAlert()
 * call anywhere in the app reaches this component.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { _registerAlertHandler, type AlertButton, type AlertConfig } from '@/lib/alert';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';

export function AppAlert() {
  const colors = useColors();
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Register as the global handler on mount.
  useEffect(() => {
    _registerAlertHandler((cfg) => setConfig(cfg));
  }, []);

  // Animate in whenever a new alert appears.
  useEffect(() => {
    if (!config) return;
    scaleAnim.setValue(0.85);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 300,
        damping: 24,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [config]);

  const dismiss = (btn?: AlertButton) => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.88,
        useNativeDriver: true,
        stiffness: 400,
        damping: 20,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setConfig(null);
      btn?.onPress?.();
    });
  };

  if (!config) return null;

  const buttons: AlertButton[] =
    config.buttons && config.buttons.length > 0
      ? config.buttons
      : [{ text: 'OK' }];

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        const cancelBtn = buttons.find((b) => b.style === 'cancel');
        dismiss(cancelBtn);
      }}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={() => {
        const cancelBtn = buttons.find((b) => b.style === 'cancel');
        dismiss(cancelBtn);
      }}>
        <Animated.View
          style={[
            styles.backdropFill,
            { opacity: opacityAnim },
          ]}
        />
      </Pressable>

      {/* Card */}
      <View style={styles.centerer} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Title */}
          {!!config.title && (
            <Text
              style={[
                styles.title,
                { color: colors.foreground, fontFamily: 'Inter_700Bold' },
              ]}
            >
              {config.title}
            </Text>
          )}

          {/* Message */}
          {!!config.message && (
            <Text
              style={[
                styles.message,
                {
                  color: colors.mutedForeground,
                  fontFamily: 'Inter_400Regular',
                  marginTop: config.title ? Spacing.sm : 0,
                },
              ]}
            >
              {config.message}
            </Text>
          )}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Buttons */}
          <View
            style={[
              styles.buttonsRow,
              buttons.length === 1 && styles.buttonsRowSingle,
            ]}
          >
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const textColor = isDestructive
                ? colors.destructive
                : isCancel
                ? colors.mutedForeground
                : colors.accent;

              return (
                <React.Fragment key={String(i)}>
                  {i > 0 && (
                    <View
                      style={[
                        styles.btnDividerV,
                        { backgroundColor: colors.border },
                      ]}
                    />
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.btn,
                      buttons.length === 1 && styles.btnFull,
                      pressed && {
                        backgroundColor: colors.secondary,
                      },
                    ]}
                    onPress={() => dismiss(btn)}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        {
                          color: textColor,
                          fontFamily: isDestructive || !isCancel
                            ? 'Inter_700Bold'
                            : 'Inter_400Regular',
                        },
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  card: {
    width: '100%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    // No bottom padding — buttons row has its own padding
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  title: {
    fontSize: Typography.size.md,
    textAlign: 'center',
  },
  message: {
    fontSize: Typography.size.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginTop: Spacing.xl,
  },
  buttonsRow: {
    flexDirection: 'row',
    minHeight: 48,
  },
  buttonsRowSingle: {
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
    borderRadius: 0,
  },
  btnFull: {
    flex: 1,
  },
  btnDividerV: {
    width: 1,
  },
  btnText: {
    fontSize: Typography.size.sm,
  },
});
