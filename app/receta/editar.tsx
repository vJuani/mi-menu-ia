/**
 * Editor de recetas propias. Crea, edita o duplica (`?id=` / `?dup=`).
 * Valida en vivo con las mismas reglas del dominio y muestra cómo queda cada
 * versión (vos, Ro, Helena) antes de guardar.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, Switch, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Body, Button, Card, Chip, DishImage, Field, H2, Notice, Row, Screen, Stepper } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import {
  ALLERGENS, buildCustomIngredient, duplicateRecipe, emptyDraft, finalizeDraft, flagsFromTags, hasErrors, inferTags,
  moveItem, newIngredientLine, RECIPE_TAGS, renumberSteps, TEXTURES, validateRecipeDraft,
} from '../../src/domain/recipeEditor';
import type { Allergen, SafetyFlags } from '../../src/domain/recipeEditor';
import { buildFamilyVersions } from '../../src/domain/adaptations';
import { TEXTURE_LABEL } from '../../src/domain/babySafety';
import { matchIngredient, normalize } from '../../src/domain/textParser';
import type { Ingredient, IngredientCategory, Recipe, RecipeIngredient, Unit } from '../../src/domain/types';
import { space, usePalette } from '../../src/ui/theme';

const ALLERGEN_LABEL: Record<Allergen, string> = { huevo: 'Huevo', leche: 'Leche', pescado: 'Pescado', mariscos: 'Mariscos', mani: 'Maní', frutos_secos: 'Frutos secos', soja: 'Soja', trigo: 'Trigo', sesamo: 'Sésamo' };
const CATEGORIES: { id: IngredientCategory; label: string }[] = [
  { id: 'verdura', label: 'Verdura' }, { id: 'fruta', label: 'Fruta' }, { id: 'carne', label: 'Carne' }, { id: 'pollo', label: 'Pollo' },
  { id: 'pescado', label: 'Pescado' }, { id: 'huevo', label: 'Huevo' }, { id: 'lacteo', label: 'Lácteo' }, { id: 'cereal', label: 'Cereal' },
  { id: 'legumbre', label: 'Legumbre' }, { id: 'panificado', label: 'Panificado' }, { id: 'grasa', label: 'Grasa' }, { id: 'condimento', label: 'Condimento' }, { id: 'otro', label: 'Otro' },
];

function unitsFor(ing: Ingredient): Unit[] {
  if (ing.defaultUnit === 'ml' || ing.defaultUnit === 'l') return ['ml', 'l'];
  if (ing.defaultUnit === 'un') return ing.gramsPerUnit ? ['un', 'g', 'kg'] : ['un'];
  return ing.gramsPerUnit ? ['g', 'kg', 'un'] : ['g', 'kg'];
}

export default function RecipeEditor() {
  const { id, dup } = useLocalSearchParams<{ id?: string; dup?: string }>();
  const { data, commit } = useAppData();
  const c = usePalette();
  const [ingredients, setIngredients] = useState<Map<string, Ingredient>>(data.ingredients);
  const [newIngs, setNewIngs] = useState<Ingredient[]>([]);
  const [draft, setDraft] = useState<Recipe>(() => {
    if (dup && data.recipes.get(dup)) return duplicateRecipe(data.recipes.get(dup)!, data.recipes.keys());
    if (id && data.recipes.get(id)) return JSON.parse(JSON.stringify(data.recipes.get(id)!)) as Recipe;
    return emptyDraft();
  });
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<null | { name: string; category: IngredientCategory; unit: Unit; gpu: string; flags: SafetyFlags; kcal: string; p: string; hc: string; f: string }>(null);
  const [utensils, setUtensils] = useState(draft.utensils.join(', '));
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<Recipe>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setLine = (i: number, patch: Partial<RecipeIngredient>) => update({ ingredients: draft.ingredients.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setStep = (i: number, patch: Partial<Recipe['steps'][number]>) => update({ steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const full = { ...draft, utensils: utensils.split(',') };
  const issues = useMemo(() => validateRecipeDraft(full, ingredients), [draft, ingredients, utensils]);
  const preview = useMemo(() => {
    if (!draft.ingredients.length) return null;
    try { return buildFamilyVersions(draft, data.members, {}, ingredients, data.babyCtx ? { ...data.babyCtx, ingredients } : undefined); } catch { return null; }
  }, [draft, ingredients, data]);

  const results = useMemo(() => {
    const n = normalize(search);
    if (n.length < 2) return [];
    return [...ingredients.values()].filter((i) => normalize(i.name).includes(n) || i.aliases.some((a) => normalize(a).includes(n))).slice(0, 8);
  }, [search, ingredients]);

  function addIngredient(ing: Ingredient) {
    update({ ingredients: [...draft.ingredients, newIngredientLine(ing)] });
    setSearch('');
  }

  function startCreate() {
    const name = search.trim();
    const guess = matchIngredient(name, [...ingredients.values()]);
    if (guess && normalize(guess.name) === normalize(name)) return addIngredient(guess);
    setCreating({ name, category: 'otro', unit: 'g', gpu: '', flags: flagsFromTags(inferTags(name)), kcal: '', p: '', hc: '', f: '' });
  }

  function confirmCreate() {
    if (!creating) return;
    const nums = [creating.kcal, creating.p, creating.hc, creating.f].map((x) => Number(x.replace(',', '.')));
    const hasNutrition = [creating.kcal, creating.p, creating.hc, creating.f].every((x) => x.trim() !== '') && nums.every((x) => x >= 0);
    try {
      const ing = buildCustomIngredient({
        name: creating.name, category: creating.category, defaultUnit: creating.unit,
        gramsPerUnit: creating.gpu ? Number(creating.gpu.replace(',', '.')) : undefined,
        per100g: hasNutrition ? { kcal: nums[0], proteinG: nums[1], carbsG: nums[2], fatG: nums[3] } : undefined,
        nutritionBasis: 'crudo', flags: creating.flags,
      }, ingredients.keys());
      const m = new Map(ingredients); m.set(ing.id, ing);
      setIngredients(m);
      setNewIngs((x) => [...x, ing]);
      update({ ingredients: [...draft.ingredients, newIngredientLine(ing)] });
      setCreating(null); setSearch('');
    } catch (e) { Alert.alert('Revisá el ingrediente', String((e as Error).message)); }
  }

  async function pickPhoto(fromCamera: boolean) {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Sin permiso', 'Habilitalo desde Ajustes del iPhone.');
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [4, 3] });
    if (res.canceled || !res.assets?.[0]) return;
    const dir = new Directory(Paths.document, 'fotos');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `receta_${Date.now()}.jpg`);
    new File(res.assets[0].uri).copy(dest);
    update({ imageUri: dest.uri });
  }

  async function save() {
    if (hasErrors(issues)) return;
    setSaving(true);
    const taken = data.allRecipes.map((r) => r.id);
    const final = finalizeDraft(full, draft.id ? taken.filter((x) => x !== draft.id) : taken);
    await commit(async (repo) => {
      for (const ing of newIngs.filter((n) => final.ingredients.some((l) => l.ingredientId === n.id))) await repo.saveIngredient(ing, true);
      await repo.saveRecipe(final);
    });
    setSaving(false);
    router.replace({ pathname: '/receta/[id]', params: { id: final.id } });
  }

  function cancel() {
    if (!dirty) return router.back();
    Alert.alert('¿Descartar cambios?', undefined, [{ text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => router.back() }]);
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'aviso');
  const isEdit = !!id && !dup;

  return (
    <Screen>
      <Stack.Screen options={{ title: isEdit ? 'Editar receta' : dup ? 'Duplicar receta' : 'Nueva receta', headerLeft: () => <Pressable onPress={cancel}><Body style={{ color: c.primary }}>Cancelar</Body></Pressable> }} />
      {isEdit && draft.isDemo ? <Notice>Es una receta de demostración: al guardar pasa a ser tuya y no se borra con los datos demo.</Notice> : null}

      <Row gap={space.md}>
        {draft.imageUri ? <Image source={{ uri: draft.imageUri }} style={{ width: 96, height: 72, borderRadius: 10 }} /> : <DishImage recipe={draft} size={72} />}
        <View style={{ flex: 1, gap: 6 }}>
          <Button small kind="secondary" title="📷 Sacar foto" onPress={() => pickPhoto(true)} />
          <Button small kind="ghost" title="Elegir de la galería" onPress={() => pickPhoto(false)} />
        </View>
      </Row>

      <Field label="Nombre" value={draft.name} onChangeText={(v) => update({ name: v })} placeholder="Ej.: Pollo al limón con verduras" />
      <Row style={{ justifyContent: 'space-between' }}><Body>Tiempo total</Body><Stepper value={draft.totalMinutes} step={5} min={5} onChange={(v) => update({ totalMinutes: v })} suffix="min" /></Row>
      <Row style={{ justifyContent: 'space-between' }}><Body>Rinde (porciones adultas)</Body><Stepper value={draft.servings} step={1} min={1} onChange={(v) => update({ servings: v })} /></Row>
      <Row wrap>{(['facil', 'media', 'dificil'] as const).map((d) => <Chip key={d} label={{ facil: 'Fácil', media: 'Media', dificil: 'Difícil' }[d]} active={draft.difficulty === d} onPress={() => update({ difficulty: d })} />)}</Row>
      <Body small muted>Momento y características</Body>
      <Row wrap>{RECIPE_TAGS.map((t) => <Chip key={t.id} label={t.label} active={draft.tags.includes(t.id)} onPress={() => update({ tags: draft.tags.includes(t.id) ? draft.tags.filter((x) => x !== t.id) : [...draft.tags, t.id] })} />)}</Row>

      <H2>Ingredientes</H2>
      <Body small muted>Cantidades para la receta completa ({draft.servings} porciones). Indicá si el peso es crudo o cocido.</Body>
      {draft.ingredients.map((l, i) => {
        const ing = ingredients.get(l.ingredientId);
        if (!ing) return null;
        const step = l.unit === 'un' ? 0.5 : l.unit === 'kg' || l.unit === 'l' ? 0.1 : 10;
        return (
          <Card key={`${l.ingredientId}-${i}`}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{ing.name}{ing.id.startsWith('custom_') ? ' · propio' : ''}</Body>
              <Pressable onPress={() => update({ ingredients: draft.ingredients.filter((_, j) => j !== i) })} hitSlop={10}><Body muted>✕</Body></Pressable>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row wrap>{unitsFor(ing).map((u) => <Chip key={u} label={u} active={l.unit === u} onPress={() => setLine(i, { unit: u })} />)}</Row>
              <Stepper value={l.qty} step={step} min={0} onChange={(v) => setLine(i, { qty: v })} />
            </Row>
            <Row wrap>
              <Chip label="Crudo" active={l.state === 'crudo'} onPress={() => setLine(i, { state: 'crudo' })} />
              <Chip label="Cocido" active={l.state === 'cocido'} onPress={() => setLine(i, { state: 'cocido' })} />
              <Chip label="Opcional" active={!!l.optional} onPress={() => setLine(i, { optional: !l.optional || undefined })} />
              <Chip label="Se sirve aparte" active={!!l.separable} onPress={() => setLine(i, { separable: !l.separable || undefined })} />
              <Chip tone="baby" label="Después de separar a Helena" active={!!l.addedAfterBabySplit} onPress={() => setLine(i, { addedAfterBabySplit: !l.addedAfterBabySplit || undefined })} />
            </Row>
            <Field placeholder="Nota (opcional)" value={l.note ?? ''} onChangeText={(v) => setLine(i, { note: v || undefined })} />
          </Card>
        );
      })}
      <Field placeholder="Buscar ingrediente para agregar…" value={search} onChangeText={setSearch} autoCorrect={false} />
      {results.length || search.trim().length >= 2 ? (
        <Row wrap>
          {results.map((r) => <Chip key={r.id} label={`＋ ${r.name}`} onPress={() => addIngredient(r)} />)}
          {search.trim().length >= 2 ? <Chip tone="accent" label={`Crear «${search.trim()}»`} onPress={startCreate} /> : null}
        </Row>
      ) : null}

      {creating ? (
        <Card tone="accent">
          <Body bold>Nuevo ingrediente: {creating.name}</Body>
          <Row wrap>{CATEGORIES.map((k) => <Chip key={k.id} label={k.label} active={creating.category === k.id} onPress={() => setCreating({ ...creating, category: k.id })} />)}</Row>
          <Body small muted>Unidad en que lo comprás</Body>
          <Row wrap>{(['g', 'ml', 'un'] as Unit[]).map((u) => <Chip key={u} label={u === 'un' ? 'unidades' : u} active={creating.unit === u} onPress={() => setCreating({ ...creating, unit: u })} />)}</Row>
          {creating.unit !== 'ml' ? <Field label={creating.unit === 'un' ? 'Gramos por unidad (opcional, para convertir)' : 'Gramos por unidad (opcional)'} keyboardType="decimal-pad" value={creating.gpu} onChangeText={(v) => setCreating({ ...creating, gpu: v })} /> : null}
          <Body small muted>Nutrición cada 100 g en crudo (opcional; si no la cargás, no suma calorías)</Body>
          <Row gap={6}>
            {(['kcal', 'p', 'hc', 'f'] as const).map((k) => <View key={k} style={{ flex: 1 }}><Field placeholder={{ kcal: 'kcal', p: 'prot', hc: 'HC', f: 'grasa' }[k]} keyboardType="decimal-pad" value={creating[k]} onChangeText={(v) => setCreating({ ...creating, [k]: v })} /></View>)}
          </Row>
          <Notice tone="baby">Marcá lo que corresponda: se usa para proteger a Helena y respetar restricciones. Lo pre-marcamos según el nombre; revisalo.</Notice>
          {([['sal', 'Contiene sal / mucho sodio'], ['azucar', 'Contiene azúcar'], ['miel', 'Es o contiene miel'], ['atragantamiento', 'Formato con riesgo de atragantamiento'], ['crudo', 'Se consume crudo (pescado, huevo, carne)']] as const).map(([k, label]) => (
            <Row key={k} style={{ justifyContent: 'space-between' }}><View style={{ flex: 1 }}><Body small>{label}</Body></View><Switch value={creating.flags[k]} onValueChange={(v) => setCreating({ ...creating, flags: { ...creating.flags, [k]: v } })} /></Row>
          ))}
          <Body small muted>Alérgenos</Body>
          <Row wrap>{ALLERGENS.map((a) => <Chip key={a} tone="danger" label={ALLERGEN_LABEL[a]} active={creating.flags.allergens.includes(a)} onPress={() => setCreating({ ...creating, flags: { ...creating.flags, allergens: creating.flags.allergens.includes(a) ? creating.flags.allergens.filter((x) => x !== a) : [...creating.flags.allergens, a] } })} />)}</Row>
          <Row gap={8}>
            <View style={{ flex: 1 }}><Button small kind="secondary" title="Cancelar" onPress={() => setCreating(null)} /></View>
            <View style={{ flex: 1 }}><Button small title="Crear y agregar" onPress={confirmCreate} /></View>
          </Row>
        </Card>
      ) : null}

      <H2>Pasos</H2>
      {draft.steps.map((s, i) => (
        <Card key={i} tone={s.babySplit ? 'baby' : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body bold>Paso {i + 1}</Body>
            <Row gap={14}>
              <Pressable onPress={() => update({ steps: renumberSteps(moveItem(draft.steps, i, i - 1)) })} hitSlop={8}><Body muted>↑</Body></Pressable>
              <Pressable onPress={() => update({ steps: renumberSteps(moveItem(draft.steps, i, i + 1)) })} hitSlop={8}><Body muted>↓</Body></Pressable>
              <Pressable onPress={() => update({ steps: renumberSteps(draft.steps.filter((_, j) => j !== i)) })} hitSlop={8}><Body muted>✕</Body></Pressable>
            </Row>
          </Row>
          <Field multiline value={s.text} onChangeText={(v) => setStep(i, { text: v })} placeholder="Ej.: Cortá 250 g de calabaza en cubos de 2 cm." />
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field label="Temporizador (min)" keyboardType="decimal-pad" value={s.timerSec ? String(+(s.timerSec / 60).toFixed(1)) : ''} onChangeText={(v) => setStep(i, { timerSec: v.trim() ? Math.round(Number(v.replace(',', '.')) * 60) : undefined })} /></View>
            <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}><Body small>Separar porción de Helena</Body><Switch value={!!s.babySplit} onValueChange={(v) => setStep(i, { babySplit: v || undefined })} /></View>
          </Row>
          <Field placeholder="Consejo (opcional)" value={s.tip ?? ''} onChangeText={(v) => setStep(i, { tip: v || undefined })} />
        </Card>
      ))}
      <Button small kind="secondary" title="＋ Agregar paso" onPress={() => update({ steps: [...draft.steps, { order: draft.steps.length + 1, text: '' }] })} />

      <H2>Helena</H2>
      <Body small muted>¿Cómo puede adaptarse para ella? Si no elegís ninguna textura, la app le buscará una alternativa aparte.</Body>
      <Row wrap>{TEXTURES.map((t) => <Chip key={t} tone="baby" label={TEXTURE_LABEL[t]} active={!!draft.babyTextures?.includes(t)} onPress={() => update({ babyTextures: draft.babyTextures?.includes(t) ? draft.babyTextures.filter((x) => x !== t) : [...(draft.babyTextures ?? []), t] })} />)}</Row>

      <H2>Más datos</H2>
      <Field label="Utensilios (separados por coma)" value={utensils} onChangeText={(v) => { setUtensils(v); setDirty(true); }} />
      <Field label="Cómo conservar las sobras" multiline value={draft.storage ?? ''} onChangeText={(v) => update({ storage: v })} />

      <H2>Vista previa</H2>
      {preview ? preview.versions.map((v) => (
        <Body key={v.memberId} small>
          {v.status === 'bebe'
            ? `👶 ${v.memberName}: ${v.baby?.verdict === 'bloqueado' ? 'necesita alternativa aparte' : v.baby?.verdict === 'requiere_confirmacion' ? 'puede compartir con alimentos nuevos a confirmar' : 'puede compartir adaptada'}`
            : `${v.memberName}: ${v.status === 'no_apta' ? '⚠️ no apta' : v.status === 'apta_con_cambios' ? 'con cambios' : 'apta'}${v.nutrition ? ` · ≈ ${v.nutrition.kcal} kcal, ${v.nutrition.proteinG} g prot por porción` : ''}${v.removed.length ? ` · sin ${v.removed.map((r) => r.name.toLowerCase()).join(', ')}` : ''}`}
        </Body>
      )) : <Body small muted>Agregá ingredientes para ver las versiones.</Body>}

      {errors.length ? <Notice tone="danger">{errors.map((e) => `• ${e.message}`).join('\n')}</Notice> : null}
      {warnings.length ? <Notice>{warnings.map((e) => `• ${e.message}`).join('\n')}</Notice> : null}
      <Button title={isEdit ? 'Guardar cambios' : 'Guardar receta'} disabled={hasErrors(issues)} loading={saving} onPress={save} />
    </Screen>
  );
}
