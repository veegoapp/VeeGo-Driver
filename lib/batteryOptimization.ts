/**
 * Advisory prompt asking the driver to exempt VeeGo Driver from OEM battery
 * optimization (Xiaomi/MIUI, Huawei, Oppo/ColorOS, Vivo, Samsung, ...).
 *
 * These OEM battery managers can suspend the app process and throttle FCM/Expo
 * push delivery even when the server sends a high-priority notification-type
 * message — no app code can override that without the user opting the app out
 * of the OEM's battery manager. This is Android-only; iOS has no equivalent
 * per-app battery-optimization concept.
 *
 * Non-blocking: unlike the background-location gate, this never prevents going
 * online — it just improves the odds that background ride offers arrive.
 */
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '@/lib/alert';

const DONT_ASK_KEY = 'battery_optimization_prompt_dismissed';
// Neither Expo nor this app has a way to ask Android whether the OEM battery
// exemption is actually already granted — "Don't ask again" is the only
// permanent opt-out. Dismissing with "Later" used to set nothing at all, so
// with no dismissed flag written, the prompt showed again on every single
// cold start forever, even for a driver who had already gone and granted the
// exemption via Settings. This cooldown makes "Later" mean "not now", not
// "ask me again in 5 seconds". Mirrors the passenger app's fix.
const LAST_SHOWN_KEY = 'battery_optimization_prompt_last_shown_at';
const REASK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type BatteryOptimizationStrings = {
  title: string;
  message: string;
  openSettingsLabel: string;
  dontAskLabel: string;
  laterLabel: string;
};

function openBatteryOptimizationSettings(): void {
  // Opens the system "Battery Optimization" app list. Deliberately not using
  // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (the direct per-app dialog) —
  // that requires declaring the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS manifest
  // permission, which Play Store restricts to apps with a narrow allowed-use
  // justification. The settings-list intent needs no extra permission.
  Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => {
    Linking.openSettings().catch(() => {});
  });
}

/** Shows the battery-optimization advisory once, unless the driver dismissed it for good. */
export async function maybePromptBatteryOptimization(strings: BatteryOptimizationStrings): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const dismissed = await AsyncStorage.getItem(DONT_ASK_KEY);
    if (dismissed === 'true') return;
    const lastShownRaw = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    const lastShown = lastShownRaw ? parseInt(lastShownRaw, 10) : 0;
    if (Number.isFinite(lastShown) && Date.now() - lastShown < REASK_COOLDOWN_MS) return;
  } catch {
    return;
  }

  AsyncStorage.setItem(LAST_SHOWN_KEY, String(Date.now())).catch(() => {});

  showAlert(strings.title, strings.message, [
    { text: strings.openSettingsLabel, onPress: openBatteryOptimizationSettings },
    {
      text: strings.dontAskLabel,
      onPress: () => { AsyncStorage.setItem(DONT_ASK_KEY, 'true').catch(() => {}); },
    },
    { text: strings.laterLabel, style: 'cancel' },
  ]);
}
