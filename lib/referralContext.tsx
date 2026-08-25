import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useAuth } from '@/lib/authContext';

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

  // Incoming referrals used to exist only in memory, populated exclusively
  // by live socket events — if this driver's app was closed when a referral
  // fired, it was simply never seen. Hydrate from the backend on app open too.
  const { token } = useAuth();
  const { data: incomingData } = useQuery({
    queryKey: ['shuttle-referrals-incoming'],
    queryFn: () => endpoints.shuttle.incomingReferrals(),
    enabled: !!token,
  });

  useEffect(() => {
    const rows = incomingData?.data;
    if (!rows) return;
    for (const r of rows) {
      addIncomingReferral({
        referralId: String(r.referralId),
        tripId: r.tripId != null ? String(r.tripId) : undefined,
        bookingId: r.bookingId != null ? String(r.bookingId) : undefined,
        routeName: String(r.routeName ?? ''),
        routeNameAr: r.routeNameAr != null ? String(r.routeNameAr) : undefined,
        departureTime: String(r.departureTime ?? ''),
        fromStation: String(r.fromStation ?? ''),
        toStation: String(r.toStation ?? ''),
        fromStationAr: r.fromStationAr != null ? String(r.fromStationAr) : undefined,
        toStationAr: r.toStationAr != null ? String(r.toStationAr) : undefined,
        weekStart: r.weekStart != null ? String(r.weekStart) : undefined,
      });
    }
  }, [incomingData, addIncomingReferral]);

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
