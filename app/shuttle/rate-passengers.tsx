import { showAlert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoader } from '@/components/ui/AppLoader';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { useSplitColors, type SplitColors } from '@/lib/splitTheme';

// "C" split-panel palette — matches the ride/shuttle screens.
const C_STARC = '#F5A623';

type Passenger = {
  id: string;
  name: string;
  avatar?: string;
  rated: boolean;
  stars: number;
};

type BackendPassenger = {
  id: string;
  passengerName?: string;
  passengerAvatar?: string;
  status?: string;
};

export default function RatePassengersScreen() {
  const { t } = useI18n();
  const S = useSplitColors();
  const s = useMemo(() => makeStyles(S), [S]);
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const raw = await endpoints.shuttle.passengers(tripId) as unknown;
        const list: BackendPassenger[] = Array.isArray(raw)
          ? raw
          : ((raw as { data?: BackendPassenger[]; passengers?: BackendPassenger[] })?.data
              ?? (raw as { passengers?: BackendPassenger[] })?.passengers
              ?? []);
        const boarded = list.filter(p => p.status !== 'absent');
        setPassengers(
          boarded.map(p => ({
            id: p.id,
            name: p.passengerName ?? t.passenger_fallback,
            avatar: p.passengerAvatar,
            rated: false,
            stars: 5,
          }))
        );
      } catch {
        showAlert(t.error, t.load_passengers_err);
      } finally {
        setLoading(false);
      }
    })();
  }, [tripId]);

  const setStar = (passengerId: string, stars: number) => {
    setPassengers(prev =>
      prev.map(p => p.id === passengerId ? { ...p, stars } : p)
    );
  };

  const handleSubmit = async () => {
    if (!tripId) return;
    setSubmitting(true);
    const unrated = passengers.filter(p => !p.rated);
    let allOk = true;
    for (const p of unrated) {
      try {
        await endpoints.shuttle.ratePassenger(tripId, p.id, p.stars);
        setPassengers(prev =>
          prev.map(x => x.id === p.id ? { ...x, rated: true } : x)
        );
      } catch (err) {
        if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
          // Already rated — skip silently
          setPassengers(prev =>
            prev.map(x => x.id === p.id ? { ...x, rated: true } : x)
          );
        } else {
          allOk = false;
        }
      }
    }
    setSubmitting(false);
    if (allOk) {
      setDone(true);
      setTimeout(() => {
        router.back();
      }, 2000);
    } else {
      showAlert(t.partial_rating_err_title, t.partial_rating_err_msg);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <AppLoader />
      </View>
    );
  }

  if (done) {
    return (
      <View style={s.center}>
        <View style={s.doneCircleC}>
          <Star size={30} color="#ffffff" fill="#ffffff" strokeWidth={0} />
        </View>
        <Text style={s.doneTitleC}>{t.ratings_sent}</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={[s.headerC, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtnC}>
          <ChevronLeft size={20} color="#ffffff" strokeWidth={2} />
        </Pressable>
        <Text style={s.headerCapC}>{t.trip_completed_title}</Text>
        <Text style={s.pageTitleC}>{t.rate_passengers_title}</Text>
        <Text style={s.pageSubC}>
          {t.n_passengers_to_rate.replace('{n}', String(passengers.length))}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingBottom: botPad + 100, paddingHorizontal: Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {passengers.length === 0 ? (
          <View style={[s.center, { flex: 0, marginTop: 60 }]}>
            <Text style={s.emptyTextC}>{t.no_passengers_to_rate}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {passengers.map(p => (
              <View key={p.id} style={s.cardC}>
                <View style={s.cardRow}>
                  {p.avatar ? (
                    <Image source={{ uri: p.avatar }} style={s.avatarC} contentFit="cover" />
                  ) : (
                    <View style={s.avatarFallbackC}>
                      <Text style={{ fontSize: Typography.size.lg }}>👤</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.passengerNameC}>{p.name}</Text>
                    {p.rated && <Text style={s.ratedTextC}>{t.rated_label}</Text>}
                  </View>
                </View>
                <View style={s.starsRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Pressable
                      key={n}
                      onPress={() => !p.rated && setStar(p.id, n)}
                      disabled={p.rated}
                      hitSlop={6}
                    >
                      <Star
                        size={32}
                        color={n <= p.stars ? C_STARC : '#D3D6DA'}
                        fill={n <= p.stars ? C_STARC : 'transparent'}
                        strokeWidth={n <= p.stars ? 0 : 1.4}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {passengers.length > 0 && (
        <View style={[s.bottomAction, { paddingBottom: botPad + 12 }]}>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[s.submitBtnC, { opacity: submitting ? 0.7 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={s.submitBtnTextC}>{t.submit_ratings_btn}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function makeStyles(S: SplitColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: S.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, backgroundColor: S.bg },

  // Dark header band
  headerC: { backgroundColor: S.panel, paddingHorizontal: Spacing.lg, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  backBtnC: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 14 },
  headerCapC: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, color: S.capOnDark, textTransform: 'uppercase' },
  pageTitleC: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#ffffff', marginTop: 6 },
  pageSubC: { fontSize: Typography.size.sm, fontFamily: 'Inter_600SemiBold', color: '#B7BBC2', marginTop: 3 },

  // Passenger cards
  cardC: { backgroundColor: S.card, borderRadius: 18, padding: Spacing.lg, gap: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarC: { width: 44, height: 44, borderRadius: 22 },
  avatarFallbackC: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F2F3', alignItems: 'center', justifyContent: 'center' },
  passengerNameC: { fontSize: 14, fontFamily: 'Inter_700Bold', color: S.ink },
  ratedTextC: { color: S.teal, fontSize: Typography.size.xs, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  starsRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  emptyTextC: { color: S.cap, fontFamily: 'Inter_400Regular', fontSize: Typography.size.sm, textAlign: 'center' },

  // Done state
  doneCircleC: { width: 64, height: 64, borderRadius: 32, backgroundColor: C_STARC, alignItems: 'center', justifyContent: 'center' },
  doneTitleC: { fontSize: 18, fontFamily: 'Inter_700Bold', color: S.ink, textAlign: 'center', marginTop: Spacing.sm },

  // Bottom CTA
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  submitBtnC: {
    height: 54,
    borderRadius: 15,
    backgroundColor: S.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnTextC: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  });
}
