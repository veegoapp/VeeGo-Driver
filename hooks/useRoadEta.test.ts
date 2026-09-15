import { renderHook, act } from '@testing-library/react-native';
import { fetchDirectionsRaw } from '@/lib/utils/googleDirections';
import { useRoadEta } from './useRoadEta';

jest.mock('@/lib/utils/googleDirections', () => ({
  fetchDirectionsRaw: jest.fn(),
}));

const mockedFetch = fetchDirectionsRaw as jest.Mock;

const target = { latitude: 30.1, longitude: 31.1 };
const driverPos = { latitude: 30.0, longitude: 31.0, speed: 10 };

// Flush the microtask queue so a promise resolved/rejected under fake timers
// is observed by the hook's .then()/.catch() before assertions run.
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('useRoadEta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets to null and does not fetch when disabled', async () => {
    const { result } = await renderHook(() => useRoadEta(driverPos, target, false));

    expect(result.current).toEqual({ distanceM: null, etaSeconds: null, source: null });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('resets to null and does not fetch when driverPos or target is missing', async () => {
    const { result: r1 } = await renderHook(() => useRoadEta(null, target, true));
    expect(r1.current.source).toBeNull();

    const { result: r2 } = await renderHook(() => useRoadEta(driverPos, null, true));
    expect(r2.current.source).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('fetches immediately on first render and displays the API result', async () => {
    mockedFetch.mockResolvedValue({ distanceM: 5000, durationS: 600 });

    const { result } = await renderHook(() => useRoadEta(driverPos, target, true));
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ distanceM: 5000, etaSeconds: 600, source: 'api' });
  });

  it('falls back to a speed-based estimate when the API call fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));

    const { result } = await renderHook(() => useRoadEta(driverPos, target, true));
    await flush();

    expect(result.current.source).toBe('fallback');
    expect(result.current.distanceM).not.toBeNull();
    expect(result.current.etaSeconds).not.toBeNull();
    // distance / speed(10 m/s) — driverPos.speed is used since it's > 1 m/s.
    const expectedDist = result.current.distanceM as number;
    expect(result.current.etaSeconds).toBe(Math.round(expectedDist / 10));
  });

  it('falls back to the assumed city speed when GPS speed is unavailable', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    const slowPos = { ...driverPos, speed: null };

    const { result } = await renderHook(() => useRoadEta(slowPos, target, true));
    await flush();

    const expectedDist = result.current.distanceM as number;
    expect(result.current.etaSeconds).toBe(Math.round(expectedDist / 8.33));
  });

  it('treats a non-OK API response (no distance/duration) the same as a rejection', async () => {
    mockedFetch.mockResolvedValue({ distanceM: null, durationS: null });

    const { result } = await renderHook(() => useRoadEta(driverPos, target, true));
    await flush();

    expect(result.current.source).toBe('fallback');
  });

  it('does not re-fetch on a small movement within the throttle window', async () => {
    mockedFetch.mockResolvedValue({ distanceM: 5000, durationS: 600 });

    const { rerender } = await renderHook(
      ({ pos }: { pos: typeof driverPos }) => useRoadEta(pos, target, true),
      { initialProps: { pos: driverPos } },
    );
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // Move ~1m — well under the 80m threshold — and stay within 30s.
    await act(async () => { rerender({ pos: { ...driverPos, latitude: driverPos.latitude + 0.00001 } }); });
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the driver moves past the movement threshold, even within the time window', async () => {
    mockedFetch.mockResolvedValue({ distanceM: 5000, durationS: 600 });

    const { rerender } = await renderHook(
      ({ pos }: { pos: typeof driverPos }) => useRoadEta(pos, target, true),
      { initialProps: { pos: driverPos } },
    );
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // Move ~1.1km (well over the 80m threshold).
    await act(async () => { rerender({ pos: { ...driverPos, latitude: driverPos.latitude + 0.01 } }); });
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('re-fetches once the throttle interval elapses, even without movement', async () => {
    mockedFetch.mockResolvedValue({ distanceM: 5000, durationS: 600 });

    const { rerender } = await renderHook(
      ({ pos }: { pos: typeof driverPos }) => useRoadEta(pos, target, true),
      { initialProps: { pos: driverPos } },
    );
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(30_001); });
    // The effect's deps are the primitive lat/lng values, so a re-render
    // only re-evaluates the throttle if those values actually change —
    // nudge by a sub-meter amount (well under the 80m movement threshold)
    // purely to trigger the effect; the elapsed-time branch is what should
    // let this one through despite the tiny movement.
    await act(async () => { rerender({ pos: { ...driverPos, latitude: driverPos.latitude + 0.000001 } }); });
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('ticks the displayed ETA down every second between refreshes', async () => {
    mockedFetch.mockResolvedValue({ distanceM: 5000, durationS: 100 });

    const { result } = await renderHook(() => useRoadEta(driverPos, target, true));
    await flush();
    expect(result.current.etaSeconds).toBe(100);

    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(result.current.etaSeconds).toBeLessThanOrEqual(96);
    expect(result.current.etaSeconds).toBeGreaterThanOrEqual(94);
  });

  it('resets cleanly when target becomes unavailable mid-tracking', async () => {
    mockedFetch.mockResolvedValue({ distanceM: 5000, durationS: 600 });

    const { result, rerender } = await renderHook(
      ({ tgt }: { tgt: typeof target | null }) => useRoadEta(driverPos, tgt, true),
      { initialProps: { tgt: target as typeof target | null } },
    );
    await flush();
    expect(result.current.source).toBe('api');

    await act(async () => { rerender({ tgt: null }); });

    expect(result.current).toEqual({ distanceM: null, etaSeconds: null, source: null });
  });
});
