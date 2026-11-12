import React, { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen } from '../src/ui/components';
import { useAppData } from '../src/state/AppData';
import type { ReminderSettings } from '../src/domain/reminders';
import { exportBackup, importBackup } from '../src/data/backup';
import { ensurePermission } from '../src/services/notifications';
import { aiAvailable } from '../src/services/ai';
import { APP_NAME } from '../src/config/app';
import { SLOT_LABEL } from '../src/ui/labels';
import type { MealSlot, Reminder } from '../src/domain/types';
import { baseUnitFor } from '../src/domain/shopping';

const KIND_LABEL: Record<Reminder['kind'], string> = {
  faltantes: 'Faltantes para mañana', descongelar: 'Sacar del freezer', vianda: 'Preparar vianda',
  empezar_cocina: 'Empezar a cocinar', stock_bajo: 'Stock bajo', peso: 'Registrar peso',
};
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function Ajustes() {
  const { data, repo, commit } = useAppData();
  const [s, setS] = useState<ReminderSettings>(data.reminderSettings);
  const set = (patch: Partial<ReminderSettings>) => setS((x) => ({ ...x, ...patch }));
  const stocked = [...new Set(data.lots.map((l) => l.ingredientId))].map((id) => data.ingredients.get(id)!).filter(Boolean);

  async function save() {
    const times = [...Object.values(s.mealTimes), s.reviewTomorrowAt, s.officePrepAt, s.weighInAt];
    if (!times.every((t) => HHMM.test(t))) return Alert.alert('Revisá los horarios', 'Usá el formato HH:MM (24 h).');
    await ensurePermission();
    await commit((r) => r.setSetting('reminders', s));
    Alert.alert('Guardado', 'Los recordatorios se reprogramaron.');
  }

  async function doExport() {
    const b = await exportBackup(repo.db);
    const f = new File(Paths.document, `mimenu-respaldo-${new Date().toISOString().slice(0, 10)}.json`);
    if (f.exists) f.delete();
    f.create();
    f.write(JSON.stringify(b));
    await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Guardar respaldo' });
  }

  async function doImport() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    Alert.alert('Reemplazar todos los datos', 'El respaldo reemplaza todo lo que hay en la app. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Importar', style: 'destructive', onPress: async () => {
        try {
          const txt = await new File(res.assets[0].uri).text();
          await commit(async (r) => { await importBackup(r.db, JSON.parse(txt)); });
          Alert.alert('Listo', 'Datos restaurados.');
        } catch (e) { Alert.alert('No se pudo importar', String(e)); }
      } },
    ]);
  }

  return (
    <Screen>
      <H2>Horarios de comidas</H2>
      {(['desayuno', 'almuerzo', 'merienda', 'cena', 'colacion'] as MealSlot[]).map((slot) => (
        <Row key={slot} style={{ justifyContent: 'space-between' }}>
          <Body>{SLOT_LABEL[slot]}</Body>
          <View style={{ width: 100 }}><Field value={s.mealTimes[slot]} onChangeText={(v) => set({ mealTimes: { ...s.mealTimes, [slot]: v } })} keyboardType="numbers-and-punctuation" /></View>
        </Row>
      ))}

      <H2>Notificaciones</H2>
      <Row style={{ justifyContent: 'space-between' }}><Body>Activadas</Body><Switch value={s.enabled} onValueChange={(v) => set({ enabled: v })} /></Row>
      {(Object.keys(KIND_LABEL) as Reminder['kind'][]).map((k) => (
        <Row key={k} style={{ justifyContent: 'space-between' }}><Body>{KIND_LABEL[k]}</Body><Switch value={s.kinds[k]} onValueChange={(v) => set({ kinds: { ...s.kinds, [k]: v } })} /></Row>
      ))}
      <Row gap={8}>
        <View style={{ flex: 1 }}><Field label="Revisar mañana a las" value={s.reviewTomorrowAt} onChangeText={(v) => set({ reviewTomorrowAt: v })} /></View>
        <View style={{ flex: 1 }}><Field label="Vianda (noche anterior)" value={s.officePrepAt} onChangeText={(v) => set({ officePrepAt: v })} /></View>
      </Row>
      <Row gap={8}>
        <View style={{ flex: 1 }}><Field label="Aviso antes de cocinar (min)" keyboardType="number-pad" value={String(s.cookLeadMinutes)} onChangeText={(v) => set({ cookLeadMinutes: Number(v) || 0 })} /></View>
        <View style={{ flex: 1 }}><Field label="Descongelar (horas antes)" keyboardType="number-pad" value={String(s.thawHoursBefore)} onChangeText={(v) => set({ thawHoursBefore: Number(v) || 0 })} /></View>
      </Row>
      <Body small muted>Días para registrar el peso</Body>
      <Row wrap>{DAYS.map((d, i) => <Chip key={d} label={d} active={s.weighInWeekdays.includes(i)} onPress={() => set({ weighInWeekdays: s.weighInWeekdays.includes(i) ? s.weighInWeekdays.filter((x) => x !== i) : [...s.weighInWeekdays, i] })} />)}</Row>
      <Field label="Hora del pesaje" value={s.weighInAt} onChangeText={(v) => set({ weighInAt: v })} />
      {stocked.length ? <Body small muted>Avisar stock bajo cuando quede (vacío = no avisar)</Body> : null}
      {stocked.map((ing) => (
        <Row key={ing.id} style={{ justifyContent: 'space-between' }}>
          <Body>{ing.name}</Body>
          <View style={{ width: 110 }}><Field placeholder={baseUnitFor(ing)} keyboardType="decimal-pad" value={s.lowStock[ing.id] !== undefined ? String(s.lowStock[ing.id]) : ''} onChangeText={(v) => {
            const ls = { ...s.lowStock };
            if (v.trim() === '') delete ls[ing.id]; else ls[ing.id] = Number(v.replace(',', '.'));
            set({ lowStock: ls });
          }} /></View>
        </Row>
      ))}
      <Notice>iOS solo dispara avisos ya programados. La app los recalcula cada vez que la abrís o cambiás el plan o el inventario; con la app cerrada no se recalculan.</Notice>
      <Button title="Guardar ajustes" onPress={save} />

      <H2>Datos</H2>
      <Card>
        <Button kind="secondary" title="Exportar respaldo (JSON)" onPress={doExport} />
        <Button kind="secondary" title="Importar respaldo" onPress={doImport} />
        <Button kind="danger" title="Borrar datos de demostración" onPress={() => Alert.alert('Borrar demo', 'Se eliminan recetas, inventario y plan de ejemplo. Tus perfiles y lo que cargaste se conservan.', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => commit((r) => r.clearDemoData()) },
        ])} />
      </Card>

      <H2>Acerca de</H2>
      <Body small muted>{APP_NAME} · uso personal · funciona sin conexión.</Body>
      <Body small muted>IA online: {aiAvailable() ? 'configurada (requiere internet)' : 'desactivada'}.</Body>
      <Body small muted>Valores nutricionales estimados. No reemplaza a profesionales de la salud.</Body>
    </Screen>
  );
}
