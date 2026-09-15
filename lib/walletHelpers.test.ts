jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    constructor(status: number, statusText: string, body: unknown) {
      super(`API ${status}`);
      this.status = status;
      this.statusText = statusText;
      this.body = body;
    }
  }
  return { ApiError, endpoints: { wallet: { payout: jest.fn() } } };
});

import {
  parsePayoutAmount,
  parseDepositAmount,
  pickDefaultPayoutAccount,
  normalizeWalletBalance,
  toSafeNumber,
  extractList,
  normalizeTransaction,
  normalizeTransactions,
  normalizeActivePayoutAccounts,
  normalizeSettledTransaction,
  normalizeSettledTransactions,
  submitPayoutRequest,
  payoutStatusBadge,
  depositStatusBadge,
  type PayoutAccount,
  type RawWalletTransaction,
  type RawSettledTransaction,
  type PayoutHistoryItem,
} from './walletHelpers';
import { ApiError, endpoints } from '@/lib/api';

// Minimal stand-ins for the translation/colors objects these UI-facing
// helpers take — only the keys each function actually reads need real
// values; every other key is irrelevant to the assertions.
const t = new Proxy({} as Record<string, string>, { get: (_t, key) => `t:${String(key)}` }) as any;
const colors = new Proxy({} as Record<string, string>, { get: (_t, key) => `color:${String(key)}` }) as any;

describe('parsePayoutAmount', () => {
  it('parses a plain integer string', () => {
    expect(parsePayoutAmount('100')).toBe(100);
  });

  it('parses a decimal string', () => {
    expect(parsePayoutAmount('100.50')).toBe(100.5);
  });

  it('parses a string with extra surrounding whitespace', () => {
    expect(parsePayoutAmount('  100.50  ')).toBe(100.5);
  });

  it('returns null for an empty string', () => {
    expect(parsePayoutAmount('')).toBeNull();
  });

  it('returns null for a non-numeric string', () => {
    expect(parsePayoutAmount('abc')).toBeNull();
  });

  it('returns null for a negative number', () => {
    expect(parsePayoutAmount('-50')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parsePayoutAmount('0')).toBeNull();
  });
});

describe('parseDepositAmount', () => {
  // Delegates entirely to parsePayoutAmount today (see source comment), so
  // only a couple of sanity checks are needed here rather than repeating the
  // full matrix above.
  it('parses a plain integer string', () => {
    expect(parseDepositAmount('250')).toBe(250);
  });

  it('returns null for a non-numeric string', () => {
    expect(parseDepositAmount('abc')).toBeNull();
  });

  it('returns null for a negative number', () => {
    expect(parseDepositAmount('-10')).toBeNull();
  });
});

// Note: neither parsePayoutAmount nor parseDepositAmount does any
// Arabic-numeral (٠١٢٣...) or Arabic-locale digit normalization before
// calling parseFloat — a string of Arabic-Indic digits parses to NaN and is
// rejected as invalid input. This looks like a possible gap for Arabic-locale
// keyboards, but no such handling exists in the source, so no test is added
// for it.

describe('pickDefaultPayoutAccount', () => {
  const makeAccount = (overrides: Partial<PayoutAccount>): PayoutAccount => ({
    id: 1,
    methodKey: 'vodafone_cash',
    accountName: 'Driver',
    accountNumber: '01000000000',
    isDefault: false,
    isVerified: true,
    isActive: true,
    ...overrides,
  });

  it('returns null for an empty array', () => {
    expect(pickDefaultPayoutAccount([])).toBeNull();
  });

  it('picks the single account when there is only one', () => {
    const only = makeAccount({ id: 1 });
    expect(pickDefaultPayoutAccount([only])).toBe(only);
  });

  it('picks the account explicitly flagged as default among several', () => {
    const first = makeAccount({ id: 1, isDefault: false });
    const defaultAccount = makeAccount({ id: 2, isDefault: true });
    const third = makeAccount({ id: 3, isDefault: false });
    expect(pickDefaultPayoutAccount([first, defaultAccount, third])).toBe(defaultAccount);
  });

  it('falls back to the first account when none is flagged default', () => {
    const first = makeAccount({ id: 1, isDefault: false });
    const second = makeAccount({ id: 2, isDefault: false });
    expect(pickDefaultPayoutAccount([first, second])).toBe(first);
  });
});

