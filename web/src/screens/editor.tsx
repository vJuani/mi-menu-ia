import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, DishImage, Field, H2, Notice, PhotoButton, Row, Screen, Stepper, Toggle, back, go, sheet } from '../ui.tsx';
import {
  ALLERGENS, buildCustomIngredient, duplicateRecipe, emptyDraft, finalizeDraft, flagsFromTags, hasErrors, inferTags,
  moveItem, newIngredientLine, RECIPE_TAGS, renumberSteps, TEXTURES, validateRecipeDraft,
} from '../../../src/domain/recipeEditor.ts';
import type { Allergen, SafetyFlags } from '../../../src/domain/recipeEditor.ts';
import { buildFamilyVersions } from '../../../src/domain/adaptations.ts';
import { TEXTURE_LABEL } from '../../../src/domain/babySafety.ts';
import { matchIngredient, normalize } from '../../../src/domain/textParser.ts';
import type { Ingredient, IngredientCategory, Recipe, RecipeIngredient, Unit } from '../../../src/domain/types.ts';
import { num } from '../util.ts';

const ALLERGEN_LABEL: Record<Allergen, string> = { huevo: 'Huevo', leche: 'Leche', pescado: 'Pescado', mariscos: 'Mariscos', mani: 'Maní', frutos_secos: 'Frutos secos', soja: 'Soja', trigo: 'Trigo', sesamo: 'Sésamo' };
const CATEGORIES: [IngredientCategory, string][] = [['verdura', 'Verdura'], ['fruta', 'Fruta'], ['carne', 'Carne'], ['pollo', 'Pollo'], ['pescado', 'Pescado'], ['huevo', 'Huevo'], ['lacteo', 'Lácteo'], ['cereal', 'Cereal'], ['legumbre', 'Legumbre'], ['panificado', 'Panificado'], ['grasa', 'Grasa'], ['condimento', 'Condimento'], ['otro', 'Otro']];
const FLAG_LABELS: [keyof Omit<SafetyFlags, 'allergens'>, string][] = [['sal', 'Contiene sal / mucho sodio'], ['azucar', 'Contiene azúcar'], ['miel', 'Es o contiene miel'], ['atragantamiento', 'Formato con riesgo de atragantamiento'], ['crudo', 'Se consume crudo (pescado, huevo, carne)']];

function unitsFor(ing: Ingredient): Unit[] {
  if (ing.defaultUnit === 'ml' || ing.defaultUnit === 'l') return ['ml', 'l'];
  if (ing.defaultUnit === 'un') return ing.gramsPerUnit ? ['un', 'g', 'kg'] : ['un'];
  return ing.gramsPerUnit ? ['g', 'kg', 'un'] : ['g', 'kg'];
}
type Creating = { name: string; category: IngredientCategory; unit: Unit; gpu: string; flags: SafetyFlags; kcal: string; p: string; hc: string; f: string };

