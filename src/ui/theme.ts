import { useColorScheme } from 'react-native';

const light = {
  bg: '#F7F5F0',
  card: '#FFFFFF',
  text: '#1D2420',
  muted: '#6B746E',
  border: '#E7E3DA',
  primary: '#2F7D32',
  primarySoft: '#E6F2E3',
  onPrimary: '#FFFFFF',
  accent: '#F08A24',
  accentSoft: '#FDEBD8',
  ro: '#E05A73',
  roSoft: '#FCE8EC',
  baby: '#7B61D1',
  babySoft: '#EEE9FB',
  danger: '#C62828',
  dangerSoft: '#FDE7E7',
  warning: '#B26A00',
  warningSoft: '#FFF3D6',
};

const dark: typeof light = {
  bg: '#111513',
  card: '#1B211E',
  text: '#ECEFEA',
  muted: '#9AA39D',
  border: '#2B332F',
  primary: '#5DBB63',
  primarySoft: '#1F3322',
  onPrimary: '#0D140F',
  accent: '#F5A04F',
  accentSoft: '#3A2A19',
  ro: '#F07D93',
  roSoft: '#3A2229',
  baby: '#A893F0',
  babySoft: '#2A2440',
  danger: '#EF6B6B',
  dangerSoft: '#3A1D1D',
  warning: '#F2B544',
  warningSoft: '#3A2F17',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };
export const font = { title: 28, h2: 20, h3: 17, body: 16, small: 14, tiny: 12 };

/** Ilustración por receta mientras no haya foto propia (no se usan fotos de stock). */
export function dishEmoji(tags: string[], name: string): string {
  const n = name.toLowerCase();
  if (n.includes('merluza') || n.includes('atún') || n.includes('pescado')) return '🐟';
  if (n.includes('hamburguesa')) return '🍔';
  if (n.includes('yogur')) return '🥣';
  if (n.includes('sándwich')) return '🥪';
  if (n.includes('tostada')) return '🥑';
  if (n.includes('lenteja')) return '🍲';
  if (n.includes('tortilla')) return '🍳';
  if (n.includes('ensalada')) return '🥗';
  if (n.includes('carne')) return '🥩';
  if (n.includes('pollo')) return '🍗';
  return tags.includes('desayuno') ? '☕' : '🍽️';
}
