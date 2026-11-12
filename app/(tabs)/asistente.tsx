import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Chip, Row } from '../../src/ui/components';
import { useAppData } from '../../src/state/AppData';
import { reply } from '../../src/domain/assistant';
import type { AssistantAction, AssistantReply } from '../../src/domain/assistant';
import { applySubstitution } from '../../src/domain/substitutions';
import { aiAvailable, askOnline } from '../../src/services/ai';
import { radius, space, usePalette } from '../../src/ui/theme';

interface Msg { from: 'yo' | 'ia'; text: string; reply?: AssistantReply; done?: boolean }

const QUICK = ['¿Qué puedo cocinar hoy?', 'Tengo 20 minutos para cocinar', 'Mañana llevo almuerzo a la oficina', 'Quiero una merienda más proteica', '¿Helena puede comer algo de esto?', 'Quiero gastar menos esta semana'];

export default function Asistente() {
  const { data, todayISO, commit } = useAppData();
  const c = usePalette();
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'ia', text: 'Conozco tu plan, tu inventario y las restricciones de la familia. Funciono sin conexión para estas consultas. Nunca cambio nada sin que lo confirmes.' }]);
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);

  const ctx = { todayISO, members: data.members, recipes: data.recipeList, ingredients: data.ingredients, lots: data.lots, meals: data.meals, babyCtx: data.babyCtx };

  async function send(q: string) {
    if (!q.trim()) return;
    setText('');
    const r = reply(q, ctx);
    const next: Msg[] = [...msgs, { from: 'yo', text: q }];
    if (r.requiresOnline && aiAvailable()) {
      setMsgs([...next, { from: 'ia', text: 'Consultando la IA online…' }]);
      try {
        const a = await askOnline(q, ctx);
        setMsgs([...next, { from: 'ia', text: a.text }]);
      } catch (e) {
        setMsgs([...next, { from: 'ia', text: `${r.text}\n\n(No se pudo usar la IA online: ${String(e)})` }]);
      }
    } else {
      setMsgs([...next, { from: 'ia', text: r.text, reply: r }]);
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }

  async function run(a: AssistantAction, idx: number) {
    await commit(async (repo) => {
      if (a.type === 'agregar_inventario') {
        for (const it of a.items) if (it.ingredientId && it.qty && it.unit) await repo.addLot({ ingredientId: it.ingredientId, qty: it.qty, unit: it.unit, location: 'heladera', state: 'cerrado', purchasedAt: todayISO });
      } else if (a.type === 'sustituir') {
        const m = data.meals.find((x) => x.id === a.mealId);
        if (m) await repo.saveMeal(applySubstitution(m, a.fromId, a.toId));
      } else if (a.type === 'marcar_vianda') {
        const m = data.meals.find((x) => x.id === a.mealId);
        if (m) await repo.saveMeal({ ...m, forOffice: true });
      } else if (a.type === 'registrar_entrenamiento') {
        await repo.setTraining(a.date, a.trained);
      }
    });
    setMsgs((xs) => xs.map((m, i) => (i === idx ? { ...m, done: true } : m)));
  }

  const label = (a: AssistantAction) => a.type === 'agregar_inventario' ? 'Cargar al inventario' : a.type === 'sustituir' ? a.label : a.type === 'marcar_vianda' ? 'Marcar vianda' : a.type === 'registrar_entrenamiento' ? 'Registrar día sin entrenar' : 'Planificar';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {msgs.map((m, i) => (
          <View key={i} style={{ alignSelf: m.from === 'yo' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: m.from === 'yo' ? c.primarySoft : c.card, borderRadius: radius.md, padding: space.md, gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
            {m.reply?.suggestions.map((s) => <Button key={s.recipe.id} small kind="ghost" title={`${s.recipe.name} · ${s.recipe.totalMinutes} min`} onPress={() => router.push({ pathname: '/receta/[id]', params: { id: s.recipe.id } })} />)}
            {!m.done && m.reply?.actions.map((a, j) => <Button key={j} small title={label(a)} onPress={() => run(a, i)} />)}
            {m.done ? <Body small muted>✓ Hecho</Body> : null}
          </View>
        ))}
        <Row wrap>{QUICK.map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}</Row>
        <Body small muted>{aiAvailable() ? 'IA online activada para consultas libres (requiere conexión).' : 'Modo local. La IA online es opcional y se configura con un backend propio.'}</Body>
      </ScrollView>
      <Row style={{ padding: space.md, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={() => send(text)} placeholder="Escribí tu consulta… (podés dictar con el micrófono del teclado)" placeholderTextColor={c.muted} style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 10 }} returnKeyType="send" />
        <Button small title="Enviar" onPress={() => send(text)} />
      </Row>
    </KeyboardAvoidingView>
  );
}
