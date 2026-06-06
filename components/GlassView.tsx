import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface GlassViewProps {
  style?: ViewStyle | ViewStyle[];
  strong?: boolean;
  children?: React.ReactNode;
  borderRadius?: number;
}

export function GlassView({ style, strong = false, children, borderRadius = 16 }: GlassViewProps) {
  const colors = useColors();
  const bg = strong ? colors.glassStrong : colors.glass;
  const border = colors.border;

  if (Platform.OS === 'ios') {
    return (
      <View style={[{ borderRadius, overflow: 'hidden', borderWidth: 1, borderColor: border }, style]}>
        <BlurView intensity={strong ? 90 : 70} tint="dark" style={StyleSheet.absoluteFill} />
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
