// Tipos mínimos de Preact para compilar sin node_modules (la librería real está en vendor/).
declare module 'preact' {
  export type ComponentChildren = any;
  export type VNode = any;
  export function render(vnode: any, parent: Element): void;
  export function createContext<T>(v: T): { Provider: any; Consumer: any };
  export function h(...a: any[]): any;
}
declare module 'preact/hooks' {
  export function useState<T>(v: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useState<T = undefined>(): [T | undefined, (v: T | undefined | ((p: T | undefined) => T | undefined)) => void];
  export function useEffect(f: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(f: () => T, deps: unknown[]): T;
  export function useCallback<T>(f: T, deps: unknown[]): T;
  export function useRef<T>(v: T | null): { current: T };
  export function useContext<T>(c: any): T;
}
declare module 'preact/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare namespace JSX {
  interface IntrinsicElements { [k: string]: any }
  type Element = any;
  interface IntrinsicAttributes { key?: any }
}
declare var process: { env: Record<string, string | undefined> } | undefined;
