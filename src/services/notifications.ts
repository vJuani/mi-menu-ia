/**
 * Notificaciones locales (expo-notifications). Se sincronizan con el cálculo
 * determinístico de src/domain/reminders.ts: cada cambio de plan, inventario o
 * ajustes llama a syncNotifications(), que cancela lo obsoleto y programa lo nuevo.
 * Con la app cerrada iOS solo dispara lo ya programado: no recalcula nada.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Repo } from '../data/repo';
import { buildReminders, reconcile, reminderHash } from '../domain/reminders';
import type { ReminderInput } from '../domain/reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** iOS permite como máximo 64 notificaciones locales pendientes por app. */
const IOS_LIMIT = 60;

export async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return req.granted;
}

export async function syncNotifications(repo: Repo, input: ReminderInput): Promise<{ scheduled: number; cancelled: number }> {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return { scheduled: 0, cancelled: 0 };

  const desired = buildReminders(input).slice(0, IOS_LIMIT);
  const known = await repo.scheduled();

  // Limpia programaciones que el sistema ya no tiene (p. ej. reinstalación).
  const osPending = new Set((await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier));
  const alive = known.filter((k) => osPending.has(k.osId));

  const diff = reconcile(desired, alive);
  for (const c of diff.toCancel) await Notifications.cancelScheduledNotificationAsync(c.osId).catch(() => undefined);

  const created: { key: string; osId: string; hash: string; fireAt: string }[] = [];
  for (const r of diff.toSchedule) {
    const osId = await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { key: r.key, kind: r.kind, refId: r.refId ?? null } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.fireAt) },
    });
    created.push({ key: r.key, osId, hash: reminderHash(r), fireAt: r.fireAt });
  }
  const unchanged = diff.unchanged.map((u) => ({ ...u, fireAt: desired.find((d) => d.key === u.key)!.fireAt }));
  await repo.replaceScheduled([...unchanged, ...created]);
  if (Platform.OS === 'ios') {
    // Elimina cualquier pendiente huérfano que no esté en nuestro registro → nunca hay duplicados.
    const ours = new Set([...unchanged, ...created].map((x) => x.osId));
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (!ours.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  return { scheduled: created.length, cancelled: diff.toCancel.length };
}
