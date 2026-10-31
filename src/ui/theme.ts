import { useEffect } from 'react';
import type { Theme } from '../db/schemas';

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1422' : '#0f2340');
}

export function useTheme(theme: Theme | undefined) {
  useEffect(() => {
    const t = theme ?? 'system';
    applyTheme(t);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => applyTheme(t);
    mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, [theme]);
}
