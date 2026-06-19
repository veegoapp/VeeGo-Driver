import { Tabs } from 'expo-router';
import React from 'react';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useServiceGuard } from '@/hooks/useServiceGuard';
import { useService } from '@/lib/serviceContext';
import { ServiceBlockedScreen } from '@/components/ServiceBlockedScreen';

const SERVICE_NAMES: Record<string, string> = {
  CAR: 'Car Rides',
  SCOOTER: 'Scooter',
  DELIVERY: 'Delivery',
};

function TabLayoutContent() {
  const { serviceType } = useService();
  const { isBlocked, status } = useServiceGuard();

  if (isBlocked) {
    return (
      <ServiceBlockedScreen
        status={status}
        serviceName={SERVICE_NAMES[serviceType] ?? serviceType}
      />
    );
  }

  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...(props as any)} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Drive' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return <TabLayoutContent />;
}
