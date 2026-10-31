import { useSyncExternalStore } from 'react';

export type Route = { section: 'dashboard' | 'plan' | 'record' | 'progress' | 'settings'; sub?: string | undefined };
const SECTIONS = ['dashboard', 'plan', 'record', 'progress', 'settings'] as const;

export function parseHash(hash: string): Route {
  const [, s, sub] = hash.replace(/^#/, '').split('/');
  const section = (SECTIONS as readonly string[]).includes(s ?? '') ? (s as Route['section']) : 'dashboard';
  return { section, sub: sub ? decodeURIComponent(sub) : undefined };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseHash(hash);
}

export function navigate(section: Route['section'], sub?: string) {
  window.location.hash = `/${section}${sub ? `/${encodeURIComponent(sub)}` : ''}`;
}
