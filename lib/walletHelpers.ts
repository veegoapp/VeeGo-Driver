import type { QueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';
import { endpoints } from '@/lib/api';

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
      return { label: t.status_paid_out, color: colors.primary };
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

export type PayoutSubmitResponse = { ok?: boolean; message?: string; error?: string; available?: number };

// Submits a payout request and refreshes the balance/transactions queries
// that depend on it — shared by the (tabs) and (shuttle) wallet screens.
// Queries are only invalidated when the response carries no `error` field,
// matching the shuttle wallet's original behavior of skipping the refetch
// on a rejected payout (e.g. insufficient balance).
export async function submitPayoutRequest(
  amount: number,
  payoutAccountId: number,
  queryClient: QueryClient
): Promise<PayoutSubmitResponse> {
  const res = await endpoints.wallet.payout(amount, payoutAccountId) as PayoutSubmitResponse | undefined;
  if (!res?.error) {
    await queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
  }
  return res ?? {};
}
