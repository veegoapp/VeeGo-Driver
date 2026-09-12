import { computeDeadlineMinutes } from './checkinDeadline';

const NOW = new Date('2026-01-01T12:00:00.000Z');

describe('computeDeadlineMinutes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the minutes remaining for a deadline comfortably in the future', () => {
    const deadline = new Date(NOW.getTime() + 20 * 60000).toISOString();
    expect(computeDeadlineMinutes(deadline)).toBe(20);
  });

  it('falls back to the default 30 minutes for a deadline in the past', () => {
    const deadline = new Date(NOW.getTime() - 5 * 60000).toISOString();
    expect(computeDeadlineMinutes(deadline)).toBe(30);
  });

  it('falls back to the default 30 minutes when the deadline is null', () => {
    expect(computeDeadlineMinutes(null)).toBe(30);
  });

  it('falls back to the default 30 minutes when the deadline is undefined', () => {
    expect(computeDeadlineMinutes(undefined)).toBe(30);
  });

  it('falls back to the default 30 minutes when the deadline is exactly now', () => {
    expect(computeDeadlineMinutes(NOW.toISOString())).toBe(30);
  });

  it('clamps a deadline just a few seconds in the future up to 1 minute', () => {
    const deadline = new Date(NOW.getTime() + 10 * 1000).toISOString();
    expect(computeDeadlineMinutes(deadline)).toBe(1);
  });
});
