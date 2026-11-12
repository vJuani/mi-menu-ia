import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useState } from 'preact/hooks';
import { useApp } from '../state.js';
import { Body, Button, Card, Chip, Field, H2, Notice, Row, Screen, Toggle, alertMsg, sheet, shareFile } from '../ui.js';
import { buildReminders } from '../../../src/domain/reminders.js';
import { exportBackup, importBackup } from '../../../src/data/backup.js';
import { baseUnitFor } from '../../../src/domain/shopping.js';
import { remindersToIcs } from '../calendar.js';
import { SLOT_LABEL, num } from '../util.js';
import { APP_NAME } from '../../../src/config/app.js';
const KIND_LABEL = { faltantes: 'Faltantes para mañana', descongelar: 'Sacar del freezer', vianda: 'Preparar vianda', empezar_cocina: 'Empezar a cocinar', stock_bajo: 'Stock bajo', peso: 'Registrar peso' };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function Ajustes() {
    const { data, repo, commit } = useApp();
    const [s, setS] = useState(data.reminderSettings);
    const set = (p) => setS((x) => ({ ...x, ...p }));
    const stocked = [...new Set(data.lots.map((l) => l.ingredientId))].map((id) => data.ingredients.get(id)).filter(Boolean);
    async function save() {
        const times = [...Object.values(s.mealTimes), s.reviewTomorrowAt, s.officePrepAt, s.weighInAt];
        if (!times.every((t) => HHMM.test(t)))
            return alertMsg('Revisá los horarios', 'Usá el formato HH:MM (24 h).');
        await commit((r) => r.setSetting('reminders', s));
        alertMsg('Guardado');
    }
    async function exportCalendar() {
        const rs = buildReminders({ now: new Date(), meals: data.meals, recipes: data.recipes, members: data.members, ingredients: data.ingredients, lots: data.lots, settings: s, lastWeighInISO: data.lastWeighIn });
        if (!rs.length)
            return alertMsg('No hay recordatorios', 'Planificá comidas para los próximos días.');
        await shareFile('mi-menu-recordatorios.ics', 'text/calendar', remindersToIcs(rs, new Date().toISOString(), APP_NAME));
    }
    async function doExport() {
        const b = await exportBackup(repo.db);
        await shareFile(`mimenu-respaldo-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(b));
    }
    function doImport(file) {
        sheet('Reemplazar todos los datos', 'El respaldo reemplaza todo lo que hay en la app. ¿Seguro?', [
            { text: 'Importar', style: 'destructive', onPress: async () => {
                    try {
                        const txt = await file.text();
                        await commit(async (r) => { await importBackup(r.db, JSON.parse(txt)); });
                        alertMsg('Listo', 'Datos restaurados.');
                    }
                    catch (e) {
                        alertMsg('No se pudo importar', String(e));
                    }
                } },
        ]);
    }
    return (_jsxs(Screen, { children: [_jsx(H2, { children: "Horarios de comidas" }), ['desayuno', 'almuerzo', 'merienda', 'cena', 'colacion'].map((slot) => (_jsxs(Row, { between: true, children: [_jsx(Body, { children: SLOT_LABEL[slot] }), _jsx("div", { class: "w110", children: _jsx(Field, { type: "time", value: s.mealTimes[slot], onChange: (v) => set({ mealTimes: { ...s.mealTimes, [slot]: v } }) }) })] }))), _jsx(H2, { children: "Recordatorios" }), _jsxs(Notice, { children: ["En la versi\u00F3n web, iPhone no permite avisos con la app cerrada. Los recordatorios de las pr\u00F3ximas 24 h aparecen en \u201CHoy\u201D, y pod\u00E9s pasarlos a tu ", _jsx("b", { children: "Calendario" }), " para recibir las alarmas."] }), _jsx(Button, { title: "\uD83D\uDCC6 Agregar recordatorios de la semana al Calendario", onPress: exportCalendar }), _jsx(Body, { small: true, muted: true, children: "Si cambi\u00E1s el plan, volv\u00E9 a agregarlos. Si se duplican, borralos desde Calendario." }), Object.keys(KIND_LABEL).map((k) => _jsx(Toggle, { label: KIND_LABEL[k], value: s.kinds[k], onChange: (v) => set({ kinds: { ...s.kinds, [k]: v } }) })), _jsxs("div", { class: "grid2", children: [_jsx(Field, { label: "Revisar ma\u00F1ana a las", type: "time", value: s.reviewTomorrowAt, onChange: (v) => set({ reviewTomorrowAt: v }) }), _jsx(Field, { label: "Vianda (noche anterior)", type: "time", value: s.officePrepAt, onChange: (v) => set({ officePrepAt: v }) }), _jsx(Field, { label: "Aviso antes de cocinar (min)", inputMode: "numeric", value: String(s.cookLeadMinutes), onChange: (v) => set({ cookLeadMinutes: num(v) || 0 }) }), _jsx(Field, { label: "Descongelar (horas antes)", inputMode: "numeric", value: String(s.thawHoursBefore), onChange: (v) => set({ thawHoursBefore: num(v) || 0 }) })] }), _jsx(Body, { small: true, muted: true, children: "D\u00EDas para registrar el peso" }), _jsx(Row, { wrap: true, children: DAYS.map((d, i) => _jsx(Chip, { label: d, active: s.weighInWeekdays.includes(i), onPress: () => set({ weighInWeekdays: s.weighInWeekdays.includes(i) ? s.weighInWeekdays.filter((x) => x !== i) : [...s.weighInWeekdays, i] }) })) }), _jsx(Field, { label: "Hora del pesaje", type: "time", value: s.weighInAt, onChange: (v) => set({ weighInAt: v }) }), stocked.length ? _jsx(Body, { small: true, muted: true, children: "Avisar stock bajo cuando quede (vac\u00EDo = no avisar)" }) : null, stocked.map((ing) => (_jsxs(Row, { between: true, children: [_jsx(Body, { children: ing.name }), _jsx("div", { class: "w110", children: _jsx(Field, { placeholder: baseUnitFor(ing), inputMode: "decimal", value: s.lowStock[ing.id] !== undefined ? String(s.lowStock[ing.id]) : '', onChange: (v) => {
                                const ls = { ...s.lowStock };
                                if (v.trim() === '')
                                    delete ls[ing.id];
                                else
                                    ls[ing.id] = num(v);
                                set({ lowStock: ls });
                            } }) })] }))), _jsx(Button, { title: "Guardar ajustes", onPress: save }), _jsx(H2, { children: "Datos" }), _jsxs(Card, { children: [_jsx(Notice, { children: "Los datos viven en este iPhone. Hac\u00E9 un respaldo de vez en cuando (por ejemplo a iCloud Drive): si borr\u00E1s la app del inicio o los datos de Safari, se pierden." }), _jsx(Button, { kind: "secondary", title: "Exportar respaldo", onPress: doExport }), _jsxs("label", { class: "btn btn-secondary", children: ["Importar respaldo", _jsx("input", { type: "file", accept: "application/json,.json", hidden: true, onChange: (e) => { const f = e.target.files?.[0]; if (f)
                                    doImport(f); e.target.value = ''; } })] }), _jsx(Button, { kind: "danger", title: "Borrar datos de demostraci\u00F3n", onPress: () => sheet('Borrar demo', 'Se eliminan recetas, inventario y plan de ejemplo. Tus perfiles y lo que cargaste se conservan.', [{ text: 'Borrar', style: 'destructive', onPress: () => commit((r) => r.clearDemoData()) }]) })] }), _jsx(H2, { children: "Acerca de" }), _jsxs(Body, { small: true, muted: true, children: [APP_NAME, " \u00B7 versi\u00F3n web instalable \u00B7 funciona sin conexi\u00F3n una vez abierta."] }), _jsx(Body, { small: true, muted: true, children: "Valores nutricionales estimados. No reemplaza a profesionales de la salud." })] }));
}
