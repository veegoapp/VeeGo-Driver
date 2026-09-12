import {
  parsePayoutAmount,
  parseDepositAmount,
  pickDefaultPayoutAccount,
  normalizeWalletBalance,
  type PayoutAccount,
} from './walletHelpers';

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
