import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppDataProvider, useAppData } from '../src/state/AppData';
import { usePalette } from '../src/ui/theme';

function Gate() {
  const { ready, error } = useAppData();
  const c = usePalette();
  if (error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg }}><Text style={{ color: c.danger }}>No se pudo abrir la base de datos: {error}</Text></View>;
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.primary} /></View>;
  return (
    <>
      <Stack screenOptions={{ headerTintColor: c.primary, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.text }, contentStyle: { backgroundColor: c.bg }, headerBackTitle: 'Atrás' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="receta/[id]" options={{ title: 'Receta' }} />
        <Stack.Screen name="receta/editar" options={{ title: 'Receta', presentation: 'modal' }} />
        <Stack.Screen name="recetas" options={{ title: 'Recetario' }} />
        <Stack.Screen name="cocina/[id]" options={{ title: 'Modo cocina', presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="cambiar/[mealId]" options={{ title: 'Cambiar comida', presentation: 'modal' }} />
        <Stack.Screen name="compras" options={{ title: 'Lista de compras' }} />
        <Stack.Screen name="familia" options={{ title: 'Familia y restricciones' }} />
        <Stack.Screen name="helena" options={{ title: 'Helena' }} />
        <Stack.Screen name="progreso" options={{ title: 'Progreso' }} />
        <Stack.Screen name="ajustes" options={{ title: 'Configuración' }} />
        <Stack.Screen name="escanear" options={{ title: 'Escanear', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <StatusBar style="auto" />
        <Gate />
      </AppDataProvider>
    </SafeAreaProvider>
  );
}
