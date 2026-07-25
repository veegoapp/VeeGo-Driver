import { I18nManager } from 'react-native';
import type { Language } from './i18nContext';
import { useI18n } from './i18nContext';

// ── Apply I18nManager RTL engine state ────────────────────────────────────────
// Must be called any time the language preference changes.
// The OS layout engine caches the RTL flag at process start, so a full app
// restart is required for the change to take effect across all native views.
export function applyRTLEngine(lang: Language): void {
  const isArabic = lang === 'ar';
  I18nManager.allowRTL(isArabic);
  I18nManager.forceRTL(isArabic);
}

// ── Automatic app restart ─────────────────────────────────────────────────────
// Uses expo-updates as the primary mechanism (works in Expo Go + standalone).
// Falls back to RN's DevSettings.reload() in development if expo-updates throws.
// Must only be called AFTER language is persisted to AsyncStorage.
export function triggerAppRestart(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require('expo-updates');
    // reloadAsync() is async — we fire-and-forget; the process will be killed
    // by the OS before any subsequent JS runs.
    (Updates.reloadAsync as () => Promise<void>)().catch(() => {
      devSettingsReload();
    });
  } catch {
    devSettingsReload();
  }
}

export function devSettingsReload(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    NativeModules.DevSettings?.reload?.();
  } catch {
    // No restart path available — user must restart manually.
    // This should never be reached in a normal Expo Go / standalone build.
  }
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
