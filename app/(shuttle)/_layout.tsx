import { Tabs } from 'expo-router';
import React from 'react';
import { ShuttleTabBar } from '@/components/ShuttleTabBar';
import { ShuttleProvider } from '@/lib/shuttleContext';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';
import { ReferralProvider } from '@/lib/referralContext';
import { useShuttleSocket } from '@/hooks/useShuttleSocket';

/**
 * ShuttleReferralBridge — zero-render component.
 * Mounts the shuttle socket listener inside both ReferralProvider
 * (needs addIncomingReferral) and SocketProvider (needs socket instance).
 *
 * TODO: Backend Integration - Connect to production Socket.io server and bind real event listeners
 */
function ShuttleReferralBridge() {
  useShuttleSocket();
  return null;
}

function ShuttleLayoutContent() {
  const { isBlocked, status } = useServiceGuard('SHUTTLE');

  if (isBlocked) {
    return <ServiceBlockedScreen status={status} serviceName="Shuttle" />;
  }

  return (
    <ReferralProvider>
      <ShuttleReferralBridge />
      <ShuttleProvider>
        <Tabs
          tabBar={(props) => <ShuttleTabBar {...(props as any)} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="lines" options={{ title: 'Lines' }} />
          <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
          <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
      </ShuttleProvider>
    </ReferralProvider>
  );
}

export default function ShuttleLayout() {
  return <ShuttleLayoutContent />;
}
