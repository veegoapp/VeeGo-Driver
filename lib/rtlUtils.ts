import type { Language } from './i18nContext';
import { useI18n } from './i18nContext';

// ── RTL layout strategy ───────────────────────────────────────────────────────
// This app does NOT use React Native's native RTL engine (I18nManager.forceRTL).
// It used to: every screen was ALSO hand-written with its own manual RTL
// styling (flexDirection: isRTL ? 'row-reverse' : 'row', textAlign, icon
// flips via rtlIconStyle below, etc.) — the intended single source of truth.
// With native forceRTL active on top of that, a plain 'row' under native RTL
// already renders right-to-left, so manually setting 'row-reverse' on top of
// it flipped a SECOND time and landed back in left-to-right visual order —
// silently undoing the manual RTL work on every row-based layout app-wide
// (tab order, icon/text pairs, button rows, etc.), while text alignment
// still looked fine since that doesn't double-flip the same way. That
// mismatch — text reads RTL but rows/controls sit LTR — is what made pages
// look "not RTL" despite an isRTL check on nearly every row in the app.
// Turning native RTL off and trusting the existing manual system as the only
// mechanism fixes every one of those rows at once, app-wide, without having
// to touch each screen individually.
export function applyRTLEngine(_lang: Language): void {
  // Intentionally a no-op — kept so existing call sites don't need to change.
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
