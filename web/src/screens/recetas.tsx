import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, DishImage, Field, Row, Screen, go } from '../ui.tsx';
import { RECIPE_TAGS } from '../../../src/domain/recipeEditor.ts';
import { normalize } from '../../../src/domain/textParser.ts';
import { evaluateRecipeForBaby } from '../../../src/domain/babySafety.ts';
import { recipeFitsMember } from '../../../src/domain/adaptations.ts';
import { inventoryCoverage } from '../../../src/domain/planner.ts';
import { DIFFICULTY_LABEL } from '../util.ts';

export function Recetas() {
  const { data } = useApp();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const me = data.members.find((m) => m.isPrimary);
  const list = useMemo(() => {
    const nq = normalize(q);
    return data.allRecipes
      .filter((r) => !!r.archived === archived)
      .filter((r) => !tag || r.tags.includes(tag))
      .filter((r) => !nq || normalize(r.name).includes(nq) || r.ingredients.some((i) => normalize(data.ingredients.get(i.ingredientId)?.name ?? '').includes(nq)))
      .map((r) => ({ r, coverage: inventoryCoverage(r, data.lots, data.ingredients).coverage }))
      .sort((a, b) => b.coverage - a.coverage || a.r.name.localeCompare(b.r.name));
  }, [data, q, tag, archived]);
  return (
    <Screen>
      <Button title="Nueva receta" icon="＋" onPress={() => go('editar')} />
      <Field placeholder="Buscar por nombre o ingrediente" value={q} onChange={setQ} type="search" />
      <Row wrap>
        {RECIPE_TAGS.map((t) => <Chip label={t.label} active={tag === t.id} onPress={() => setTag(tag === t.id ? null : t.id)} />)}
        <Chip label={archived ? 'Ver activas' : 'Ver archivadas'} tone="accent" onPress={() => setArchived(!archived)} />
      </Row>
      {list.length === 0 ? <Body muted>No hay recetas con esos filtros.</Body> : null}
      {list.map(({ r, coverage }) => {
        const baby = data.babyCtx ? evaluateRecipeForBaby(r, data.babyCtx).verdict : null;
        const fitsMe = me ? recipeFitsMember(r, me, data.ingredients) : true;
        return (
          <Card onPress={() => go(`receta/${r.id}`)} cls="meal-row">
            <DishImage recipe={r} size={56} />
            <div class="grow">
              <Body bold>{r.name}</Body>
              <Body small muted>{r.totalMinutes} min · {DIFFICULTY_LABEL[r.difficulty]} · {Math.round(coverage * 100)} % en casa{r.isDemo ? ' · demo' : ''}</Body>
              <Body small muted>{fitsMe ? '' : '⚠️ no apta para vos · '}{baby === null ? '' : baby === 'bloqueado' ? 'Helena: alternativa aparte' : baby === 'requiere_confirmacion' ? 'Helena: con alimentos nuevos' : 'Helena: puede compartir'}</Body>
            </div>
          </Card>
        );
      })}
    </Screen>
  );
}
