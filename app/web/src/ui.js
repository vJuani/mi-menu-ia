import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useState } from 'preact/hooks';
import { dishDataUri } from '../../src/art/dishArt.js';
import { useApp } from './state.js';
export function parseHash(h = location.hash) {
    const raw = h.replace(/^#\/?/, '');
    const [p, q = ''] = raw.split('?');
    const params = {};
    new URLSearchParams(q).forEach((v, k) => { params[k] = v; });
    return { path: p ? p.split('/').map(decodeURIComponent) : ['hoy'], params };
}
export function go(path, params = {}, replace = false) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
    const h = `#/${path}${q ? `?${q}` : ''}`;
    if (replace)
        location.replace(h);
    else
        location.hash = h;
}
export function back(fallback = 'hoy') {
    if (history.length > 1)
        history.back();
    else
        go(fallback, {}, true);
}
export function useRoute() {
    const [r, setR] = useState(parseHash());
    useEffect(() => {
        const f = () => { setR(parseHash()); window.scrollTo(0, 0); };
        window.addEventListener('hashchange', f);
        return () => window.removeEventListener('hashchange', f);
    }, []);
    return r;
}
let setSheetGlobal = null;
export function sheet(title, message, options) {
    const opts = options.some((o) => o.style === 'cancel') ? options : [...options, { text: 'Cancelar', style: 'cancel' }];
    setSheetGlobal?.({ title, message, options: opts });
}
export function alertMsg(title, message) { sheet(title, message, [{ text: 'OK', style: 'cancel' }]); }
export function SheetHost() {
    const [s, set] = useState(null);
    setSheetGlobal = set;
    if (!s)
        return null;
    return (_jsx("div", { class: "sheet-backdrop", onClick: () => set(null), children: _jsxs("div", { class: "sheet", onClick: (e) => e.stopPropagation(), children: [_jsx("div", { class: "sheet-title", children: s.title }), s.message ? _jsx("div", { class: "sheet-msg", children: s.message }) : null, s.options.map((o) => (_jsx("button", { class: `sheet-btn ${o.style ?? ''}`, onClick: async () => { set(null); await o.onPress?.(); }, children: o.text })))] }) }));
}
export function Header({ title, backTo, right }) {
    return (_jsxs("header", { class: "topbar", children: [_jsx("div", { class: "topbar-side", children: backTo ? _jsx("button", { class: "link", onClick: () => back(), children: "\u2039 Atr\u00E1s" }) : null }), _jsx("div", { class: "topbar-title", children: title }), _jsx("div", { class: "topbar-side right", children: right })] }));
}
export function Screen({ children }) {
    return _jsx("main", { class: "screen", children: children });
}
export function Title({ children, sub }) {
    return _jsxs("div", { children: [_jsx("h1", { children: children }), sub ? _jsx("p", { class: "muted small", children: sub }) : null] });
}
export function H2({ children }) { return _jsx("h2", { children: children }); }
export function Body({ children, muted, small, bold, cls }) {
    return _jsx("p", { class: `${muted ? 'muted ' : ''}${small ? 'small ' : ''}${bold ? 'bold ' : ''}${cls ?? ''}`, children: children });
}
export function Card({ children, onPress, tone, cls }) {
    return _jsx("div", { class: `card ${tone ? `tone-${tone}` : ''} ${onPress ? 'pressable' : ''} ${cls ?? ''}`, onClick: onPress, role: onPress ? 'button' : undefined, children: children });
}
export function Button({ title, onPress, kind = 'primary', disabled, small, icon }) {
    return _jsxs("button", { class: `btn btn-${kind} ${small ? 'btn-small' : ''}`, disabled: disabled, onClick: (e) => { e.stopPropagation(); onPress(); }, children: [icon ? `${icon}  ` : '', title] });
}
export function Chip({ label, active, onPress, tone }) {
    return _jsx("button", { class: `chip ${active ? 'active' : ''} ${tone ? `chip-${tone}` : ''}`, onClick: (e) => { e.stopPropagation(); onPress?.(); }, children: label });
}
export function Row({ children, wrap, between, gap }) {
    return _jsx("div", { class: `row ${wrap ? 'wrap' : ''} ${between ? 'between' : ''}`, style: gap !== undefined ? { gap: `${gap}px` } : undefined, children: children });
}
export function Field({ label, value, onChange, placeholder, type = 'text', multiline, inputMode, onEnter }) {
    return (_jsxs("label", { class: "field", children: [label ? _jsx("span", { class: "muted small", children: label }) : null, multiline
                ? _jsx("textarea", { value: value, placeholder: placeholder, rows: 3, onInput: (e) => onChange(e.target.value) })
                : _jsx("input", { type: type, value: value, placeholder: placeholder, inputMode: inputMode, onInput: (e) => onChange(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && onEnter)
                        onEnter(); } })] }));
}
export function Toggle({ label, value, onChange, hint }) {
    return (_jsxs("label", { class: "toggle-row", children: [_jsxs("span", { children: [_jsx("span", { children: label }), hint ? _jsx("span", { class: "muted small block", children: hint }) : null] }), _jsx("input", { type: "checkbox", class: "switch", checked: value, onChange: (e) => onChange(e.target.checked) })] }));
}
export function Stepper({ value, onChange, step = 1, min = 0, suffix }) {
    const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1).replace(/0$/, ''));
    return (_jsxs("div", { class: "stepper", onClick: (e) => e.stopPropagation(), children: [_jsx("button", { onClick: () => onChange(Math.max(min, +(value - step).toFixed(2))), children: "\u2212" }), _jsx("input", { inputMode: "decimal", value: fmt(value), onChange: (e) => { const v = Number(e.target.value.replace(',', '.')); if (!isNaN(v) && v >= min)
                    onChange(v); } }), suffix ? _jsx("span", { class: "muted small", children: suffix }) : null, _jsx("button", { onClick: () => onChange(+(value + step).toFixed(2)), children: "+" })] }));
}
export function Notice({ tone = 'warning', children }) {
    return _jsx("div", { class: `notice tone-${tone}`, children: children });
}
const artCache = new Map();
/** Foto propia si existe; si no, ilustración generada a partir de los ingredientes. */
export function dishSrc(recipe, ingredients) {
    if (recipe.imageUri)
        return recipe.imageUri;
    const key = `${recipe.id}|${recipe.name}|${recipe.ingredients.map((i) => `${i.ingredientId}${i.optional ? '?' : ''}`).join(',')}`;
    let uri = artCache.get(key);
    if (!uri) {
        uri = dishDataUri(recipe, ingredients);
        artCache.set(key, uri);
    }
    return uri;
}
export function DishImage({ recipe, size = 64 }) {
    const { data } = useApp();
    return _jsx("img", { class: "dish", src: dishSrc(recipe, data.ingredients), alt: recipe.name, style: { width: `${size}px`, height: `${size}px` } });
}
export function DishHero({ recipe, caption }) {
    const { data } = useApp();
    return (_jsxs("figure", { class: "hero", children: [_jsx("img", { src: dishSrc(recipe, data.ingredients), alt: recipe.name }), caption ? _jsx("figcaption", { children: caption }) : null] }));
}
export function TabBar({ active }) {
    const tabs = [['hoy', '🏠', 'Hoy'], ['plan', '📅', 'Plan'], ['inventario', '🧺', 'Inventario'], ['asistente', '💬', 'Asistente'], ['mas', '☰', 'Más']];
    return (_jsx("nav", { class: "tabbar", children: tabs.map(([id, icon, label]) => (_jsxs("button", { class: `tab ${active === id ? 'active' : ''}`, onClick: () => go(id, {}, true), children: [_jsx("span", { class: "tab-icon", children: icon }), _jsx("span", { children: label })] }))) }));
}
/** Lee una foto del input y la reduce a JPEG de ~800 px (se guarda dentro de la base). */
export function readPhoto(file, max = 800) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src);
            res(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
    });
}
export function PhotoButton({ label, onPhoto, camera = true }) {
    return (_jsxs("label", { class: "btn btn-secondary btn-small", children: [label, _jsx("input", { type: "file", accept: "image/*", capture: camera ? 'environment' : undefined, hidden: true, onChange: async (e) => {
                    const f = e.target.files?.[0];
                    if (f)
                        onPhoto(await readPhoto(f));
                    e.target.value = '';
                } })] }));
}
/** Descarga o comparte un archivo (en iPhone abre la hoja de compartir). */
export async function shareFile(name, mime, content) {
    const file = new File([content], name, { type: mime });
    const nav = navigator;
    if (nav.canShare?.({ files: [file] })) {
        try {
            await nav.share({ files: [file], title: name });
            return;
        }
        catch (e) {
            if (e.name === 'AbortError')
                return;
        }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