describe('normalizeWalletBalance', () => {
  it('normalizes a well-formed flat response', () => {
    expect(normalizeWalletBalance({ balance: 150, totalPaid: 500, totalPending: 20 })).toEqual({
      balance: 150,
      totalPaid: 500,
      totalPending: 20,
    });
  });

  it('reads the balance from a nested wallet.balance shape', () => {
    expect(normalizeWalletBalance({ wallet: { balance: 75 } })).toEqual({
      balance: 75,
      totalPaid: 0,
      totalPending: 0,
    });
  });

  it('defaults totalPaid/totalPending to 0 when absent', () => {
    expect(normalizeWalletBalance({ balance: 10 })).toEqual({
      balance: 10,
      totalPaid: 0,
      totalPending: 0,
    });
  });

  it('handles a string-typed balance', () => {
    expect(normalizeWalletBalance({ balance: '42.5' })).toEqual({
      balance: 42.5,
      totalPaid: 0,
      totalPending: 0,
    });
  });

  it('falls back to a 0 balance for null/undefined/empty input', () => {
    expect(normalizeWalletBalance(null)).toEqual({ balance: 0, totalPaid: 0, totalPending: 0 });
    expect(normalizeWalletBalance(undefined)).toEqual({ balance: 0, totalPaid: 0, totalPending: 0 });
    expect(normalizeWalletBalance({})).toEqual({ balance: 0, totalPaid: 0, totalPending: 0 });
  });
});

describe('toSafeNumber', () => {
  it('passes a plain finite number through unchanged', () => {
    expect(toSafeNumber(42)).toBe(42);
  });

  it('parses a numeric string', () => {
    expect(toSafeNumber('12.5')).toBe(12.5);
  });

  it('falls back to the default (0) for null/undefined', () => {
    expect(toSafeNumber(null)).toBe(0);
    expect(toSafeNumber(undefined)).toBe(0);
  });

  it('falls back to a caller-supplied default', () => {
    expect(toSafeNumber(undefined, -1)).toBe(-1);
  });

  it('falls back to the default for a non-numeric string', () => {
    expect(toSafeNumber('not-a-number')).toBe(0);
  });

  it('falls back to the default for an actual NaN value (not just NaN-producing input)', () => {
    expect(toSafeNumber(NaN, 7)).toBe(7);
  });

  it('falls back to the default for Infinity', () => {
    expect(toSafeNumber(Infinity, 3)).toBe(3);
  });
});

describe('extractList', () => {
  it('returns an array input unchanged', () => {
    const arr = [1, 2, 3];
    expect(extractList(arr)).toBe(arr);
  });

  it('unwraps a { data: [...] } envelope', () => {
    expect(extractList({ data: [1, 2] })).toEqual([1, 2]);
  });

  it('returns an empty array when data is absent', () => {
    expect(extractList({})).toEqual([]);
  });

  it('returns an empty array for null/undefined', () => {
    expect(extractList(null)).toEqual([]);
    expect(extractList(undefined)).toEqual([]);
  });
});

