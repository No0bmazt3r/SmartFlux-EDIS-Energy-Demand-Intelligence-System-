// API client, the demo session and a tiny router (one app, three roles: customer, owner, admin).
import { useEffect, useState, useSyncExternalStore } from "react";

export type Role = "customer" | "admin" | "superadmin";
export type Session = { token: string; role: Role; outlets: string[]; name?: string; email?: string };
export type Lang = "en" | "ms";

// Per-viewer settings: the demo session, the demo "as of" date, the language, the selected outlet.
const store = {
  get<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(`sf.${k}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k: string, v: unknown) { try { v === null ? localStorage.removeItem(`sf.${k}`) : localStorage.setItem(`sf.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const listeners = new Set<() => void>();
const state = {
  session: store.get<Session | null>("session", null),
  asOf: store.get("asOf", "2026-10-18"),
  lang: store.get<Lang>("lang", "en"),
  outlet: store.get<string | null>("outlet", null),
};
export const getLang = () => state.lang; // for plain helpers (date formatting); components re-render via usePrefs
export function setPref<K extends keyof typeof state>(k: K, v: (typeof state)[K]) {
  state[k] = v;
  store.set(k, v);
  listeners.forEach((l) => l());
}
let snapshot = { ...state };
listeners.add(() => { snapshot = { ...state }; });
export const usePrefs = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snapshot);
export const WINDOW = { start: "2026-09-07", end: "2026-10-18" };
// The three demo sessions: learn the baselines, flag and approve D4, verify and brief.
export const SESSIONS = ["2026-09-13", "2026-10-04", "2026-10-18"];

export class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(state.session ? { Authorization: `Bearer ${state.session.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { setPref("session", null); navigate("/login"); }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error ?? res.statusText);
  return data as T;
}

// Loads `path` and reloads when it changes; reload() after an action.
export function useApi<T = any>(path: string | null) {
  const [s, setS] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setS((p) => ({ ...p, loading: true }));
    api<T>(path).then((data) => live && setS({ data, loading: false }), (e) => live && setS({ error: e.message, loading: false }));
    return () => { live = false; };
  }, [path, n]);
  return { ...s, reload: () => setN((x) => x + 1) };
}

// Router: history API plus a pattern match; enough for a dozen screens.
const routeListeners = new Set<() => void>();
export function navigate(to: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", to);
  routeListeners.forEach((l) => l());
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", () => routeListeners.forEach((l) => l()));
export const usePath = () => useSyncExternalStore((l) => (routeListeners.add(l), () => routeListeners.delete(l)), () => location.pathname + location.search);
export function match(pattern: string, path: string) {
  const keys: string[] = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
  const m = path.split("?")[0].match(re);
  return m ? Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) : null;
}
// Plain <a href> that routes in-app (keeps middle-click and keyboard behaviour).
export const linkProps = (href: string) => ({
  href,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  },
});
