// ─── Public API surface ────────────────────────────────────────────────────────
// This is the single entry point for all consumers of @/lib/api.
// All existing imports (endpoints, api, ApiError, types) continue to work unchanged.

// ── Core client ───────────────────────────────────────────────────────────────
export { api, ApiError, API_BASE_URL, setApiLanguage, setOnAccountSuspended } from './_client';

// ── Shared types ──────────────────────────────────────────────────────────────
export type {
  ShuttleCompleteResponse,
  TripRevenueSummary,
  TripCashSummary,
  FinancialTransaction,
  FinancialAnalytics,
  EmergencyContact,
  DriverProfileEnriched,
  DriverReferralInfo,
  BonusTarget,
  DriverPromotion,
  RideMessage,
  RideHistoryItem,
  LocationSnapshot,
} from './types';

// ── Endpoint group imports ────────────────────────────────────────────────────
import { authEndpoints } from './auth';
import {
  driverEndpoints,
  pushTokensEndpoints,
  registrationEndpoints,
  vehiclesEndpoints,
  servicesEndpoints,
  settingsEndpoints,
  emergencyContactEndpoints,
  bonusTargetsEndpoints,
} from './driver';
import {
  ridesEndpoints,
  tripShareEndpoints,
  safetyEndpoints,
  earningsEndpoints,
  walletEndpoints,
  notificationsEndpoints,
  serviceControlEndpoints,
  supportEndpoints,
  termsEndpoints,
} from './ride';
import {
  shuttleEndpoints,
  tripsEndpoints,
  financialAnalyticsEndpoints,
} from './shuttle';
import { trackingEndpoints } from './tracking';

// ── Assembled endpoints object ────────────────────────────────────────────────
// Shape is identical to the original endpoints object in lib/api.ts.
// All call sites using endpoints.driver.method(), endpoints.shuttle.method(), etc.
// continue to work without modification.
export const endpoints = {
  auth:               authEndpoints,
  driver:             driverEndpoints,
  pushTokens:         pushTokensEndpoints,
  rides:              ridesEndpoints,
  trips:              tripsEndpoints,
  earnings:           earningsEndpoints,
  tripShare:          tripShareEndpoints,
  safety:             safetyEndpoints,
  wallet:             walletEndpoints,
  shuttle:            shuttleEndpoints,
  notifications:      notificationsEndpoints,
  serviceControl:     serviceControlEndpoints,
  support:            supportEndpoints,
  registration:       registrationEndpoints,
  vehicles:           vehiclesEndpoints,
  services:           servicesEndpoints,
  settings:           settingsEndpoints,
  emergencyContact:   emergencyContactEndpoints,
  bonusTargets:       bonusTargetsEndpoints,
  financialAnalytics: financialAnalyticsEndpoints,
  tracking:           trackingEndpoints,
  terms:              termsEndpoints,
};
