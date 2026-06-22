import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { ArrowLeft, Download, FileText } from 'lucide-react-native';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { endpoints } from '@/lib/api';

// ── Types shared with history.tsx ──────────────────────────────────────────────
type RawTrip = Record<string, unknown>;

type NormalizedTrip = {
  id: string;
  routeName: string;
  completedAt: Date | null;
  earnedAmount: number | null;
  passengerCount: number | null;
};

function extractRouteName(raw: RawTrip): string {
  if (typeof raw.routeName === 'string' && raw.routeName) return raw.routeName;
  if (typeof raw.lineName === 'string' && raw.lineName) return raw.lineName;
  const line = raw.line as Record<string, unknown> | undefined;
  if (line) {
    if (typeof line.name === 'string' && line.name) return line.name;
    const route = line.route as Record<string, unknown> | undefined;
    if (route && typeof route.name === 'string') return route.name;
  }
  return '—';
}

function extractDate(raw: RawTrip): Date | null {
  const v = raw.completedAt ?? raw.finishedAt ?? raw.endedAt ?? raw.createdAt ?? raw.startedAt;
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function extractEarning(raw: RawTrip): number | null {
  const v = raw.earnedAmount ?? raw.driverEarning ?? raw.earning ?? raw.amount ?? raw.netEarning;
  if (v == null) return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function extractPassengerCount(raw: RawTrip): number | null {
  const v = raw.passengerCount ?? raw.passengers;
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function normalizePage(raw: unknown): { trips: NormalizedTrip[]; total: number } {
  let arr: RawTrip[] = [];
  let total = 0;
  if (Array.isArray(raw)) {
    arr = raw as RawTrip[];
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.total === 'number') total = obj.total;
    const inner = obj.trips ?? obj.data;
    if (Array.isArray(inner)) {
      arr = inner as RawTrip[];
    } else if (Array.isArray(obj.results)) {
      arr = obj.results as RawTrip[];
    } else {
      const nested = Object.values(obj).find((v) => Array.isArray(v));
      if (Array.isArray(nested)) arr = nested as RawTrip[];
    }
  }
  const trips = arr.map((item, idx) => ({
    id: String(item.id ?? idx),
    routeName: extractRouteName(item),
    completedAt: extractDate(item),
    earnedAmount: extractEarning(item),
    passengerCount: extractPassengerCount(item),
  }));
  return { trips, total: total || trips.length };
}

// ── Date range presets ─────────────────────────────────────────────────────────
type Preset = 'week' | 'month' | 'lastMonth' | '3months' | 'all';

function getRange(preset: Preset): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (preset === 'all') return { start: null, end: null };
  if (preset === 'week') {
    const day = now.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day); // Monday
    const start = new Date(now);
    start.setDate(now.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }
  if (preset === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { start, end };
  }
  if (preset === '3months') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  return { start: null, end: null };
}

// ── HTML generation ────────────────────────────────────────────────────────────
type I18nStrings = {
  export_earnings_report: string; export_generated: string;
  export_total_earned: string; export_egp_currency: string; export_currency_symbol: string;
  export_total_trips: string; export_completed_trips: string;
  export_total_passengers: string; export_passengers_unit: string;
  export_no_trips: string; export_auto_generated: string;
  export_col_route: string; export_col_date: string;
  export_col_passengers: string; export_col_earned: string;
};

function buildHtml(
  trips: NormalizedTrip[],
  preset: Preset,
  presetLabel: string,
  isRTL: boolean,
  strings: I18nStrings,
): string {
  const dir = isRTL ? 'rtl' : 'ltr';
  const now = new Date();
  const dateStr = now.toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo',
  });

  const totalEarned = trips.reduce((s, t) => s + (t.earnedAmount ?? 0), 0);
  const totalPassengers = trips.reduce((s, t) => s + (t.passengerCount ?? 0), 0);

  const rows = trips.map((t, i) => {
    const dateLabel = t.completedAt
      ? t.completedAt.toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo',
        })
      : '—';
    const timeLabel = t.completedAt
      ? t.completedAt.toLocaleTimeString(isRTL ? 'ar-EG' : 'en-GB', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo',
        })
      : '';
    const earned = t.earnedAmount != null
      ? `${t.earnedAmount.toFixed(2)} ${strings.export_currency_symbol}`
      : '—';
    const pax = t.passengerCount != null ? String(t.passengerCount) : '—';
    const bg = i % 2 === 0 ? '#ffffff' : '#f8f8fc';
    return `
      <tr style="background:${bg}">
        <td style="padding:10px 14px;border-bottom:1px solid #e8e8f0;color:#444;font-size:13px">${i + 1}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e8f0;color:#222;font-weight:600;font-size:13px">${t.routeName}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e8f0;color:#555;font-size:12px">${dateLabel}<br><span style="color:#888;font-size:11px">${timeLabel}</span></td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e8f0;color:#555;font-size:12px;text-align:center">${pax}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e8f0;color:#16a34a;font-weight:700;font-size:13px;text-align:${isRTL ? 'left' : 'right'}">${earned}</td>
      </tr>`;
  }).join('');

  const col2 = strings.export_col_route;
  const col3 = strings.export_col_date;
  const col4 = strings.export_col_passengers;
  const col5 = strings.export_col_earned;

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL ? 'ar' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${isRTL ? "'Arial', 'Tahoma', sans-serif" : "'Helvetica Neue', 'Arial', sans-serif"}; color: #222; direction: ${dir}; background: #fff; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div style="max-width:800px;margin:0 auto;padding:40px 30px">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1e1e28;padding-bottom:20px;margin-bottom:24px;flex-direction:${isRTL ? 'row-reverse' : 'row'}">
    <div>
      <div style="font-size:22px;font-weight:800;color:#1e1e28;letter-spacing:-0.5px">VeeGo Driver</div>
      <div style="font-size:12px;color:#888;margin-top:2px">${strings.export_earnings_report}</div>
    </div>
    <div style="text-align:${isRTL ? 'left' : 'right'}">
      <div style="font-size:13px;font-weight:600;color:#1e1e28">${presetLabel}</div>
      <div style="font-size:11px;color:#999;margin-top:2px">${strings.export_generated} ${dateStr}</div>
    </div>
  </div>

  <!-- Summary cards -->
  <div style="display:flex;gap:16px;margin-bottom:28px;flex-direction:${isRTL ? 'row-reverse' : 'row'}">
    <div style="flex:1;background:#1e1e28;border-radius:12px;padding:18px 20px">
      <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">${strings.export_total_earned}</div>
      <div style="font-size:26px;font-weight:800;color:#4ade80">${totalEarned.toFixed(2)}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px">${strings.export_egp_currency}</div>
    </div>
    <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px">
      <div style="font-size:11px;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">${strings.export_total_trips}</div>
      <div style="font-size:26px;font-weight:800;color:#1e1e28">${trips.length}</div>
      <div style="font-size:12px;color:#888;margin-top:2px">${strings.export_completed_trips}</div>
    </div>
    <div style="flex:1;background:#fafafa;border:1px solid #e8e8f0;border-radius:12px;padding:18px 20px">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">${strings.export_total_passengers}</div>
      <div style="font-size:26px;font-weight:800;color:#1e1e28">${totalPassengers}</div>
      <div style="font-size:12px;color:#888;margin-top:2px">${strings.export_passengers_unit}</div>
    </div>
  </div>

  <!-- Trip table -->
  <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e8e8f0">
    <thead>
      <tr style="background:#1e1e28">
        <th style="padding:12px 14px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;text-align:${isRTL ? 'right' : 'left'};width:36px">#</th>
        <th style="padding:12px 14px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;text-align:${isRTL ? 'right' : 'left'}">${col2}</th>
        <th style="padding:12px 14px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;text-align:${isRTL ? 'right' : 'left'}">${col3}</th>
        <th style="padding:12px 14px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;text-align:center">${col4}</th>
        <th style="padding:12px 14px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;text-align:${isRTL ? 'left' : 'right'}">${col5}</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#aaa;font-size:13px">${strings.export_no_trips}</td></tr>`}</tbody>
  </table>

  <!-- Footer -->
  <div style="margin-top:24px;text-align:center;font-size:11px;color:#bbb">
    VeeGo Driver · ${strings.export_auto_generated}
  </div>
