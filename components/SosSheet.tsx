import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Linking, I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoader } from '@/components/ui/AppLoader';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { ShieldAlert, Phone, Cross, MessageCircle, X, CheckCircle } from 'lucide-react-native';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import { Spacing } from '@/constants/spacing';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// Mirrors the passenger app's SafetySheet (components/shared/SafetySheet.tsx)
// pixel-for-pixel: same 3 actions, same "report to backend before the local
// action" ordering, same durable-SOS-event semantics server-side.
const C_RED = '#D92D20';
const C_ORANGE = '#EA580C';
const C_WHATSAPP = '#25D366';

type SosAction = 'call_police' | 'call_ambulance' | 'share_trip';

interface SosSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: 'ride' | 'shuttle';
  /** Required when mode === 'ride'. */
  rideId?: string | null;
  /** Required when mode === 'shuttle'. */
  tripId?: string | number | null;
  /** Shuttle only — the route's from/to, sent in the WhatsApp message instead
   *  of any passenger data (a shuttle trip carries multiple passengers, so
   *  there is no single "who" to name — the route is the useful context). */
  routeFrom?: string | null;
  routeTo?: string | null;
  /** Last-resort coordinates used when no fresh GPS fix is available. */
  fallbackCoords?: { latitude: number; longitude: number } | null;
}

type AlertState = 'idle' | 'sending' | 'sent' | 'failed';

interface EmergencyContact { name?: string | null; phone?: string | null; }

