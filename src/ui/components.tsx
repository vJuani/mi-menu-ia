import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dishEmoji, font, radius, space, usePalette } from './theme';
import type { Recipe } from '../domain/types';

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = usePalette();
  const inner = <View style={{ padding: padded ? space.lg : 0, gap: space.md, paddingBottom: 48 }}>{children}</View>;
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: font.title, fontWeight: '800', color: c.text }}>{children}</Text>
      {sub ? <Text style={{ fontSize: font.small, color: c.muted }}>{sub}</Text> : null}
    </View>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  const c = usePalette();
  return <Text style={{ fontSize: font.h2, fontWeight: '700', color: c.text, marginTop: space.sm }}>{children}</Text>;
}

export function Body({ children, muted, small, bold, style }: { children: React.ReactNode; muted?: boolean; small?: boolean; bold?: boolean; style?: object }) {
  const c = usePalette();
  return <Text style={[{ fontSize: small ? font.small : font.body, color: muted ? c.muted : c.text, fontWeight: bold ? '700' : '400', lineHeight: small ? 19 : 22 }, style]}>{children}</Text>;
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'primary' | 'accent' | 'ro' | 'baby' | 'danger' | 'warning' }) {
  const c = usePalette();
  const bg = tone ? c[`${tone}Soft` as const] : c.card;
  const body = <View style={[styles.card, { backgroundColor: bg, borderColor: c.border }, style]}>{children}</View>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>{body}</Pressable> : body;
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, loading, small }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: string; disabled?: boolean; loading?: boolean; small?: boolean }) {
  const c = usePalette();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? c.danger : kind === 'secondary' ? c.primarySoft : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? c.onPrimary : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, paddingVertical: small ? 10 : 16, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: c.primary }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: small ? font.small : font.h3, fontWeight: '700' }}>{icon ? `${icon}  ` : ''}{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: 'ro' | 'baby' | 'accent' | 'danger' }) {
  const c = usePalette();
  const bg = active ? c.primary : tone ? c[`${tone}Soft` as const] : c.card;
  const fg = active ? c.onPrimary : tone ? c[tone] : c.text;
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: bg, borderColor: active ? c.primary : c.border }]}>
      <Text style={{ color: fg, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, gap = space.sm, wrap, style }: { children: React.ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Field(props: TextInputProps & { label?: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 4 }}>
      {props.label ? <Text style={{ color: c.muted, fontSize: font.small }}>{props.label}</Text> : null}
      <TextInput placeholderTextColor={c.muted} {...props} style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }, props.style]} />
    </View>
  );
}

export function DishImage({ recipe, size = 64 }: { recipe: Pick<Recipe, 'imageUri' | 'tags' | 'name'>; size?: number }) {
  const c = usePalette();
  if (recipe.imageUri) return <Image source={{ uri: recipe.imageUri }} style={{ width: size, height: size, borderRadius: radius.sm }} accessibilityLabel={recipe.name} />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.5 }}>{dishEmoji(recipe.tags, recipe.name)}</Text>
    </View>
  );
}

export function Notice({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'baby' | 'primary'; children: React.ReactNode }) {
  const c = usePalette();
  return (
    <View style={{ backgroundColor: c[`${tone}Soft` as const], borderRadius: radius.sm, padding: space.md }}>
      <Text style={{ color: c.text, fontSize: font.small, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Body muted>{text}</Body>;
}

export function Stepper({ value, onChange, step = 1, min = 0, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  const c = usePalette();
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return (
    <Row gap={space.sm}>
      <Pressable onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))} style={[styles.stepBtn, { borderColor: c.border }]}><Text style={{ color: c.text, fontSize: 20 }}>−</Text></Pressable>
      <Text style={{ minWidth: 64, textAlign: 'center', color: c.text, fontSize: font.body, fontWeight: '700' }}>{fmt(value)}{suffix ? ` ${suffix}` : ''}</Text>
      <Pressable onPress={() => onChange(+(value + step).toFixed(2))} style={[styles.stepBtn, { borderColor: c.border }]}><Text style={{ color: c.text, fontSize: 20 }}>+</Text></Pressable>
    </Row>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, gap: space.sm },
  button: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, minHeight: 48 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 12, fontSize: font.body },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
