import type { QueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { ApiError, endpoints } from '@/lib/api';

// A driver's own saved payout destination (see /driver/payout-accounts).
// Only instapay / vodafone_cash are supported today; methodKey is a plain
// string so future methods (e.g. bank accounts) don't need a shape change.
export type PayoutAccount = {
  id: number;
  methodKey: string;
  accountName: string;
  accountNumber: string;
  isDefault: boolean;
  isVerified: boolean;
  isActive: boolean;
};

// One row from GET /driver/wallet/payouts — the driver's own payout requests.
export type PayoutHistoryItem = {
  id: number;
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'cancelled';
  method: string | null;
  accountName: string | null;
  maskedAccountNumber: string | null;
  createdAt: string;
  paidAt: string | null;
};

// Maps a payout request's status to a badge color + label, reusing existing
// status_pending / status_paid_out / status_cancelled translation keys.
export function payoutStatusBadge(status: PayoutHistoryItem['status'], colors: ReturnType<typeof useColors>, t: ReturnType<typeof useI18n>['t']) {
  switch (status) {
    case 'paid':
      // colors.primary is a near-black navy in dark mode — invisible as text
      // on a dark card. success (brand green) is both legible and semantically
      // right for a completed, positive outcome.
      return { label: t.status_paid_out, color: colors.success };
    case 'cancelled':
      return { label: t.status_cancelled, color: colors.destructive };
    default:
      return { label: t.status_pending, color: colors.mutedForeground };
  }
}

// Parses a possibly-invalid numeric value (null/undefined/non-numeric/NaN)
// into a finite number, falling back safely instead of ever producing NaN —
// `parseFloat(String(x ?? 0))` still yields NaN when x is itself NaN.
export function toSafeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? fallback));
  return Number.isFinite(n) ? n : fallback;
}

// Unwraps the common `T[] | { data?: T[] }` API envelope shared by the
// wallet/payout endpoints.
export function extractList<T>(raw: T[] | { data?: T[] } | null | undefined): T[] {
  if (Array.isArray(raw)) return raw;
  return raw?.data ?? [];
}

// ─── Wallet transactions (GET /driver/earnings/history) ───────────────────────
// Raw rows are driver_wallet_ledger entries: { id, amount, type, referenceType,
// referenceId, notes, createdAt }. `amount` is already signed by the backend
// (positive = credit to the driver, negative = debit — see the
// driver_wallet_ledger schema). There is no `title`/`sub`/`incoming` field on
// the real payload; those are derived here instead of being read off it.
export type WalletLedgerType =
  | 'ride_earning' | 'shuttle_earning' | 'bonus'
  | 'cancellation_fee' | 'waiting_charge' | 'cash_debt' | 'payout';

export type RawWalletTransaction = {
  id: string | number;
  amount: number | string;
  type?: string;
  notes?: string | null;
  createdAt?: string;
  // Not present on the real payload today — read defensively in case a
  // future backend revision (or another caller) starts sending them.
  title?: string;
  sub?: string;
  incoming?: boolean;
};

export type NormalizedWalletTransaction = {
  id: string;
  amount: number; // absolute magnitude — sign is conveyed via isCredit
  isCredit: boolean;
  title: string;
  subtitle: string;
};

const CREDIT_LEDGER_TYPES = new Set<string>(['ride_earning', 'shuttle_earning', 'bonus']);

function ledgerTypeLabel(type: string | undefined, isCredit: boolean, t: ReturnType<typeof useI18n>['t']): string {
  switch (type as WalletLedgerType | undefined) {
    case 'ride_earning':     return t.trip_earnings_label;
    case 'shuttle_earning':  return t.shuttle_earnings_label;
    case 'bonus':            return t.wallet_bonus_label;
    case 'cancellation_fee': return t.cancellation_fee_label;
    case 'waiting_charge':   return t.waiting_charge_label;
    case 'cash_debt':        return t.platform_commission_label;
    case 'payout':           return t.payout_transfer_label;
    default:                 return isCredit ? t.trip_earnings_label : t.payout_transfer_label;
  }
}

