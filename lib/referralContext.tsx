import React, { createContext, useCallback, useContext, useState } from 'react';

export type IncomingReferralPayload = {
  referralId: string;
  // Exactly one of these identifies what's being referred — a single trip
  // (the current default) or, for the older weekly-handoff path, a booking.
  tripId?: string;
  bookingId?: string;
  routeName: string;
  routeNameAr?: string;
  departureTime: string;
  fromStation: string;
  toStation: string;
  fromStationAr?: string;
  toStationAr?: string;
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
};

const ReferralContext = createContext<ReferralContextValue>({
  pendingReferrals: [],
  incomingReferralsCount: 0,
  addIncomingReferral: () => {},
  dismissReferral: () => {},
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

  return (
    <ReferralContext.Provider
      value={{
        pendingReferrals,
        incomingReferralsCount: pendingReferrals.length,
        addIncomingReferral,
        dismissReferral,
      }}
    >
      {children}
    </ReferralContext.Provider>
  );
}

export function useReferral() {
  return useContext(ReferralContext);
}
