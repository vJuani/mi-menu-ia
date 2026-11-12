import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { dishEmojiFor } from './util.ts';

// ---------- Router (hash) ----------
export interface Route { path: string[]; params: Record<string, string>; }
export function parseHash(h = location.hash): Route {
  const raw = h.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  const params: Record<string, string> = {};
  new URLSearchParams(q).forEach((v, k) => { params[k] = v; });
  return { path: p ? p.split('/').map(decodeURIComponent) : ['hoy'], params };
}
export function go(path: string, params: Record<string, string | undefined> = {}, replace = false): void {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString();
  const h = `#/${path}${q ? `?${q}` : ''}`;
  if (replace) location.replace(h); else location.hash = h;
}
export function back(fallback = 'hoy'): void {
  if (history.length > 1) history.back(); else go(fallback, {}, true);
}
export function useRoute(): Route {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const f = () => { setR(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

// ---------- Hoja de opciones (reemplaza Alert con varias opciones) ----------
export interface SheetOption { text: string; onPress?: () => void | Promise<void>; style?: 'cancel' | 'destructive' | 'default'; }
type SheetState = { title: string; message?: string; options: SheetOption[] } | null;
let setSheetGlobal: ((s: SheetState) => void) | null = null;
export function sheet(title: string, message: string | undefined, options: SheetOption[]): void {
  const opts = options.some((o) => o.style === 'cancel') ? options : [...options, { text: 'Cancelar', style: 'cancel' as const }];
  setSheetGlobal?.({ title, message, options: opts });
}
export function alertMsg(title: string, message?: string): void { sheet(title, message, [{ text: 'OK', style: 'cancel' }]); }
export function SheetHost() {
  const [s, set] = useState<SheetState>(null);
  setSheetGlobal = set;
  if (!s) return null;
  return (
    <div class="sheet-backdrop" onClick={() => set(null)}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-title">{s.title}</div>
        {s.message ? <div class="sheet-msg">{s.message}</div> : null}
        {s.options.map((o) => (
          <button class={`sheet-btn ${o.style ?? ''}`} onClick={async () => { set(null); await o.onPress?.(); }}>{o.text}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- Componentes ----------
type Tone = 'primary' | 'accent' | 'ro' | 'baby' | 'danger' | 'warning';

export function Header({ title, backTo, right }: { title: string; backTo?: boolean; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      <div class="topbar-side">{backTo ? <button class="link" onClick={() => back()}>‹ Atrás</button> : null}</div>
      <div class="topbar-title">{title}</div>
      <div class="topbar-side right">{right}</div>
    </header>
  );
}
export function Screen({ children }: { children: ComponentChildren }) {
  return <main class="screen">{children}</main>;
}
export function Title({ children, sub }: { children: ComponentChildren; sub?: string }) {
  return <div><h1>{children}</h1>{sub ? <p class="muted small">{sub}</p> : null}</div>;
}
export function H2({ children }: { children: ComponentChildren }) { return <h2>{children}</h2>; }
export function Body({ children, muted, small, bold, cls }: { children: ComponentChildren; muted?: boolean; small?: boolean; bold?: boolean; cls?: string }) {
  return <p class={`${muted ? 'muted ' : ''}${small ? 'small ' : ''}${bold ? 'bold ' : ''}${cls ?? ''}`}>{children}</p>;
}
export function Card({ children, onPress, tone, cls }: { children: ComponentChildren; onPress?: () => void; tone?: Tone; cls?: string }) {
  return <div class={`card ${tone ? `tone-${tone}` : ''} ${onPress ? 'pressable' : ''} ${cls ?? ''}`} onClick={onPress} role={onPress ? 'button' : undefined}>{children}</div>;
}
export function Button({ title, onPress, kind = 'primary', disabled, small, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; small?: boolean; icon?: string }) {
  return <button class={`btn btn-${kind} ${small ? 'btn-small' : ''}`} disabled={disabled} onClick={(e) => { e.stopPropagation(); onPress(); }}>{icon ? `${icon}  ` : ''}{title}</button>;
}
export function Chip({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: 'ro' | 'baby' | 'accent' | 'danger' }) {
  return <button class={`chip ${active ? 'active' : ''} ${tone ? `chip-${tone}` : ''}`} onClick={(e) => { e.stopPropagation(); onPress?.(); }}>{label}</button>;
}
export function Row({ children, wrap, between, gap }: { children: ComponentChildren; wrap?: boolean; between?: boolean; gap?: number }) {
  return <div class={`row ${wrap ? 'wrap' : ''} ${between ? 'between' : ''}`} style={gap !== undefined ? { gap: `${gap}px` } : undefined}>{children}</div>;
}
export function Field({ label, value, onChange, placeholder, type = 'text', multiline, inputMode, onEnter }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; multiline?: boolean; inputMode?: string; onEnter?: () => void }) {
  return (
    <label class="field">
      {label ? <span class="muted small">{label}</span> : null}
      {multiline
        ? <textarea value={value} placeholder={placeholder} rows={3} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
        : <input type={type} value={value} placeholder={placeholder} inputMode={inputMode as never} onInput={(e) => onChange((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }} />}
    </label>
  );
}
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label class="toggle-row">
      <span><span>{label}</span>{hint ? <span class="muted small block">{hint}</span> : null}</span>
      <input type="checkbox" class="switch" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}
export function Stepper({ value, onChange, step = 1, min = 0, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1).replace(/0$/, ''));
  return (
    <div class="stepper" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>−</button>
      <input inputMode="decimal" value={fmt(value)} onChange={(e) => { const v = Number((e.target as HTMLInputElement).value.replace(',', '.')); if (!isNaN(v) && v >= min) onChange(v); }} />
      {suffix ? <span class="muted small">{suffix}</span> : null}
      <button onClick={() => onChange(+(value + step).toFixed(2))}>+</button>
    </div>
  );
}
export function Notice({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'baby' | 'primary'; children: ComponentChildren }) {
  return <div class={`notice tone-${tone}`}>{children}</div>;
}
export function DishImage({ recipe, size = 64 }: { recipe: { imageUri?: string; tags: string[]; name: string }; size?: number }) {
  if (recipe.imageUri) return <img class="dish" src={recipe.imageUri} alt={recipe.name} style={{ width: `${size}px`, height: `${size}px` }} />;
  return <div class="dish emoji" style={{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.5}px` }}>{dishEmojiFor(recipe.tags, recipe.name)}</div>;
}

export function TabBar({ active }: { active: string }) {
  const tabs = [['hoy', '🏠', 'Hoy'], ['plan', '📅', 'Plan'], ['inventario', '🧺', 'Inventario'], ['asistente', '💬', 'Asistente'], ['mas', '☰', 'Más']];
  return (
    <nav class="tabbar">
      {tabs.map(([id, icon, label]) => (
        <button class={`tab ${active === id ? 'active' : ''}`} onClick={() => go(id, {}, true)}>
          <span class="tab-icon">{icon}</span><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Lee una foto del input y la reduce a JPEG de ~800 px (se guarda dentro de la base). */
export function readPhoto(file: File, max = 800): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
export function PhotoButton({ label, onPhoto, camera = true }: { label: string; onPhoto: (dataUrl: string) => void; camera?: boolean }) {
  return (
    <label class="btn btn-secondary btn-small">
      {label}
      <input type="file" accept="image/*" capture={camera ? 'environment' : undefined} hidden onChange={async (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) onPhoto(await readPhoto(f));
        (e.target as HTMLInputElement).value = '';
      }} />
    </label>
  );
}

/** Descarga o comparte un archivo (en iPhone abre la hoja de compartir). */
export async function shareFile(name: string, mime: string, content: string): Promise<void> {
  const file = new File([content], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
