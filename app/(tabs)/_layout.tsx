import React from 'react';
import { Text } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAppData } from '../../src/state/AppData';
import { usePalette } from '../../src/ui/theme';

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{e}</Text>;

export default function TabsLayout() {
  const c = usePalette();
  const { data } = useAppData();
  if (!data.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.text }, headerShadowVisible: false,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Hoy', headerShown: false, tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="inventario" options={{ title: 'Inventario', tabBarIcon: icon('🧺') }} />
      <Tabs.Screen name="asistente" options={{ title: 'Asistente', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