// Maps one raw ledger row into display-ready fields. The amount's own sign
// is the primary signal for credit/debit (it's authoritative on the real
// payload); a `type`-based fallback only kicks in for the zero-amount edge
// case, and a legacy `incoming` boolean wins outright if a caller ever sends one.
export function normalizeTransaction(
  raw: RawWalletTransaction,
  t: ReturnType<typeof useI18n>['t'],
  isRTL = false,
): NormalizedWalletTransaction {
  const signedAmount = toSafeNumber(raw.amount);
  const isCredit = typeof raw.incoming === 'boolean'
    ? raw.incoming
    : signedAmount !== 0
      ? signedAmount > 0
      : CREDIT_LEDGER_TYPES.has(raw.type ?? '');

  const dateSub = raw.createdAt
    ? new Date(raw.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-EG', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return {
    id: String(raw.id),
    amount: Math.abs(signedAmount),
    isCredit,
    title: raw.title ?? ledgerTypeLabel(raw.type, isCredit, t),
    subtitle: raw.sub ?? raw.notes ?? dateSub,
  };
}

export function normalizeTransactions(
  raw: RawWalletTransaction[] | { data?: RawWalletTransaction[] } | null | undefined,
  t: ReturnType<typeof useI18n>['t'],
  isRTL = false,
): NormalizedWalletTransaction[] {
  return extractList(raw).map(item => normalizeTransaction(item, t, isRTL));
}

export function normalizeActivePayoutAccounts(raw: PayoutAccount[] | { data?: PayoutAccount[] } | null | undefined): PayoutAccount[] {
  return extractList(raw).filter(a => a.isActive);
}

export function pickDefaultPayoutAccount(accounts: PayoutAccount[]): PayoutAccount | null {
  return accounts.find(a => a.isDefault) ?? accounts[0] ?? null;
}

export type WalletBalance = { balance: number; totalPaid: number; totalPending: number };

// Normalizes the two response shapes seen from GET /driver/wallet/balance
// (a flat `{ balance }` or a nested `{ wallet: { balance } }`) into a
// NaN-safe balance, with totalPaid/totalPending defaulting to 0 when absent.
export function normalizeWalletBalance(raw: unknown): WalletBalance {
  const r = raw as { balance?: unknown; wallet?: { balance?: unknown }; totalPaid?: unknown; totalPending?: unknown } | undefined;
  return {
    balance: toSafeNumber(r?.balance ?? r?.wallet?.balance),
    totalPaid: toSafeNumber(r?.totalPaid),
    totalPending: toSafeNumber(r?.totalPending),
  };
}

// Validates raw payout-amount text input into a positive finite amount, or
// null when invalid (empty, zero, negative, or non-numeric).
export function parsePayoutAmount(amountStr: string): number | null {
  const amount = parseFloat(amountStr);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export type PayoutSubmitResult =
  | { ok: true; message?: string }
  | { ok: false; error?: string; available?: number };

// Submits a payout request and refreshes the balance/transactions queries
// that depend on it — shared by the (tabs) and (shuttle) wallet screens.
// POST /driver/wallet/payout responds with HTTP 400 + a structured
// { error, available } body on a rejection (e.g. insufficient balance), which
// the API client (lib/api/_client.ts) turns into a thrown ApiError carrying
// that body — it never resolves as a normal 200. This used to be unhandled
// here, so callers' `res.error` checks were dead code and every rejection
// surfaced only as a generic "payout failed" message. Catching ApiError and
// reading err.body.error/available restores the specific backend reason.
export async function submitPayoutRequest(
  amount: number,
  payoutAccountId: number,
  queryClient: QueryClient
): Promise<PayoutSubmitResult> {
  try {
    const res = await endpoints.wallet.payout(amount, payoutAccountId) as { message?: string; error?: string; available?: number } | undefined;
    if (res?.error) {
      return { ok: false, error: res.error, available: res.available };
    }
    await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
    return { ok: true, message: res?.message };
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string; available?: number } | null;
      if (body?.error) {
        return { ok: false, error: body.error, available: body.available };
      }
    }
    return { ok: false };
  }
}
