/**
 * ReferralContext
 *
 * Holds the queue of incoming trip-referral requests received via WebSocket.
 * Consumed by:
 *   - ShuttleTabBar     → badge count on the Home tab icon
 *   - ShuttleHomeScreen → orange banner CTA
 *   - ReferralIncoming  → auto-clears its own entry on mount
 *
 * TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners
 * The payload shape (IncomingReferralPayload) must match what the backend emits on
 * the "shuttle:referral:incoming" event.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';

export type IncomingReferralPayload = {
  referralId: string;
  bookingId: string;
  routeName: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
  passengerCount?: string;
  totalSeats?: string;
  lineNumber?: string;
  vehicleType?: string;
  weekStart?: string;
};

type ReferralContextValue = {
  pendingReferrals: IncomingReferralPayload[];
  incomingReferralsCount: number;
  addIncomingReferral: (referral: IncomingReferralPayload) => void;
  dismissReferral: (referralId: string) => void;
  clearReferralBadge: () => void;
};

const ReferralContext = createContext<ReferralContextValue>({
  pendingReferrals: [],
  incomingReferralsCount: 0,
  addIncomingReferral: () => {},
  dismissReferral: () => {},
  clearReferralBadge: () => {},
});

export function ReferralProvider({ children }: { children: React.ReactNode }) {
  const [pendingReferrals, setPendingReferrals] = useState<IncomingReferralPayload[]>([]);

  const addIncomingReferral = useCallback((referral: IncomingReferralPayload) => {
    setPendingReferrals(prev => {
      // Deduplicate by referralId to guard against duplicate socket emissions
      if (prev.some(r => r.referralId === referral.referralId)) return prev;
      return [referral, ...prev];
    });
  }, []);

  const dismissReferral = useCallback((referralId: string) => {
    setPendingReferrals(prev => prev.filter(r => r.referralId !== referralId));
  }, []);

  const clearReferralBadge = useCallback(() => {
    setPendingReferrals([]);
  }, []);

  return (
    <ReferralContext.Provider
      value={{
        pendingReferrals,
        incomingReferralsCount: pendingReferrals.length,
        addIncomingReferral,
        dismissReferral,
        clearReferralBadge,
      }}
    >
      {children}
    </ReferralContext.Provider>
  );
}

export function useReferral() {
  return useContext(ReferralContext);
}
