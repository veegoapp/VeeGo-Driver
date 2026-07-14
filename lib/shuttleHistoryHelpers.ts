// ── Shape normalisation helpers shared between shuttle history screens ─────────
// Extracted verbatim from app/shuttle/history.tsx. Do not change behavior here;
// this file exists purely to remove duplication between history.tsx and
// history-export.tsx.
export type RawTrip = Record<string, unknown>;

export function extractRouteName(raw: RawTrip): string {
  if (typeof raw.routeName === 'string' && raw.routeName) return raw.routeName;
  if (typeof raw.lineName  === 'string' && raw.lineName)  return raw.lineName;
  const line = raw.line as Record<string, unknown> | undefined;
  if (line) {
    if (typeof line.name === 'string' && line.name) return line.name;
    const route = line.route as Record<string, unknown> | undefined;
    if (route && typeof route.name === 'string') return route.name;
  }
  return '—';
}

export function extractDate(raw: RawTrip): Date | null {
  const raw_date =
    raw.completedAt ?? raw.finishedAt ?? raw.endedAt ?? raw.createdAt ?? raw.startedAt;
  if (!raw_date) return null;
  const d = new Date(String(raw_date));
  return isNaN(d.getTime()) ? null : d;
}

export function extractEarning(raw: RawTrip): number | null {
  const val =
    raw.earnedAmount ?? raw.driverEarning ?? raw.earning ?? raw.amount ?? raw.netEarning;
  if (val == null) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

export function extractPassengerCount(raw: RawTrip): number | null {
  const val = raw.passengerCount ?? raw.passengers;
  if (val == null) return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}
