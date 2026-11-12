/** Nombre provisional: cambiarlo acá y en app.json ("name"). */
export const APP_NAME = 'Mi Menú IA';
export const APP_TAGLINE = 'Tu asistente de alimentación familiar';
export const LOCALE = 'es-AR';
/**
 * IA online OPCIONAL. Debe apuntar a TU backend (ver /server), nunca a un
 * proveedor de IA directamente: las claves privadas no van en la app.
 * Vacío = la app funciona 100 % local.
 */
export const AI_PROXY_URL = (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_AI_PROXY_URL : undefined) ?? '';