describe('normalizeTransaction', () => {
  const base: RawWalletTransaction = { id: 1, amount: 100 };

  it('treats a positive amount as a credit and a negative amount as a debit', () => {
    expect(normalizeTransaction({ ...base, amount: 50 }, t).isCredit).toBe(true);
    expect(normalizeTransaction({ ...base, amount: -50 }, t).isCredit).toBe(false);
  });

  it('reports the absolute magnitude regardless of sign', () => {
    expect(normalizeTransaction({ ...base, amount: -75 }, t).amount).toBe(75);
  });

  it('falls back to the ledger type for a zero-amount transaction', () => {
    expect(normalizeTransaction({ ...base, amount: 0, type: 'bonus' }, t).isCredit).toBe(true);
    expect(normalizeTransaction({ ...base, amount: 0, type: 'payout' }, t).isCredit).toBe(false);
  });

  it('lets an explicit legacy `incoming` boolean override the sign/type inference', () => {
    expect(normalizeTransaction({ ...base, amount: 50, incoming: false }, t).isCredit).toBe(false);
    expect(normalizeTransaction({ ...base, amount: -50, incoming: true }, t).isCredit).toBe(true);
  });

  it('uses the provided title/sub over the derived label when present', () => {
    const result = normalizeTransaction({ ...base, title: 'Custom title', sub: 'Custom sub' }, t);
    expect(result.title).toBe('Custom title');
    expect(result.subtitle).toBe('Custom sub');
  });

  it('derives the title from the ledger type when no explicit title is given', () => {
    expect(normalizeTransaction({ ...base, type: 'ride_earning' }, t).title).toBe(t.trip_earnings_label);
    expect(normalizeTransaction({ ...base, type: 'shuttle_earning' }, t).title).toBe(t.shuttle_earnings_label);
    expect(normalizeTransaction({ ...base, type: 'cancellation_fee' }, t).title).toBe(t.cancellation_fee_label);
    expect(normalizeTransaction({ ...base, type: 'waiting_charge' }, t).title).toBe(t.waiting_charge_label);
    expect(normalizeTransaction({ ...base, type: 'cash_debt' }, t).title).toBe(t.platform_commission_label);
    expect(normalizeTransaction({ ...base, type: 'payout' }, t).title).toBe(t.payout_transfer_label);
  });

  it('falls back to a credit/debit generic label for an unrecognized type', () => {
    expect(normalizeTransaction({ ...base, amount: 10, type: 'something_new' }, t).title).toBe(t.trip_earnings_label);
    expect(normalizeTransaction({ ...base, amount: -10, type: 'something_new' }, t).title).toBe(t.payout_transfer_label);
  });

  it('falls back to notes, then a formatted date, for the subtitle', () => {
    expect(normalizeTransaction({ ...base, notes: 'Bank ref 123' }, t).subtitle).toBe('Bank ref 123');
    const withDate = normalizeTransaction({ ...base, createdAt: '2026-01-01T12:00:00.000Z' }, t);
    expect(withDate.subtitle.length).toBeGreaterThan(0);
  });

  it('stringifies a numeric id', () => {
    expect(normalizeTransaction({ ...base, id: 42 }, t).id).toBe('42');
  });
});

describe('normalizeTransactions', () => {
  it('maps every item in a bare array', () => {
    const result = normalizeTransactions([{ id: 1, amount: 10 }, { id: 2, amount: -5 }], t);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].isCredit).toBe(false);
  });

  it('unwraps a { data } envelope and returns [] for null/undefined', () => {
    expect(normalizeTransactions({ data: [{ id: 1, amount: 10 }] }, t)).toHaveLength(1);
    expect(normalizeTransactions(null, t)).toEqual([]);
  });
});

describe('normalizeActivePayoutAccounts', () => {
  const makeAccount = (overrides: Partial<PayoutAccount>): PayoutAccount => ({
    id: 1, methodKey: 'vodafone_cash', accountName: 'Driver', accountNumber: '01000000000',
    isDefault: false, isVerified: true, isActive: true, ...overrides,
  });

  it('filters out inactive accounts', () => {
    const active = makeAccount({ id: 1, isActive: true });
    const inactive = makeAccount({ id: 2, isActive: false });
    expect(normalizeActivePayoutAccounts([active, inactive])).toEqual([active]);
  });

  it('unwraps a { data } envelope', () => {
    const active = makeAccount({ id: 1, isActive: true });
    expect(normalizeActivePayoutAccounts({ data: [active] })).toEqual([active]);
  });
});

describe('normalizeSettledTransaction', () => {
  const base: RawSettledTransaction = { id: 'tx-1', type: 'withdrawal', amount: 100 };

  it('treats a deposit as a credit and a withdrawal as a debit', () => {
    expect(normalizeSettledTransaction({ ...base, type: 'deposit' }, t).isCredit).toBe(true);
    expect(normalizeSettledTransaction({ ...base, type: 'withdrawal' }, t).isCredit).toBe(false);
  });

  it('reports the absolute magnitude and matching title', () => {
    const deposit = normalizeSettledTransaction({ ...base, type: 'deposit', amount: -60 }, t);
    expect(deposit.amount).toBe(60);
    expect(deposit.title).toBe(t.deposit_transaction_label);

    const withdrawal = normalizeSettledTransaction({ ...base, type: 'withdrawal' }, t);
    expect(withdrawal.title).toBe(t.payout_transfer_label);
  });

  it('combines methodKey and a formatted date in the subtitle when both are present', () => {
    const result = normalizeSettledTransaction(
      { ...base, methodKey: 'vodafone_cash', occurredAt: '2026-01-01T12:00:00.000Z' }, t,
    );
    expect(result.subtitle).toContain('vodafone_cash');
    expect(result.subtitle).toContain('·');
  });

  it('falls back to just the methodKey when there is no date', () => {
    expect(normalizeSettledTransaction({ ...base, methodKey: 'instapay' }, t).subtitle).toBe('instapay');
  });

  it('falls back to an empty subtitle when neither methodKey nor date is present', () => {
    expect(normalizeSettledTransaction(base, t).subtitle).toBe('');
  });
});