export function SosSheet({
  visible, onClose, mode, rideId, tripId, routeFrom, routeTo, fallbackCoords,
}: SosSheetProps) {
  const { t, isRTL } = useI18n();
  const S = useSplitColors();
  const styles = useMemo(() => makeStyles(S), [S]);
  const insets = useSafeAreaInsets();

  const [alertState, setAlertState] = useState<AlertState>('idle');
  const [contact, setContact] = useState<EmergencyContact | null>(null);

  // Prefetch the saved emergency contact so the WhatsApp share opens
  // instantly on tap. Best-effort — no contact just means a generic share.
  useEffect(() => {
    if (!visible) return;
    setAlertState('idle');
    endpoints.emergencyContact.get()
      .then((data) => setContact((data ?? null) as EmergencyContact | null))
      .catch(() => setContact(null));
  }, [visible]);

  const getCoords = useCallback(async (): Promise<{ lat: number | null; lng: number | null }> => {
    try {
      let status = (await Location.getForegroundPermissionsAsync()).status;
      if (status !== 'granted') {
        status = (await Location.requestForegroundPermissionsAsync()).status;
      }
      if (status === 'granted') {
        const last = await Location.getLastKnownPositionAsync();
        if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        return { lat: cur.coords.latitude, lng: cur.coords.longitude };
      }
    } catch {
      // fall through to fallbackCoords
    }
    return {
      lat: fallbackCoords?.latitude ?? null,
      lng: fallbackCoords?.longitude ?? null,
    };
  }, [fallbackCoords]);

  /**
   * Fire-and-forget durable alert to operations. Never blocks or delays the
   * local action (dialer/WhatsApp) — the driver's own action comes first.
   */
  const sendSos = useCallback(async (action: SosAction) => {
    if (mode === 'ride' && rideId == null) return;
    if (mode === 'shuttle' && tripId == null) return;
    setAlertState((s) => (s === 'sent' ? 'sent' : 'sending'));
    const { lat, lng } = await getCoords();
    try {
      if (mode === 'shuttle') {
        const notes = routeFrom || routeTo ? `${routeFrom ?? '—'} → ${routeTo ?? '—'}` : undefined;
        await endpoints.trips.sosAlert(String(tripId), {
          latitude: lat ?? 0,
          longitude: lng ?? 0,
          notes,
          action,
        });
      } else {
        await endpoints.rides.sos(rideId!, {
          ...(lat != null ? { latitude: lat } : {}),
          ...(lng != null ? { longitude: lng } : {}),
          action,
        });
      }
      setAlertState('sent');
    } catch {
      setAlertState((s) => (s === 'sent' ? 'sent' : 'failed'));
    }
  }, [mode, rideId, tripId, routeFrom, routeTo, getCoords]);

  const handleCallPolice = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sendSos('call_police');
    Linking.openURL('tel:122');
  }, [sendSos]);

  const handleCallAmbulance = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sendSos('call_ambulance');
    Linking.openURL('tel:123');
  }, [sendSos]);

  const handleShareTrip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendSos('share_trip');

    const { lat, lng } = await getCoords();
    const mapsLink = lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : '';

    // No passenger PII in this message — a shuttle trip carries several
    // passengers, and a ride's passenger identity isn't the driver's to
    // share. The route (shuttle) or ride reference (ride) plus location is
    // what an emergency contact actually needs.
    const lines: string[] = [t.safety_whatsapp_intro_driver];
    if (mode === 'shuttle') {
      if (routeFrom || routeTo) lines.push(`${routeFrom ?? '—'} → ${routeTo ?? '—'}`);
      if (tripId != null) lines.push(`Trip #${tripId}`);
    } else if (rideId != null) {
      lines.push(`Ride #${rideId}`);
    }
    if (mapsLink) lines.push(`${t.safety_location}: ${mapsLink}`);
    const message = encodeURIComponent(lines.join('\n'));

    const phoneClean = contact?.phone ? contact.phone.replace(/\D/g, '') : '';
    if (phoneClean) {
      Linking.openURL(`whatsapp://send?phone=${phoneClean}&text=${message}`).catch(() => {
        Linking.openURL(`https://wa.me/${phoneClean}?text=${message}`);
      });
    } else {
      Linking.openURL(`whatsapp://send?text=${message}`).catch(() => {
        Linking.openURL(`https://wa.me/?text=${message}`);
      });
    }
  }, [sendSos, getCoords, contact, mode, routeFrom, routeTo, tripId, rideId, t]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <View style={[styles.header, isRTL && styles.rowRTL]}>
            <View style={styles.shieldIcon}>
              <ShieldAlert size={20} color="#fff" />
            </View>
            <Text style={styles.title}>{t.safety_title}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.options}>
            <TouchableOpacity style={styles.optionBtn} onPress={handleCallPolice} activeOpacity={0.85}>
              <View style={[styles.optionIcon, { backgroundColor: 'rgba(217,45,32,0.1)' }]}>
                <Phone size={19} color={C_RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: C_RED }]}>{t.call_122}</Text>
                <Text style={styles.optionSub}>{t.call_122_sub}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={handleCallAmbulance} activeOpacity={0.85}>
              <View style={[styles.optionIcon, { backgroundColor: 'rgba(234,88,12,0.1)' }]}>
                <Cross size={19} color={C_ORANGE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: C_ORANGE }]}>{t.call_123}</Text>
                <Text style={styles.optionSub}>{t.call_123_sub}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={handleShareTrip} activeOpacity={0.85}>
              <View style={[styles.optionIcon, { backgroundColor: 'rgba(37,211,102,0.12)' }]}>
                <MessageCircle size={19} color={C_WHATSAPP} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: '#1CA855' }]}>{t.share_trip_whatsapp}</Text>
                <Text style={styles.optionSub}>{t.share_trip_whatsapp_sub}</Text>
              </View>
            </TouchableOpacity>

            {alertState === 'sending' && (
              <View style={[styles.statusRow, isRTL && styles.rowRTL]}>
                <AppLoader size={18} />
                <Text style={styles.statusSending}>{t.sos_alert_sending}</Text>
              </View>
            )}
            {alertState === 'sent' && (
              <View style={[styles.statusRow, isRTL && styles.rowRTL]}>
                <CheckCircle size={18} color="#0E9F8E" />
                <Text style={styles.statusSent}>{t.emergency_notified}</Text>
              </View>
            )}
            {alertState === 'failed' && (
              <Text style={styles.errorText}>{t.sos_error}</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      backgroundColor: S.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      paddingBottom: 16,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: 'rgba(0,0,0,0.14)',
      marginTop: 10,
      marginBottom: 16,
    },
    header: {
      backgroundColor: S.panel,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
      marginBottom: 18,
    },
    rowRTL: { flexDirection: 'row-reverse' },
    shieldIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(217,45,32,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: '800',
      color: '#fff',
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    options: { paddingHorizontal: 20, gap: 10 },
    optionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: S.hair,
      backgroundColor: S.card,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionLabel: {
      fontSize: 14.5,
      fontWeight: '800',
    },
    optionSub: {
      fontSize: 11.5,
      color: S.cap,
      marginTop: 2,
      fontWeight: '600',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      paddingTop: Spacing.sm,
    },
    statusSending: {
      fontSize: 13,
      color: S.inkSoft,
      fontWeight: '700',
    },
    statusSent: {
      fontSize: 13,
      color: '#0E9F8E',
      fontWeight: '800',
    },
    errorText: {
      textAlign: 'center',
      fontSize: 13,
      color: C_RED,
      fontWeight: '700',
      paddingTop: Spacing.sm,
    },
  });
}
