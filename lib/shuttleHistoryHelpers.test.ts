import { extractEarning, extractPassengerCount, type RawTrip } from './shuttleHistoryHelpers';

describe('extractEarning', () => {
  it('reads earnedAmount from a well-formed raw trip', () => {
    expect(extractEarning({ earnedAmount: 123.45 } as RawTrip)).toBe(123.45);
  });

  it('returns null when the field is missing entirely', () => {
    expect(extractEarning({} as RawTrip)).toBeNull();
  });

  it('falls back to driverEarning when earnedAmount is absent', () => {
    expect(extractEarning({ driverEarning: 50 } as RawTrip)).toBe(50);
  });

  it('falls back to earning when earnedAmount/driverEarning are absent', () => {
    expect(extractEarning({ earning: 60 } as RawTrip)).toBe(60);
  });

  it('falls back to amount when earlier keys are absent', () => {
    expect(extractEarning({ amount: 70 } as RawTrip)).toBe(70);
  });

  it('falls back to netEarning as the last option', () => {
    expect(extractEarning({ netEarning: 80 } as RawTrip)).toBe(80);
  });

  it('prefers earnedAmount over the other fallback fields when several are present', () => {
    expect(
      extractEarning({ earnedAmount: 1, driverEarning: 2, earning: 3, amount: 4, netEarning: 5 } as RawTrip)
    ).toBe(1);
  });

  it('parses a string-typed value', () => {
    expect(extractEarning({ earnedAmount: '99.9' } as RawTrip)).toBe(99.9);
  });

  it('returns null when the value cannot be parsed as a number', () => {
    expect(extractEarning({ earnedAmount: 'not-a-number' } as RawTrip)).toBeNull();
  });
});

describe('extractPassengerCount', () => {
  it('reads passengerCount from a well-formed raw trip', () => {
    expect(extractPassengerCount({ passengerCount: 4 } as RawTrip)).toBe(4);
  });

  it('returns null when the field is missing entirely', () => {
    expect(extractPassengerCount({} as RawTrip)).toBeNull();
  });

  it('falls back to passengers when passengerCount is absent', () => {
    expect(extractPassengerCount({ passengers: 3 } as RawTrip)).toBe(3);
  });

  it('prefers passengerCount over passengers when both are present', () => {
    expect(extractPassengerCount({ passengerCount: 4, passengers: 3 } as RawTrip)).toBe(4);
  });

  it('parses a string-typed value', () => {
    expect(extractPassengerCount({ passengerCount: '7' } as RawTrip)).toBe(7);
  });

  it('returns null when the value cannot be parsed as a number', () => {
    expect(extractPassengerCount({ passengerCount: 'not-a-number' } as RawTrip)).toBeNull();
  });
});
