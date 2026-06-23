import type { ServiceType } from './serviceContext';

type Listener = (serviceType: ServiceType) => void;
const listeners = new Set<Listener>();

/**
 * Subscribe to the authoritative service type emitted by the backend
 * routing layer (navigateToHome). Fires once per login after the onboarding
 * endpoint returns. Returns an unsubscribe function.
 */
export function onServiceTypeFromBackend(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Called by navigateToHome (postAuthRouter) once the backend confirms the
 * driver's service type. Notifies all ServiceContext subscribers so they can
 * update their state without relying on any frontend default.
 */
export function emitServiceTypeFromBackend(serviceType: ServiceType): void {
  listeners.forEach(l => l(serviceType));
}
