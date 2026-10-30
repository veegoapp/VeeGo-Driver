import { recordSurge, surgeForZone, type SurgeByArea } from './surgeArea';

const update = (vehicleType: string, multiplier: number, zoneId?: number | null) =>
  ({ vehicleType, multiplier, isActive: multiplier > 1, zoneId });

describe('surgeForZone', () => {
  it('only returns surge of the driver\'s own zone', () => {
    let s: SurgeByArea = {};
    s = recordSurge(s, update('car', 1.6, 1));
    s = recordSurge(s, update('car', 1.3, 2));
    expect(surgeForZone(s, 1)?.multiplier).toBe(1.6);
    expect(surgeForZone(s, 2)?.multiplier).toBe(1.3);
    expect(surgeForZone(s, null)).toBeNull();
  });

  it('applies an override without a zone everywhere', () => {
    const s = recordSurge({}, update('car', 2));
    expect(surgeForZone(s, 7)?.multiplier).toBe(2);
    expect(surgeForZone(s, null)?.multiplier).toBe(2);
  });

  it('drops the override once a zone-specific update arrives', () => {
    let s = recordSurge({}, update('car', 2));
    s = recordSurge(s, update('car', 1, 1));
    expect(surgeForZone(s, 1)).toBeNull();
    expect(surgeForZone(s, null)).toBeNull();
  });

  it('treats multiplier 1 as no surge', () => {
    expect(surgeForZone(recordSurge({}, update('car', 1, null)), null)).toBeNull();
  });
});
