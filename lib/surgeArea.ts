import type { SurgeUpdate } from '@/lib/types';

/** Latest surge update per area, keyed by vehicle type and zone. */
export type SurgeByArea = Record<string, SurgeUpdate>;

// zoneId: a number is that zone, null is outside every zone, and undefined is
// a manual override that applies everywhere.
function areaKey({ vehicleType, zoneId }: SurgeUpdate): string {
  return `${vehicleType}:${zoneId === undefined ? 'all' : zoneId === null ? 'out' : zoneId}`;
}

export function recordSurge(byArea: SurgeByArea, update: SurgeUpdate): SurgeByArea {
  const next = { ...byArea, [areaKey(update)]: update };
  // A zone-specific update means the vehicle type's override ended.
  if (update.zoneId !== undefined) delete next[areaKey({ ...update, zoneId: undefined })];
  return next;
}

/** The highest active surge that applies in `zoneId` (null = outside every zone), or null. */
export function surgeForZone(byArea: SurgeByArea, zoneId: number | null): SurgeUpdate | null {
  let best: SurgeUpdate | null = null;
  for (const update of Object.values(byArea)) {
    const applies = update.zoneId === undefined || update.zoneId === zoneId;
    if (!applies || !update.isActive || update.multiplier <= 1) continue;
    if (!best || update.multiplier > best.multiplier) best = update;
  }
  return best;
}
