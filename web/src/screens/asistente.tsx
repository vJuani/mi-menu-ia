import { useRef, useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Chip, Row, go } from '../ui.tsx';
import { reply } from '../../../src/domain/assistant.ts';
import type { AssistantAction, AssistantReply } from '../../../src/domain/assistant.ts';
import { applySubstitution } from '../../../src/domain/substitutions.ts';

interface Msg { from: 'yo' | 'ia'; text: string; reply?: AssistantReply; done?: boolean }
const QUICK = ['¿Qué puedo cocinar hoy?', 'Tengo 20 minutos para cocinar', 'Mañana llevo almuerzo a la oficina', 'Quiero una merienda más proteica', '¿Helena puede comer algo de esto?', 'Quiero gastar menos esta semana'];

export function Asistente() {
  const { data, todayISO, commit } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'ia', text: 'Conozco tu plan, tu inventario y las restricciones de la familia. Funciono sin conexión. Nunca cambio nada sin que lo confirmes.' }]);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const ctx = { todayISO, members: data.members, recipes: data.recipeList, ingredients: data.ingredients, lots: data.lots, meals: data.meals, babyCtx: data.babyCtx };

  function send(q: string) {
    if (!q.trim()) return;
    setText('');
    const r = reply(q, ctx);
    setMsgs((m) => [...m, { from: 'yo', text: q }, { from: 'ia', text: r.text, reply: r }]);
    setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }
  async function run(a: AssistantAction, idx: number) {
    await commit(async (repo) => {
      if (a.type === 'agregar_inventario') {
        for (const it of a.items) if (it.ingredientId && it.qty && it.unit) await repo.addLot({ ingredientId: it.ingredientId, qty: it.qty, unit: it.unit, location: 'heladera', state: 'cerrado', purchasedAt: todayISO });
      } else if (a.type === 'sustituir') {
        const m = data.meals.find((x) => x.id === a.mealId); if (m) await repo.saveMeal(applySubstitution(m, a.fromId, a.toId));
      } else if (a.type === 'marcar_vianda') {
        const m = data.meals.find((x) => x.id === a.mealId); if (m) await repo.saveMeal({ ...m, forOffice: true });
      } else if (a.type === 'registrar_entrenamiento') {
        await repo.setTraining(a.date, a.trained);
      }
    });
    setMsgs((xs) => xs.map((m, i) => (i === idx ? { ...m, done: true } : m)));
  }
  const label = (a: AssistantAction) => a.type === 'agregar_inventario' ? 'Cargar al inventario' : a.type === 'sustituir' ? a.label : a.type === 'marcar_vianda' ? 'Marcar vianda' : a.type === 'registrar_entrenamiento' ? 'Registrar día sin entrenar' : 'Planificar';

  return (
    <>
      <main class="screen chat">
        {msgs.map((m, i) => (
          <div class={`bubble ${m.from}`}>
            <p class="pre">{m.text}</p>
            {m.reply?.suggestions.map((s) => <Button small kind="ghost" title={`${s.recipe.name} · ${s.recipe.totalMinutes} min`} onPress={() => go(`receta/${s.recipe.id}`)} />)}
            {!m.done && m.reply?.actions.map((a) => <Button small title={label(a)} onPress={() => run(a, i)} />)}
            {m.done ? <Body small muted>✓ Hecho</Body> : null}
          </div>
        ))}
        <Row wrap>{QUICK.map((q) => <Chip label={q} onPress={() => send(q)} />)}</Row>
        <div ref={end} />
      </main>
      <form class="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder="Escribí tu consulta… (podés dictar con el micrófono del teclado)" enterKeyHint="send" />
        <button class="btn btn-primary btn-small" type="submit">Enviar</button>
      </form>
    </>
  );
}