export function Editor({ id, dup }: { id?: string; dup?: string }) {
  const { data, commit } = useApp();
  const [ingredients, setIngredients] = useState<Map<string, Ingredient>>(data.ingredients);
  const [newIngs, setNewIngs] = useState<Ingredient[]>([]);
  const [draft, setDraft] = useState<Recipe>(() => {
    if (dup && data.recipes.get(dup)) return duplicateRecipe(data.recipes.get(dup)!, data.recipes.keys());
    if (id && data.recipes.get(id)) return JSON.parse(JSON.stringify(data.recipes.get(id)!)) as Recipe;
    return emptyDraft();
  });
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<Creating | null>(null);
  const [utensils, setUtensils] = useState(draft.utensils.join(', '));
  const update = (p: Partial<Recipe>) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const setLine = (i: number, p: Partial<RecipeIngredient>) => update({ ingredients: draft.ingredients.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const setStep = (i: number, p: Partial<Recipe['steps'][number]>) => update({ steps: draft.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const full = { ...draft, utensils: utensils.split(',') };
  const issues = useMemo(() => validateRecipeDraft(full, ingredients), [draft, ingredients, utensils]);
  const preview = useMemo(() => (draft.ingredients.length ? buildFamilyVersions(draft, data.members, {}, ingredients, data.babyCtx ? { ...data.babyCtx, ingredients } : undefined) : null), [draft, ingredients]);
  const results = useMemo(() => {
    const n = normalize(search);
    return n.length < 2 ? [] : [...ingredients.values()].filter((i) => normalize(i.name).includes(n) || i.aliases.some((a) => normalize(a).includes(n))).slice(0, 8);
  }, [search, ingredients]);
  const isEdit = !!id && !dup;

  function addIngredient(ing: Ingredient) { update({ ingredients: [...draft.ingredients, newIngredientLine(ing)] }); setSearch(''); }
  function startCreate() {
    const name = search.trim();
    const guess = matchIngredient(name, [...ingredients.values()]);
    if (guess && normalize(guess.name) === normalize(name)) return addIngredient(guess);
    setCreating({ name, category: 'otro', unit: 'g', gpu: '', flags: flagsFromTags(inferTags(name)), kcal: '', p: '', hc: '', f: '' });
  }
  function confirmCreate() {
    if (!creating) return;
    const raw = [creating.kcal, creating.p, creating.hc, creating.f];
    const hasN = raw.every((x) => x.trim() !== '' && num(x) >= 0);
    try {
      const ing = buildCustomIngredient({
        name: creating.name, category: creating.category, defaultUnit: creating.unit, gramsPerUnit: creating.gpu ? num(creating.gpu) : undefined,
        per100g: hasN ? { kcal: num(raw[0]), proteinG: num(raw[1]), carbsG: num(raw[2]), fatG: num(raw[3]) } : undefined, nutritionBasis: 'crudo', flags: creating.flags,
      }, ingredients.keys());
      const m = new Map(ingredients); m.set(ing.id, ing); setIngredients(m);
      setNewIngs((x) => [...x, ing]);
      update({ ingredients: [...draft.ingredients, newIngredientLine(ing)] });
      setCreating(null); setSearch('');
    } catch (e) { sheet('Revisá el ingrediente', (e as Error).message, [{ text: 'OK', style: 'cancel' }]); }
  }
  async function save() {
    if (hasErrors(issues)) return;
    const taken = data.allRecipes.map((r) => r.id);
    const final = finalizeDraft(full, draft.id ? taken.filter((x) => x !== draft.id) : taken);
    await commit(async (repo) => {
      for (const ing of newIngs.filter((n) => final.ingredients.some((l) => l.ingredientId === n.id))) await repo.saveIngredient(ing, true);
      await repo.saveRecipe(final);
    });
    go(`receta/${final.id}`, {}, true);
  }
  function cancel() {
    if (!dirty) return back('recetas');
    sheet('¿Descartar cambios?', undefined, [{ text: 'Descartar', style: 'destructive', onPress: () => back('recetas') }, { text: 'Seguir editando', style: 'cancel' }]);
  }
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'aviso');

  return (
    <Screen>
      <Row between><button class="link" onClick={cancel}>Cancelar</button><b>{isEdit ? 'Editar receta' : dup ? 'Duplicar receta' : 'Nueva receta'}</b><span /></Row>
      {isEdit && draft.isDemo ? <Notice>Es una receta de demostración: al guardar pasa a ser tuya y no se borra con los datos demo.</Notice> : null}
      <div class="meal-row">
        <DishImage recipe={draft} size={80} />
        <div class="stack grow">
          <PhotoButton label="📷 Sacar foto" onPhoto={(d) => update({ imageUri: d })} />
          <PhotoButton label="Elegir de la galería" camera={false} onPhoto={(d) => update({ imageUri: d })} />
          {draft.imageUri ? <button class="link small" onClick={() => update({ imageUri: undefined })}>Quitar foto</button> : null}
        </div>
      </div>
      <Field label="Nombre" value={draft.name} onChange={(v) => update({ name: v })} placeholder="Ej.: Pollo al limón con verduras" />
      <Row between><Body>Tiempo total</Body><Stepper value={draft.totalMinutes} step={5} min={5} onChange={(v) => update({ totalMinutes: v })} suffix="min" /></Row>
      <Row between><Body>Rinde (porciones adultas)</Body><Stepper value={draft.servings} step={1} min={1} onChange={(v) => update({ servings: v })} /></Row>
      <Row wrap>{(['facil', 'media', 'dificil'] as const).map((d) => <Chip label={{ facil: 'Fácil', media: 'Media', dificil: 'Difícil' }[d]} active={draft.difficulty === d} onPress={() => update({ difficulty: d })} />)}</Row>
      <Body small muted>Momento y características</Body>
      <Row wrap>{RECIPE_TAGS.map((t) => <Chip label={t.label} active={draft.tags.includes(t.id)} onPress={() => update({ tags: draft.tags.includes(t.id) ? draft.tags.filter((x) => x !== t.id) : [...draft.tags, t.id] })} />)}</Row>

      <H2>Ingredientes</H2>
      <Body small muted>Cantidades para la receta completa ({draft.servings} porciones). Indicá si el peso es crudo o cocido.</Body>
      {draft.ingredients.map((l, i) => {
        const ing = ingredients.get(l.ingredientId);
        if (!ing) return null;
        return (
          <Card>
            <Row between><Body bold>{ing.name}{ing.id.startsWith('custom_') ? ' · propio' : ''}</Body><button class="link" onClick={() => update({ ingredients: draft.ingredients.filter((_, j) => j !== i) })}>✕</button></Row>
            <Row between wrap>
              <Row wrap>{unitsFor(ing).map((u) => <Chip label={u} active={l.unit === u} onPress={() => setLine(i, { unit: u })} />)}</Row>
              <Stepper value={l.qty} step={l.unit === 'un' ? 0.5 : l.unit === 'kg' || l.unit === 'l' ? 0.1 : 10} min={0} onChange={(v) => setLine(i, { qty: v })} />
            </Row>
            <Row wrap>
              <Chip label="Crudo" active={l.state === 'crudo'} onPress={() => setLine(i, { state: 'crudo' })} />
              <Chip label="Cocido" active={l.state === 'cocido'} onPress={() => setLine(i, { state: 'cocido' })} />
              <Chip label="Opcional" active={!!l.optional} onPress={() => setLine(i, { optional: !l.optional || undefined })} />
              <Chip label="Se sirve aparte" active={!!l.separable} onPress={() => setLine(i, { separable: !l.separable || undefined })} />
              <Chip tone="baby" label="Después de separar a Helena" active={!!l.addedAfterBabySplit} onPress={() => setLine(i, { addedAfterBabySplit: !l.addedAfterBabySplit || undefined })} />
            </Row>
            <Field placeholder="Nota (opcional)" value={l.note ?? ''} onChange={(v) => setLine(i, { note: v || undefined })} />
          </Card>
        );
      })}
      <Field placeholder="Buscar ingrediente para agregar…" value={search} onChange={setSearch} />
      {search.trim().length >= 2 ? (
        <Row wrap>
          {results.map((r) => <Chip label={`＋ ${r.name}`} onPress={() => addIngredient(r)} />)}
          <Chip tone="accent" label={`Crear «${search.trim()}»`} onPress={startCreate} />
        </Row>
      ) : null}
      {creating ? (
        <Card tone="accent">
          <Body bold>Nuevo ingrediente: {creating.name}</Body>
          <Row wrap>{CATEGORIES.map(([k, label]) => <Chip label={label} active={creating.category === k} onPress={() => setCreating({ ...creating, category: k })} />)}</Row>
          <Body small muted>Unidad en que lo comprás</Body>
          <Row wrap>{(['g', 'ml', 'un'] as Unit[]).map((u) => <Chip label={u === 'un' ? 'unidades' : u} active={creating.unit === u} onPress={() => setCreating({ ...creating, unit: u })} />)}</Row>
          {creating.unit !== 'ml' ? <Field label="Gramos por unidad (opcional)" inputMode="decimal" value={creating.gpu} onChange={(v) => setCreating({ ...creating, gpu: v })} /> : null}
          <Body small muted>Nutrición cada 100 g en crudo (opcional)</Body>
          <div class="grid4">{(['kcal', 'p', 'hc', 'f'] as const).map((k) => <Field placeholder={{ kcal: 'kcal', p: 'prot', hc: 'HC', f: 'grasa' }[k]} inputMode="decimal" value={creating[k]} onChange={(v) => setCreating({ ...creating, [k]: v })} />)}</div>
          <Notice tone="baby">Marcá lo que corresponda: se usa para proteger a Helena y respetar restricciones. Lo pre-marcamos según el nombre; revisalo.</Notice>
          {FLAG_LABELS.map(([k, label]) => <Toggle label={label} value={creating.flags[k]} onChange={(v) => setCreating({ ...creating, flags: { ...creating.flags, [k]: v } })} />)}
          <Body small muted>Alérgenos</Body>
          <Row wrap>{ALLERGENS.map((a) => <Chip tone="danger" label={ALLERGEN_LABEL[a]} active={creating.flags.allergens.includes(a)} onPress={() => setCreating({ ...creating, flags: { ...creating.flags, allergens: creating.flags.allergens.includes(a) ? creating.flags.allergens.filter((x) => x !== a) : [...creating.flags.allergens, a] } })} />)}</Row>
          <div class="grid2"><Button small kind="secondary" title="Cancelar" onPress={() => setCreating(null)} /><Button small title="Crear y agregar" onPress={confirmCreate} /></div>
        </Card>
      ) : null}

      <H2>Pasos</H2>
      {draft.steps.map((s, i) => (
        <Card tone={s.babySplit ? 'baby' : undefined}>
          <Row between><Body bold>Paso {i + 1}</Body>
            <Row gap={16}>
              <button class="link" onClick={() => update({ steps: renumberSteps(moveItem(draft.steps, i, i - 1)) })}>↑</button>
              <button class="link" onClick={() => update({ steps: renumberSteps(moveItem(draft.steps, i, i + 1)) })}>↓</button>
              <button class="link" onClick={() => update({ steps: renumberSteps(draft.steps.filter((_, j) => j !== i)) })}>✕</button>
            </Row>
          </Row>
          <Field multiline value={s.text} onChange={(v) => setStep(i, { text: v })} placeholder="Ej.: Cortá 250 g de calabaza en cubos de 2 cm." />
          <Field label="Temporizador (minutos, opcional)" inputMode="decimal" value={s.timerSec ? String(+(s.timerSec / 60).toFixed(1)) : ''} onChange={(v) => setStep(i, { timerSec: v.trim() ? Math.round(num(v) * 60) : undefined })} />
          <Toggle label="Acá se separa la porción de Helena" value={!!s.babySplit} onChange={(v) => setStep(i, { babySplit: v || undefined })} />
          <Field placeholder="Consejo (opcional)" value={s.tip ?? ''} onChange={(v) => setStep(i, { tip: v || undefined })} />
        </Card>
      ))}
      <Button small kind="secondary" title="＋ Agregar paso" onPress={() => update({ steps: [...draft.steps, { order: draft.steps.length + 1, text: '' }] })} />

      <H2>Helena</H2>
      <Body small muted>¿Cómo puede adaptarse para ella? Si no elegís ninguna textura, la app le buscará una alternativa aparte.</Body>
      <Row wrap>{TEXTURES.map((t) => <Chip tone="baby" label={TEXTURE_LABEL[t]} active={!!draft.babyTextures?.includes(t)} onPress={() => update({ babyTextures: draft.babyTextures?.includes(t) ? draft.babyTextures.filter((x) => x !== t) : [...(draft.babyTextures ?? []), t] })} />)}</Row>
      <H2>Más datos</H2>
      <Field label="Utensilios (separados por coma)" value={utensils} onChange={(v) => { setUtensils(v); setDirty(true); }} />
      <Field label="Cómo conservar las sobras" multiline value={draft.storage ?? ''} onChange={(v) => update({ storage: v })} />

      <H2>Vista previa</H2>
      {preview ? preview.versions.map((v) => (
        <Body small>{v.status === 'bebe'
          ? `👶 ${v.memberName}: ${v.baby?.verdict === 'bloqueado' ? 'necesita alternativa aparte' : v.baby?.verdict === 'requiere_confirmacion' ? 'puede compartir con alimentos nuevos a confirmar' : 'puede compartir adaptada'}`
          : `${v.memberName}: ${v.status === 'no_apta' ? '⚠️ no apta' : v.status === 'apta_con_cambios' ? 'con cambios' : 'apta'}${v.nutrition ? ` · ≈ ${v.nutrition.kcal} kcal, ${v.nutrition.proteinG} g prot por porción` : ''}${v.removed.length ? ` · sin ${v.removed.map((r) => r.name.toLowerCase()).join(', ')}` : ''}`}</Body>
      )) : <Body small muted>Agregá ingredientes para ver las versiones.</Body>}
      {errors.length ? <Notice tone="danger">{errors.map((e) => <div>• {e.message}</div>)}</Notice> : null}
      {warnings.length ? <Notice>{warnings.map((e) => <div>• {e.message}</div>)}</Notice> : null}
      <Button title={isEdit ? 'Guardar cambios' : 'Guardar receta'} disabled={hasErrors(issues)} onPress={save} />
    </Screen>
  );
}