describe('normalizeSettledTransactions', () => {
  it('maps every item and unwraps a { data } envelope', () => {
    const raw: RawSettledTransaction = { id: 'tx-1', type: 'deposit', amount: 50 };
    expect(normalizeSettledTransactions([raw], t)).toHaveLength(1);
    expect(normalizeSettledTransactions({ data: [raw] }, t)).toHaveLength(1);
    expect(normalizeSettledTransactions(undefined, t)).toEqual([]);
  });
});

describe('payoutStatusBadge', () => {
  it('maps paid to the success color', () => {
    expect(payoutStatusBadge('paid', colors, t)).toEqual({ label: t.status_paid_out, color: colors.success });
  });

  it('maps cancelled to the destructive color', () => {
    expect(payoutStatusBadge('cancelled', colors, t)).toEqual({ label: t.status_cancelled, color: colors.destructive });
  });

  it('maps pending (and any other status) to the muted color', () => {
    expect(payoutStatusBadge('pending', colors, t)).toEqual({ label: t.status_pending, color: colors.mutedForeground });
    expect(payoutStatusBadge('processing' as PayoutHistoryItem['status'], colors, t))
      .toEqual({ label: t.status_pending, color: colors.mutedForeground });
  });
});

describe('depositStatusBadge', () => {
  it('maps approved to the success color', () => {
    expect(depositStatusBadge('approved', colors, t)).toEqual({ label: t.status_paid_out, color: colors.success });
  });

  it('maps rejected to the destructive color with the deposit-specific label', () => {
    expect(depositStatusBadge('rejected', colors, t)).toEqual({ label: t.deposit_status_rejected, color: colors.destructive });
  });

  it('maps pending to the muted color', () => {
    expect(depositStatusBadge('pending', colors, t)).toEqual({ label: t.status_pending, color: colors.mutedForeground });
  });
});

describe('submitPayoutRequest', () => {
  const mockPayout = endpoints.wallet.payout as jest.Mock;
  const makeQueryClient = () => ({ invalidateQueries: jest.fn().mockResolvedValue(undefined) }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('invalidates the wallet queries and returns ok on success', async () => {
    mockPayout.mockResolvedValue({ message: 'Payout submitted' });
    const qc = makeQueryClient();

    const result = await submitPayoutRequest(100, 1, qc);

    expect(result).toEqual({ ok: true, message: 'Payout submitted' });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['wallet-balance'] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['wallet-transactions'] });
  });

  it('returns the structured error without invalidating queries when the response body carries one', () => {
    const qc = makeQueryClient();
    mockPayout.mockResolvedValue({ error: 'insufficient_balance', available: 20 });

    return submitPayoutRequest(100, 1, qc).then((result) => {
      expect(result).toEqual({ ok: false, error: 'insufficient_balance', available: 20 });
      expect(qc.invalidateQueries).not.toHaveBeenCalled();
    });
  });

  it('reads the structured error off a thrown ApiError', async () => {
    mockPayout.mockRejectedValue(new ApiError(400, 'Bad Request', { error: 'insufficient_balance', available: 5 }));
    const qc = makeQueryClient();

    const result = await submitPayoutRequest(100, 1, qc);

    expect(result).toEqual({ ok: false, error: 'insufficient_balance', available: 5 });
  });

  it('returns a bare failure for an ApiError with no structured error body', async () => {
    mockPayout.mockRejectedValue(new ApiError(500, 'Server Error', null));
    const qc = makeQueryClient();

    expect(await submitPayoutRequest(100, 1, qc)).toEqual({ ok: false });
  });

  it('returns a bare failure for a non-ApiError exception (e.g. a network error)', async () => {
    mockPayout.mockRejectedValue(new Error('network down'));
    const qc = makeQueryClient();

    expect(await submitPayoutRequest(100, 1, qc)).toEqual({ ok: false });
  });
});
