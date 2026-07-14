import { api } from './_client';
import type { LocationSnapshot } from './types';

export const trackingEndpoints = {
  sendLocation: (data: LocationSnapshot) =>
    api.post<{ success: boolean }>('/tracking/location', data),
  sendBatch: (locations: LocationSnapshot[]) =>
    api.post<{ success: boolean; inserted: number }>('/tracking/locations/batch', { locations }),
};
