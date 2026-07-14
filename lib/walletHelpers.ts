import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/lib/i18nContext';

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
