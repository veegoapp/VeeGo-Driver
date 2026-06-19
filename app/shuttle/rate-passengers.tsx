import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints, ApiError } from '@/lib/api';

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
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
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
        Alert.alert(t.error, t.load_passengers_err);
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
        if (err instanceof ApiError && err.status === 400) {
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
      Alert.alert(t.partial_rating_err_title, t.partial_rating_err_msg);
    }
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ fontSize: 48 }}>⭐</Text>
        <Text style={[s.doneTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.ratings_sent}
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: botPad + 100, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Pressable
            onPress={() => router.back()}
            style={[s.backBtn, { backgroundColor: colors.glass, borderColor: colors.border }]}
          >
            <ChevronLeft size={20} color={colors.foreground} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.pageTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {t.rate_passengers_title}
            </Text>
            <Text style={[s.pageSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {t.n_passengers_to_rate.replace('{n}', String(passengers.length))}
            </Text>
          </View>
        </View>

        {passengers.length === 0 ? (
          <View style={[s.center, { marginTop: 60 }]}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }}>
              {t.no_passengers_to_rate}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 20 }}>
            {passengers.map(p => (
              <GlassView key={p.id} style={s.card} borderRadius={20}>
                <View style={s.cardRow}>
                  {p.avatar ? (
                    <Image source={{ uri: p.avatar }} style={[s.avatar, { borderColor: colors.border }]} />
                  ) : (
                    <View style={[s.avatarFallback, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <Text style={{ fontSize: 18 }}>👤</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.passengerName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {p.name}
                    </Text>
                    {p.rated && (
                      <Text style={{ color: '#22c55e', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                        {t.rated_label}
                      </Text>
                    )}
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
                        color={n <= p.stars ? '#f59e0b' : colors.border}
                        fill={n <= p.stars ? '#f59e0b' : 'transparent'}
                        strokeWidth={2}
                      />
                    </Pressable>
                  ))}
                </View>
              </GlassView>
            ))}
          </View>
        )}
      </ScrollView>

      {passengers.length > 0 && (
        <View style={[s.bottomAction, { paddingBottom: botPad + 12 }]}>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[s.submitBtn, { opacity: submitting ? 0.7 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[s.submitBtnText, { fontFamily: 'Inter_700Bold' }]}>
                {t.submit_ratings_btn}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageTitle: { fontSize: 20 },
  pageSub: { fontSize: 12, marginTop: 2 },
  card: { padding: 16, gap: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  passengerName: { fontSize: 15 },
  starsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  doneTitle: { fontSize: 20, textAlign: 'center', marginTop: 8 },
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8 },
  submitBtn: {
    height: 56,
    borderRadius: 20,
    backgroundColor: '#1e1e28',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e1e28',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 15 },
});
