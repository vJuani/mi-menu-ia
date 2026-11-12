function esc(s) {
    return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
/** "2026-11-13T21:00:00" (hora local) → "20261113T210000" (hora flotante = hora del teléfono). */
function icsLocal(iso) {
    return iso.replace(/[-:]/g, '').slice(0, 15);
}
function fold(line) {
    const out = [];
    let s = line;
    while (s.length > 74) {
        out.push(s.slice(0, 74));
        s = ' ' + s.slice(74);
    }
    out.push(s);
    return out.join('\r\n');
}
export function remindersToIcs(reminders, nowISO, appName = 'Mi Menú IA') {
    const stamp = nowISO.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${appName}//ES`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(appName)}`];
    for (const r of reminders) {
        const start = icsLocal(r.fireAt);
        lines.push('BEGIN:VEVENT', `UID:${r.key.replace(/[^a-zA-Z0-9:_-]/g, '_')}@mi-menu-ia`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT10M', `SUMMARY:${esc(r.title)}`, `DESCRIPTION:${esc(r.body)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(r.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}
