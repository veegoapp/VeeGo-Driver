import { extractEarning, extractPassengerCount, extractRouteName, extractDate, type RawTrip } from './shuttleHistoryHelpers';

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

describe('extractRouteName', () => {
  it('reads routeName from a well-formed raw trip', () => {
    expect(extractRouteName({ routeName: 'Downtown Express' } as RawTrip)).toBe('Downtown Express');
  });

  it('falls back to lineName when routeName is absent', () => {
    expect(extractRouteName({ lineName: 'Line 7' } as RawTrip)).toBe('Line 7');
  });

  it('falls back to line.name when routeName/lineName are absent', () => {
    expect(extractRouteName({ line: { name: 'Airport Shuttle' } } as RawTrip)).toBe('Airport Shuttle');
  });

  it('falls back to line.route.name as the last option', () => {
    expect(extractRouteName({ line: { route: { name: 'Old Town Loop' } } } as RawTrip)).toBe('Old Town Loop');
  });

  it('prefers routeName over every fallback when several are present', () => {
    expect(
      extractRouteName({
        routeName: 'Preferred', lineName: 'Ignored', line: { name: 'Ignored too', route: { name: 'Also ignored' } },
      } as RawTrip),
    ).toBe('Preferred');
  });

  it('returns the em-dash placeholder when nothing is present', () => {
    expect(extractRouteName({} as RawTrip)).toBe('—');
  });

  it('treats an empty-string routeName as absent and falls through to lineName', () => {
    expect(extractRouteName({ routeName: '', lineName: 'Line 7' } as RawTrip)).toBe('Line 7');
  });
});

describe('extractDate', () => {
  it('reads completedAt when present', () => {
    const d = extractDate({ completedAt: '2026-01-01T12:00:00.000Z' } as RawTrip);
    expect(d?.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });

  it('falls back through finishedAt, endedAt, createdAt, startedAt in order', () => {
    expect(extractDate({ finishedAt: '2026-01-02T00:00:00.000Z' } as RawTrip)?.toISOString())
      .toBe('2026-01-02T00:00:00.000Z');
    expect(extractDate({ endedAt: '2026-01-03T00:00:00.000Z' } as RawTrip)?.toISOString())
      .toBe('2026-01-03T00:00:00.000Z');
    expect(extractDate({ createdAt: '2026-01-04T00:00:00.000Z' } as RawTrip)?.toISOString())
      .toBe('2026-01-04T00:00:00.000Z');
    expect(extractDate({ startedAt: '2026-01-05T00:00:00.000Z' } as RawTrip)?.toISOString())
      .toBe('2026-01-05T00:00:00.000Z');
  });

  it('prefers completedAt over every other field when several are present', () => {
    const d = extractDate({
      completedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-02-01T00:00:00.000Z',
    } as RawTrip);
    expect(d?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null when no date field is present', () => {
    expect(extractDate({} as RawTrip)).toBeNull();
  });

  it('returns null for an unparsable date string', () => {
    expect(extractDate({ completedAt: 'not-a-date' } as RawTrip)).toBeNull();
  });
});