</div>
</body>
</html>`;
}

// ── Export screen ──────────────────────────────────────────────────────────────
const PRESETS: { key: Preset; labelKey: keyof ReturnType<typeof useI18n>['t'] }[] = [
  { key: 'week',      labelKey: 'export_this_week' },
  { key: 'month',     labelKey: 'export_this_month' },
  { key: 'lastMonth', labelKey: 'export_last_month' },
  { key: '3months',   labelKey: 'export_last_3months' },
  { key: 'all',       labelKey: 'export_all' },
];

const MAX_PAGES = 25; // cap at 500 trips

export default function HistoryExportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL, language } = useI18n();
  const R = isRTL ? 'row-reverse' as const : 'row' as const;
  const TA = isRTL ? 'right' as const : 'left' as const;

  const [selectedPreset, setSelectedPreset] = useState<Preset>('month');
  const [generating, setGenerating] = useState(false);

  const selectedLabel = t[PRESETS.find((p) => p.key === selectedPreset)!.labelKey];

  const fetchAllTrips = async (): Promise<NormalizedTrip[]> => {
    const all: NormalizedTrip[] = [];
    let page = 1;
    let serverTotal = Infinity;

    while (all.length < serverTotal && page <= MAX_PAGES) {
      const raw = await endpoints.shuttle.history(page, 20);
      const { trips, total } = normalizePage(raw);
      if (trips.length === 0) break;
      all.push(...trips);
      if (total > 0) serverTotal = total;
      if (trips.length < 20) break;
      page++;
    }

    return all;
  };

  const filterByPreset = (trips: NormalizedTrip[], preset: Preset): NormalizedTrip[] => {
    const { start, end } = getRange(preset);
    if (!start && !end) return trips;
    return trips.filter((t) => {
      if (!t.completedAt) return false;
      const ms = t.completedAt.getTime();
      if (start && ms < start.getTime()) return false;
      if (end && ms > end.getTime()) return false;
      return true;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const all = await fetchAllTrips();
      const filtered = filterByPreset(all, selectedPreset);

      const html = buildHtml(filtered, selectedPreset, String(selectedLabel), isRTL, t);

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `VeeGo Earnings — ${selectedLabel}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          t.export_pdf_ready,
          t.export_saved_to.replace('{uri}', uri),
        );
      }
    } catch (err) {
      Alert.alert(t.export_error, t.export_failed);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.foreground} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {t.export_title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon + subtitle */}
        <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 28 }}>
          <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
            <FileText size={32} color={colors.foreground} strokeWidth={1.5} />
          </View>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 12 }]}>
            {t.export_subtitle}
          </Text>
        </View>

        {/* Preset chips */}
        <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', textAlign: TA, marginBottom: 12 }]}>
          {t.export_date_range}
        </Text>
        <View style={[styles.presetsGrid, { flexDirection: R }]}>
          {PRESETS.map((p) => {
            const active = selectedPreset === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setSelectedPreset(p.key)}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: active ? '#1e1e28' : colors.secondary,
                    borderColor: active ? '#1e1e28' : colors.border,
                  },
                ]}
              >
                <Text style={[
                  styles.presetLabel,
                  {
                    color: active ? '#fff' : colors.foreground,
                    fontFamily: active ? 'Inter_700Bold' : 'Inter_600SemiBold',
                  },
                ]}>
                  {t[p.labelKey]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Info note */}
        <GlassView style={[styles.infoCard, { flexDirection: R, marginTop: 24 }]} borderRadius={14}>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: TA, lineHeight: 18 }]}>
              {t.export_info_note}
            </Text>
          </View>
        </GlassView>

        {/* Generate button */}
        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          style={({ pressed }) => [
            styles.generateBtn,
            {
              backgroundColor: generating ? '#9ca3af' : '#1e1e28',
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
              marginTop: 28,
            },
          ]}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Download size={18} color="#fff" strokeWidth={2} />
          )}
          <Text style={[styles.generateLabel, { fontFamily: 'Inter_700Bold' }]}>
            {generating ? t.export_generating : t.export_share}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontSize: 14, lineHeight: 20, maxWidth: 260 },
  sectionLabel: { fontSize: 14 },
  presetsGrid: {
    flexWrap: 'wrap',
    gap: 10,
  },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetLabel: { fontSize: 13 },
  infoCard: { padding: 14, gap: 8 },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  generateLabel: { fontSize: 16, color: '#fff' },
});
