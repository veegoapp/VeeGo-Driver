import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { rtlIconStyle } from '../rtlUtils';

// ── RTL Icon Utilities ─────────────────────────────────────────────────────────
//
// Use these whenever you render a directional icon (chevrons, arrows, progress
// indicators). The scaleX flip mirrors the icon horizontally for RTL layouts
// without affecting absolute position tracking or z-ordering.
//
// Usage — wrapper component:
//   <DirectionalIcon isRTL={isRTL}><ArrowRight size={18} color="#1e1e28" /></DirectionalIcon>
//
// Usage — inline style helper:
//   <ArrowRight style={rtlIconStyle(isRTL)} />
//   const style = useRTLIconStyle();   // reads isRTL from context automatically

export interface DirectionalIconProps {
  isRTL: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Wraps any icon component and mirrors it horizontally when the layout is RTL. */
export function DirectionalIcon({ isRTL, children, style }: DirectionalIconProps) {
  return (
    <View style={[rtlIconStyle(isRTL), style]} pointerEvents="none">
      {children}
    </View>
  );
}
