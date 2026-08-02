/**
 * Themed in-app alert — drop-in replacement for React Native's Alert.alert.
 *
 * Usage (same signature as Alert.alert):
 *   showAlert('Title')
 *   showAlert('Title', 'Message')
 *   showAlert('Title', 'Message', [{ text: 'OK' }, { text: 'Cancel', style: 'cancel' }])
 *
 * The AppAlert component (mounted once in _layout.tsx) registers itself as the
 * handler via _registerAlertHandler. Until it mounts, calls are silently ignored
 * (the app shows nothing during the brief font-loading phase anyway).
 */

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertConfig = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

let _handler: ((config: AlertConfig) => void) | null = null;

/** Called once by AppAlert on mount. */
export function _registerAlertHandler(fn: (config: AlertConfig) => void) {
  _handler = fn;
}

/** Drop-in replacement for Alert.alert — uses the themed in-app modal. */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  _handler?.({ title, message, buttons });
}
