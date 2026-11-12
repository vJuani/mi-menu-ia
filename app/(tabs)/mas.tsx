import React from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Body, Card, Screen } from '../../src/ui/components';
import { APP_NAME } from '../../src/config/app';

const ITEMS: { href: Href; icon: string; title: string; sub: string }[] = [
  { href: '/recetas', icon: '📖', title: 'Recetario', sub: 'Buscar, crear, editar y duplicar recetas' },
  { href: '/compras', icon: '🛒', title: 'Lista de compras', sub: 'Faltantes de hoy y de la semana' },
  { href: '/familia', icon: '👨‍👩‍👧', title: 'Familia y restricciones', sub: 'Perfiles, alimentos rechazados, objetivos' },
  { href: '/helena', icon: '👶', title: 'Helena', sub: 'Etapa, texturas, alimentos introducidos, pediatra' },
  { href: '/progreso', icon: '📈', title: 'Progreso físico', sub: 'Peso, medidas, adherencia' },
  { href: '/ajustes', icon: '⚙️', title: 'Configuración y notificaciones', sub: 'Horarios, avisos, respaldo' },
];

export default function Mas() {
  return (
    <Screen>
      {ITEMS.map((i) => (
        <Card key={i.title} onPress={() => router.push(i.href)}>
          <Body bold>{i.icon}  {i.title}</Body>
          <Body small muted>{i.sub}</Body>
        </Card>
      ))}
      <Body small muted>{APP_NAME} · datos guardados solo en este iPhone</Body>
    </Screen>
  );
}
