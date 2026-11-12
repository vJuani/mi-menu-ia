import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, DishImage, Field, Row, Screen } from '../src/ui/components';
import { useAppData } from '../src/state/AppData';
import { RECIPE_TAGS } from '../src/domain/recipeEditor';
import { normalize } from '../src/domain/textParser';
import { evaluateRecipeForBaby } from '../src/domain/babySafety';
import { recipeFitsMember } from '../src/domain/adaptations';
import { inventoryCoverage } from '../src/domain/planner';
import { DIFFICULTY_LABEL } from '../src/ui/labels';
import { space } from '../src/ui/theme';

export default function Recetario() {
  const { data } = useAppData();
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
      <Button title="Nueva receta" icon="＋" onPress={() => router.push('/receta/editar')} />
      <Field placeholder="Buscar por nombre o ingrediente" value={q} onChangeText={setQ} clearButtonMode="while-editing" />
      <Row wrap>
        {RECIPE_TAGS.map((t) => <Chip key={t.id} label={t.label} active={tag === t.id} onPress={() => setTag(tag === t.id ? null : t.id)} />)}
        <Chip label={archived ? 'Ver activas' : 'Ver archivadas'} tone="accent" onPress={() => setArchived(!archived)} />
      </Row>
      {list.length === 0 ? <Body muted>No hay recetas con esos filtros.</Body> : null}
      {list.map(({ r, coverage }) => {
        const baby = data.babyCtx ? evaluateRecipeForBaby(r, data.babyCtx).verdict : null;
        const fitsMe = me ? recipeFitsMember(r, me, data.ingredients) : true;
        return (
          <Card key={r.id} onPress={() => router.push({ pathname: '/receta/[id]', params: { id: r.id } })}>
            <Row gap={space.md}>
              <DishImage recipe={r} size={56} />
              <View style={{ flex: 1 }}>
                <Body bold>{r.name}</Body>
                <Body small muted>{r.totalMinutes} min · {DIFFICULTY_LABEL[r.difficulty]} · {Math.round(coverage * 100)} % en casa{r.isDemo ? ' · demo' : ''}</Body>
                <Body small muted>
                  {fitsMe ? '' : '⚠️ no apta para vos · '}
                  {baby === null ? '' : baby === 'bloqueado' ? 'Helena: alternativa aparte' : baby === 'requiere_confirmacion' ? 'Helena: con alimentos nuevos' : 'Helena: puede compartir'}
                </Body>
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
