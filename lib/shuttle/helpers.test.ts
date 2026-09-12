import { mergeInstapayStatus, findLineForRoute, type BackendRoute, type BackendTrip } from './helpers';
import { buildLine } from './helpers';

describe('mergeInstapayStatus', () => {
  it('keeps a locally-confirmed status even when the fresh value disagrees', () => {
    expect(mergeInstapayStatus('confirmed', 'awaiting_payment')).toBe('confirmed');
    expect(mergeInstapayStatus('confirmed', undefined)).toBe('confirmed');
  });

  it('lets a fresh non-confirmed value win over a stale local one (the original bug)', () => {
    expect(mergeInstapayStatus(undefined, 'awaiting_confirmation')).toBe('awaiting_confirmation');
    expect(mergeInstapayStatus('awaiting_payment', 'awaiting_confirmation')).toBe('awaiting_confirmation');
  });

  it('returns undefined when neither side has a value', () => {
    expect(mergeInstapayStatus(undefined, undefined)).toBeUndefined();
    expect(mergeInstapayStatus(null, null)).toBeUndefined();
  });

  it('falls back to the existing value when the fresh field is missing', () => {
    expect(mergeInstapayStatus('awaiting_confirmation', undefined)).toBe('awaiting_confirmation');
    expect(mergeInstapayStatus('awaiting_confirmation', null)).toBe('awaiting_confirmation');
  });
});

describe('findLineForRoute', () => {
  const route: BackendRoute = {
    id: 1,
    name: 'Route 1',
    estimatedDuration: 30,
    basePrice: 10,
  };
  const outboundTrip: BackendTrip = {
    id: 100,
    routeId: 1,
    departureTime: '2026-01-01T08:00:00.000Z',
    arrivalTime: '2026-01-01T09:00:00.000Z',
    availableSeats: 5,
    totalSeats: 14,
    price: 10,
    status: 'active',
    direction: 'outbound',
  };
  const returnTrip: BackendTrip = {
    id: 101,
    routeId: 1,
    departureTime: '2026-01-01T18:00:00.000Z',
    arrivalTime: '2026-01-01T19:00:00.000Z',
    availableSeats: 5,
    totalSeats: 14,
    price: 10,
    status: 'active',
    direction: 'return',
  };
  const outboundLine = buildLine(route, outboundTrip);
  const returnLine = buildLine(route, returnTrip);
  const lines = [outboundLine, returnLine];

  it('returns the single match when only one line exists for the route', () => {
    expect(findLineForRoute([outboundLine], 1)).toBe(outboundLine);
  });

  it('disambiguates by direction when both sides have it', () => {
    expect(findLineForRoute(lines, 1, { direction: 'return' })).toBe(returnLine);
  });

  it('falls back to matching departure time when direction is unavailable', () => {
    expect(findLineForRoute(lines, 1, { departureTime: returnLine.departure })).toBe(returnLine);
  });

  it('falls back to the first assigned trip, then the first entry, when no ref matches', () => {
    expect(findLineForRoute(lines, 1)).toBe(outboundLine);
    expect(findLineForRoute(lines, 1, { direction: 'unknown-direction' })).toBe(outboundLine);
  });

  it('returns undefined when no line matches the routeId', () => {
    expect(findLineForRoute(lines, 999)).toBeUndefined();
  });
});
