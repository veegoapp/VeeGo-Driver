import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useService } from '@/lib/serviceContext';

interface GlassViewProps {
  style?: ViewStyle | ViewStyle[];
  strong?: boolean;
  children?: React.ReactNode;
  borderRadius?: number;
}

export function GlassView({ style, strong = false, children, borderRadius = 16 }: GlassViewProps) {
  const colors = useColors();
  const { isDarkMode } = useService();
  const bg = strong ? colors.glassStrong : colors.glass;
  const border = colors.border;

  // Dark mode: always flat — no blur overlays, no layered backgrounds.
  // Light mode on iOS: use native blur for the frosted-glass effect.
  if (Platform.OS === 'ios' && !isDarkMode) {
    return (
      <View style={[{ borderRadius, overflow: 'hidden', borderWidth: 1, borderColor: border }, style]}>
        <BlurView intensity={strong ? 80 : 60} tint="light" style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[{ backgroundColor: bg, borderRadius, borderWidth: 1, borderColor: border }, style]}>
      {children}
    </View>
  );
}
