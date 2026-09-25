import { I18nManager } from 'react-native';
import type { Language } from './i18nContext';
import { useI18n } from './i18nContext';

// ── RTL engine ─────────────────────────────────────────────────────────────────
// React Native's native I18nManager.forceRTL() only takes visual effect after a
// full OS-level app relaunch (killing and restarting the process) — a JS bundle
// reload (expo-updates reloadAsync, DevSettings.reload) is NOT enough, so a
// language switch inside a running app never actually mirrors any layout. That
// made switching languages translate text but leave every row's element order
// untouched.
//
// So this app does NOT use the native RTL engine at all: forceRTL/allowRTL are
// kept permanently off, and direction is driven entirely by this app's own
// `isRTL` checks — flip row layouts with `isRTL ? 'row-reverse' : 'row'`, and
// use `TA`/`textAlign` + rtlIconStyle below for text alignment and directional
// icons. This makes language switches apply instantly, with no restart needed.
export function applyRTLEngine(_lang: Language): void {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

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

/**
 * Returns a style object that flips an icon for RTL layouts.
 * Apply directly to an icon's `style` prop when a wrapper View is unwanted.
 */
export function rtlIconStyle(isRTL: boolean): { transform: [{ scaleX: number }] } {
  return { transform: [{ scaleX: isRTL ? -1 : 1 }] };
}

/**
 * Hook that reads `isRTL` from context and returns the directional flip style.
 * Use inside any component that already has access to the I18n context.
 *
 *   const flipStyle = useRTLIconStyle();
 *   <ArrowRight style={flipStyle} />
 */
export function useRTLIconStyle(): { transform: [{ scaleX: number }] } {
  const { isRTL } = useI18n();
  return rtlIconStyle(isRTL);
}
