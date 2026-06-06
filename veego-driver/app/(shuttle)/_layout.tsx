import { Tabs } from 'expo-router';
import React from 'react';
import { ShuttleTabBar } from '@/components/ShuttleTabBar';
import { ShuttleProvider } from '@/lib/shuttleContext';

export default function ShuttleLayout() {
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
