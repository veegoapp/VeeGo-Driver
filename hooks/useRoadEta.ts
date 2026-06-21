import { useEffect, useRef, useState } from 'react';
import { haversineMeters } from './useDriverLocation';
import { getToken } from '@/lib/auth';

export type RoadEtaResult = {
  distanceM: number | null;
  etaSeconds: number | null;
  source: 'api' | 'fallback' | null;
};

const API_INTERVAL_MS   = 30_000;  // max one directions call per 30 s
const MOVE_THRESHOLD_M  = 80;      // …or when driver moves >80 m from last fetch origin
const FETCH_TIMEOUT_MS  = 6_000;   // abort stalled requests after 6 s
const FALLBACK_SPEED_MPS = 8.33;   // 30 km/h assumed city speed when GPS speed unavailable

/**
 * Returns road-accurate distance and ETA to `target` via the backend /directions proxy.
 * Throttled — fires at most once per 30 s (or when the driver moves >80 m).
 * Falls back to speed-based estimation when the API is unreachable.
 * Ticks the ETA down smoothly every second between refreshes.
 */
export function useRoadEta(
  driverPos: { latitude: number; longitude: number; speed?: number | null } | null,
  target: { latitude: number; longitude: number } | null,
  enabled: boolean,
): RoadEtaResult {
  const [display, setDisplay] = useState<RoadEtaResult>({
    distanceM: null,
    etaSeconds: null,
    source: null,
  });

  const anchor = useRef<{
    at: number;
    fromLat: number;
    fromLng: number;
    distanceM: number;
    durationS: number;
  } | null>(null);

  const fetching = useRef(false);
  const abortCtrl = useRef<AbortController | null>(null);

  // ── OSRM fetch — gated by time and distance ───────────────────────────────
  useEffect(() => {
    if (!enabled || !driverPos || !target) {
      anchor.current = null;
      setDisplay({ distanceM: null, etaSeconds: null, source: null });
      return;
    }

    const now   = Date.now();
    const prev  = anchor.current;
    const ms    = prev ? now - prev.at : Infinity;
    const moved = prev
      ? haversineMeters(driverPos.latitude, driverPos.longitude, prev.fromLat, prev.fromLng)
      : Infinity;

    if (fetching.current || (ms < API_INTERVAL_MS && moved < MOVE_THRESHOLD_M)) return;

    fetching.current = true;
    abortCtrl.current?.abort();
    const ctrl  = new AbortController();
    abortCtrl.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    const base = process.env.EXPO_PUBLIC_API_URL ?? '';
    const url =
      `${base}/directions` +
      `?origin=${driverPos.latitude},${driverPos.longitude}` +
      `&destination=${target.latitude},${target.longitude}`;

    getToken()
      .then(token =>
        fetch(url, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token ?? ''}` },
        }),
      )
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('non-ok'))))
      .then(data => {
        if (typeof data?.distanceM === 'number' && typeof data?.durationS === 'number') {
          anchor.current = {
            at: Date.now(),
            fromLat: driverPos.latitude,
            fromLng: driverPos.longitude,
            distanceM: data.distanceM,
            durationS: data.durationS,
          };
          setDisplay({ distanceM: data.distanceM, etaSeconds: Math.round(data.durationS), source: 'api' });
        }
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        const speed = driverPos.speed != null && driverPos.speed > 1
          ? driverPos.speed
          : FALLBACK_SPEED_MPS;
        const dist  = haversineMeters(
          driverPos.latitude, driverPos.longitude,
          target.latitude,   target.longitude,
        );
        setDisplay({
          distanceM: dist,
          etaSeconds: Math.round(dist / speed),
          source: 'fallback',
        });
      })
      .finally(() => {
        clearTimeout(timer);
        fetching.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, driverPos?.latitude, driverPos?.longitude, target?.latitude, target?.longitude]);

  // ── Smooth tick-down between OSRM refreshes ───────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const a = anchor.current;
      if (!a) return;
      const elapsed   = (Date.now() - a.at) / 1000;
      const remaining = Math.max(0, a.durationS - elapsed);
      setDisplay(prev => ({ ...prev, etaSeconds: Math.round(remaining) }));
    }, 1000);
    return () => clearInterval(id);
  }, [enabled]);

  return display;
}
