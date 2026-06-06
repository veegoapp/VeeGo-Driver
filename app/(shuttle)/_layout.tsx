import { Tabs } from 'expo-router';
import React from 'react';
import { ShuttleTabBar } from '@/components/ShuttleTabBar';
import { ShuttleProvider } from '@/lib/shuttleContext';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';

function ShuttleLayoutContent() {
  const { isBlocked, status } = useServiceGuard('SHUTTLE');

  if (isBlocked) {
    return <ServiceBlockedScreen status={status} serviceName="Shuttle" />;
  }

  return (
    <ShuttleProvider>
      <Tabs
        tabBar={(props) => <ShuttleTabBar {...(props as any)} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="lines" options={{ title: 'Lines' }} />
        <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </ShuttleProvider>
  );
}

export default function ShuttleLayout() {
  return <ShuttleLayoutContent />;
}
