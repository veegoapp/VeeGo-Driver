import { router } from 'expo-router';
import { AlertCircle, ChevronLeft, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react-native';
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';
import type { FinancialAnalytics } from '@/lib/api';

// ─── Timeframe filter options ─────────────────────────────────────────────────
type Range = 'today' | 'week' | 'month';

interface FilterOption {
  key: Range;
  labelAr: string;
  labelEn: string;
}

const FILTERS: FilterOption[] = [
  { key: 'today', labelAr: 'اليوم', labelEn: 'Today' },
  { key: 'week',  labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
  { key: 'month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
];

// ─── Currency formatter ───────────────────────────────────────────────────────
function formatCurrency(amount: number, egpLabel: string): string {
  const formatted = Math.abs(amount).toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${egpLabel} ${formatted}`;
}

// ─── Date formatter ───────────────────────────────────────────────────────────
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ar-EG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function EarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { t, isRTL } = useI18n();

  const [range, setRange] = useState<Range>('today');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<FinancialAnalytics>({
    queryKey: ['financial-analytics', range],
    queryFn: () => endpoints.financialAnalytics.summary(range),
    staleTime: 60_000,
    retry: 2,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const TA = isRTL ? 'right' : 'left';
  const flex = isRTL ? 'row-reverse' : 'row';

  // ── Summary values (defensive — fallback to 0) ────────────────────────────
  const totalCash    = data?.totalCash    ?? 0;
  const commission   = data?.appCommission ?? 0;
  const netProfit    = data?.netProfit     ?? 0;
  const transactions = data?.transactions  ?? [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          hitSlop={8}
        >
          <ChevronLeft
            size={20}
            color={colors.foreground}
            strokeWidth={2}
            style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
          />
        </Pressable>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: TA }]}>
            {t.financial_hub}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground, textAlign: TA }]}>
            {t.earnings}
          </Text>
        </View>

        <View style={[styles.walletBadge, { backgroundColor: '#EEF2FF' }]}>
          <Wallet size={18} color="#3D52D5" strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {/* ── Timeframe filters ───────────────────────────────────────── */}
        <View style={[styles.filterRow, { flexDirection: flex }]}>
          {FILTERS.map(f => {
            const active = f.key === range;
            return (
              <Pressable
                key={f.key}
                onPress={() => setRange(f.key)}
                style={[
                  styles.filterChip,
                  active
                    ? { backgroundColor: '#3D52D5', borderColor: '#3D52D5' }
                    : { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
              >
                <Text style={[
                  styles.filterLabel,
                  { color: active ? '#fff' : colors.mutedForeground },
                ]}>
                  {isRTL ? f.labelAr : f.labelEn}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Loading state ───────────────────────────────────────────── */}
        {isLoading && !refreshing && (
          <View style={styles.centeredBlock}>
            <ActivityIndicator size="large" color="#3D52D5" />
            <Text style={[styles.loadingLabel, { color: colors.mutedForeground }]}>
              {t.loading_label}
            </Text>
          </View>
        )}

        {/* ── Error state ─────────────────────────────────────────────── */}
        {isError && !isLoading && (
          <View style={[styles.errorCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <AlertCircle size={28} color="#DC2626" strokeWidth={2} />
            <Text style={[styles.errorTitle, { color: '#DC2626', textAlign: 'center' }]}>
              {t.financial_load_failed}
            </Text>
            <Text style={[styles.errorSub, { color: '#EF4444', textAlign: 'center' }]}>
              {(error instanceof Error) ? error.message : t.unexpected_error}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={styles.retryBtn}
            >
              <RefreshCw size={14} color="#fff" strokeWidth={2} />
              <Text style={styles.retryBtnLabel}>{t.retry_label}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Summary cards ───────────────────────────────────────────── */}
        {!isLoading && !isError && (
          <>
            <View style={[styles.summaryCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {/* Total Cash Collected */}
              <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.summaryIconWrap, { backgroundColor: '#F0FDF4' }]}>
                  <TrendingUp size={20} color="#16A34A" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                    {t.total_cash_received}
                  </Text>
                  <Text style={[styles.summaryAmount, { color: '#16A34A', textAlign: TA }]}>
                    {formatCurrency(totalCash, t.egp)}
                  </Text>
                </View>
              </View>

              {/* Platform Commission */}
              <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.summaryIconWrap, { backgroundColor: '#FFF7ED' }]}>
                  <TrendingDown size={20} color="#EA580C" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                    {t.app_commission}
                  </Text>
                  <Text style={[styles.summaryAmount, { color: '#EA580C', textAlign: TA }]}>
                    {'− ' + formatCurrency(commission, t.egp)}
                  </Text>
                </View>
              </View>

              {/* Net Profit */}
              <View style={[styles.summaryRow, { borderBottomColor: 'transparent' }]}>
                <View style={[styles.summaryIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Wallet size={20} color="#3D52D5" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, textAlign: TA }]}>
                    {t.net_profit_label}
                  </Text>
                  <Text style={[styles.summaryAmount, { color: '#3D52D5', textAlign: TA }]}>
                    {formatCurrency(netProfit, t.egp)}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Transaction ledger ──────────────────────────────────── */}
            <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: TA }]}>
              {t.financial_transactions}
            </Text>

            {transactions.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Wallet size={32} color={colors.mutedForeground} strokeWidth={1.5} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {t.no_transactions}
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {t.transactions_appear_here}
                </Text>
              </View>
            ) : (
              transactions.map((tx, idx) => (
                <View
                  key={tx.id ?? idx}
                  style={[
                    styles.txCard,
                    {
                      backgroundColor: '#fff',
                      borderColor: colors.border,
                      flexDirection: flex,
                    },
                  ]}
                >
                  {/* Date + route */}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txDate, { color: colors.mutedForeground, textAlign: TA }]}>
                      {formatDateTime(tx.date)}
                    </Text>
                    {tx.routeName ? (
                      <Text style={[styles.txRoute, { color: colors.foreground, textAlign: TA }]} numberOfLines={1}>
                        {tx.routeName}
                      </Text>
                    ) : null}
                  </View>

                  {/* Cash + commission */}
                  <View style={styles.txAmounts}>
                    <View style={[styles.txAmountRow, { flexDirection: flex }]}>
                      <Text style={[styles.txAmountLabel, { color: colors.mutedForeground }]}>
                        {t.cash_label}
                      </Text>
                      <Text style={[styles.txAmountValue, { color: '#16A34A' }]}>
                        {formatCurrency(tx.cashReceived, t.egp)}
                      </Text>
                    </View>
                    <View style={[styles.txAmountRow, { flexDirection: flex }]}>
                      <Text style={[styles.txAmountLabel, { color: colors.mutedForeground }]}>
                        {t.commission_label}
                      </Text>
                      <Text style={[styles.txAmountValue, { color: '#EA580C' }]}>
                        {'− ' + formatCurrency(tx.appCommission, t.egp)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* Bottom spacer */}
            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  walletBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  filterRow: {
    gap: 8,
    marginBottom: 4,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  centeredBlock: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingLabel: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginVertical: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  errorSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 4,
  },
  retryBtnLabel: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  txCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  txDate: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 2,
  },
  txRoute: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  txAmounts: {
    alignItems: 'flex-end',
    gap: 3,
  },
  txAmountRow: {
    alignItems: 'center',
    gap: 3,
  },
  txAmountLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  txAmountValue: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});
