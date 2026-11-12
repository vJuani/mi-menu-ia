import { useState } from 'preact/hooks';
import { useApp } from '../state.tsx';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, Toggle, alertMsg, sheet, shareFile } from '../ui.tsx';
import type { ReminderSettings } from '../../../src/domain/reminders.ts';
import { buildReminders } from '../../../src/domain/reminders.ts';
import { exportBackup, importBackup } from '../../../src/data/backup.ts';
import { baseUnitFor } from '../../../src/domain/shopping.ts';
import type { MealSlot, Reminder } from '../../../src/domain/types.ts';
import { remindersToIcs } from '../calendar.ts';
import { SLOT_LABEL, num } from '../util.ts';
import { APP_NAME } from '../../../src/config/app.ts';
import type { LeftoverConfig } from '../../../src/domain/leftovers.ts';

const KIND_LABEL: Record<Reminder['kind'], string> = { faltantes: 'Faltantes para mañana', descongelar: 'Sacar del freezer', vianda: 'Preparar vianda', empezar_cocina: 'Empezar a cocinar', stock_bajo: 'Stock bajo', peso: 'Registrar peso' };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function Ajustes() {
  const { data, repo, commit } = useApp();
  const [s, setS] = useState<ReminderSettings>(data.reminderSettings);
  const set = (p: Partial<ReminderSettings>) => setS((x) => ({ ...x, ...p }));
  const [lo, setLo] = useState<LeftoverConfig>(data.leftoverCfg);
  const adults = data.members.filter((m) => m.kind === 'adulto');
  async function saveLeftovers(next: LeftoverConfig) {
    setLo(next);
    await commit((r) => r.setSetting('plan.leftovers', next));
  }
  const stocked = [...new Set(data.lots.map((l) => l.ingredientId))].map((id) => data.ingredients.get(id)!).filter(Boolean);

  async function save() {
    const times = [...Object.values(s.mealTimes), s.reviewTomorrowAt, s.officePrepAt, s.weighInAt];
    if (!times.every((t) => HHMM.test(t))) return alertMsg('Revisá los horarios', 'Usá el formato HH:MM (24 h).');
    await commit((r) => r.setSetting('reminders', s));
    alertMsg('Guardado');
  }
  async function exportCalendar() {
    const rs = buildReminders({ now: new Date(), meals: data.meals, recipes: data.recipes, members: data.members, ingredients: data.ingredients, lots: data.lots, settings: s, lastWeighInISO: data.lastWeighIn });
    if (!rs.length) return alertMsg('No hay recordatorios', 'Planificá comidas para los próximos días.');
    await shareFile('mi-menu-recordatorios.ics', 'text/calendar', remindersToIcs(rs, new Date().toISOString(), APP_NAME));
  }
  async function doExport() {
    const b = await exportBackup(repo.db);
    await shareFile(`mimenu-respaldo-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(b));
  }
  function doImport(file: File) {
    sheet('Reemplazar todos los datos', 'El respaldo reemplaza todo lo que hay en la app. ¿Seguro?', [
      { text: 'Importar', style: 'destructive', onPress: async () => {
        try { const txt = await file.text(); await commit(async (r) => { await importBackup(r.db, JSON.parse(txt)); }); alertMsg('Listo', 'Datos restaurados.'); }
        catch (e) { alertMsg('No se pudo importar', String(e)); }
      } },
    ]);
  }

  return (
    <Screen>
      <H2>Horarios de comidas</H2>
      {(['desayuno', 'almuerzo', 'merienda', 'cena', 'colacion'] as MealSlot[]).map((slot) => (
        <Row between><Body>{SLOT_LABEL[slot]}</Body><div class="w110"><Field type="time" value={s.mealTimes[slot]} onChange={(v) => set({ mealTimes: { ...s.mealTimes, [slot]: v } })} /></div></Row>
      ))}

      <H2>Almuerzo = cena del día anterior</H2>
      <Toggle label="Cocinar el doble a la noche y almorzar las sobras" hint="La cena suma una porción por persona y el almuerzo del día siguiente queda vinculado: no se cocina ni se compra aparte." value={lo.enabled} onChange={(v) => saveLeftovers({ ...lo, enabled: v })} />
      {lo.enabled ? (
        <>
          <Body small muted>¿Quiénes almuerzan las sobras?</Body>
          <Row wrap>{adults.map((m) => <Chip label={m.shortName ?? m.name} active={lo.memberIds.includes(m.id)} onPress={() => saveLeftovers({ ...lo, memberIds: lo.memberIds.includes(m.id) ? lo.memberIds.filter((x) => x !== m.id) : [...lo.memberIds, m.id] })} />)}</Row>
          <Body small muted>Días en que almorzás sobras</Body>
          <Row wrap>{DAYS.map((d, i) => <Chip label={d} active={lo.weekdays.includes(i)} onPress={() => saveLeftovers({ ...lo, weekdays: lo.weekdays.includes(i) ? lo.weekdays.filter((x) => x !== i) : [...lo.weekdays, i] })} />)}</Row>
          <Toggle label="Llevarlo a la oficina (lunes a viernes)" value={lo.forOffice} onChange={(v) => saveLeftovers({ ...lo, forOffice: v })} />
        </>
      ) : null}

      <H2>Recordatorios</H2>
      <Notice>En la versión web, iPhone no permite avisos con la app cerrada. Los recordatorios de las próximas 24 h aparecen en “Hoy”, y podés pasarlos a tu <b>Calendario</b> para recibir las alarmas.</Notice>
      <Button title="📆 Agregar recordatorios de la semana al Calendario" onPress={exportCalendar} />
      <Body small muted>Si cambiás el plan, volvé a agregarlos. Si se duplican, borralos desde Calendario.</Body>
      {(Object.keys(KIND_LABEL) as Reminder['kind'][]).map((k) => <Toggle label={KIND_LABEL[k]} value={s.kinds[k]} onChange={(v) => set({ kinds: { ...s.kinds, [k]: v } })} />)}
      <div class="grid2">
        <Field label="Revisar mañana a las" type="time" value={s.reviewTomorrowAt} onChange={(v) => set({ reviewTomorrowAt: v })} />
        <Field label="Vianda (noche anterior)" type="time" value={s.officePrepAt} onChange={(v) => set({ officePrepAt: v })} />
        <Field label="Aviso antes de cocinar (min)" inputMode="numeric" value={String(s.cookLeadMinutes)} onChange={(v) => set({ cookLeadMinutes: num(v) || 0 })} />
        <Field label="Descongelar (horas antes)" inputMode="numeric" value={String(s.thawHoursBefore)} onChange={(v) => set({ thawHoursBefore: num(v) || 0 })} />
      </div>
      <Body small muted>Días para registrar el peso</Body>
      <Row wrap>{DAYS.map((d, i) => <Chip label={d} active={s.weighInWeekdays.includes(i)} onPress={() => set({ weighInWeekdays: s.weighInWeekdays.includes(i) ? s.weighInWeekdays.filter((x) => x !== i) : [...s.weighInWeekdays, i] })} />)}</Row>
      <Field label="Hora del pesaje" type="time" value={s.weighInAt} onChange={(v) => set({ weighInAt: v })} />
      {stocked.length ? <Body small muted>Avisar stock bajo cuando quede (vacío = no avisar)</Body> : null}
      {stocked.map((ing) => (
        <Row between><Body>{ing.name}</Body><div class="w110"><Field placeholder={baseUnitFor(ing)} inputMode="decimal" value={s.lowStock[ing.id] !== undefined ? String(s.lowStock[ing.id]) : ''} onChange={(v) => {
          const ls = { ...s.lowStock }; if (v.trim() === '') delete ls[ing.id]; else ls[ing.id] = num(v); set({ lowStock: ls });
        }} /></div></Row>
      ))}
      <Button title="Guardar ajustes" onPress={save} />

      <H2>Datos</H2>
      <Card>
        <Notice>Los datos viven en este iPhone. Hacé un respaldo de vez en cuando (por ejemplo a iCloud Drive): si borrás la app del inicio o los datos de Safari, se pierden.</Notice>
        <Button kind="secondary" title="Exportar respaldo" onPress={doExport} />
        <label class="btn btn-secondary">Importar respaldo<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) doImport(f); (e.target as HTMLInputElement).value = ''; }} /></label>
        <Button kind="danger" title="Borrar datos de demostración" onPress={() => sheet('Borrar demo', 'Se eliminan recetas, inventario y plan de ejemplo. Tus perfiles y lo que cargaste se conservan.', [{ text: 'Borrar', style: 'destructive', onPress: () => commit((r) => r.clearDemoData()) }])} />
      </Card>
      <H2>Acerca de</H2>
      <Body small muted>{APP_NAME} · versión web instalable · funciona sin conexión una vez abierta.</Body>
      <Body small muted>Valores nutricionales estimados. No reemplaza a profesionales de la salud.</Body>
    </Screen>
  );
}
