import { useEffect, useRef } from 'react';
import { dueReminders } from '../domain/reminders';
import { useEngine, useProfile } from './hooks';
import { todayLocal } from '../lib/dates';

/**
 * While the app is open, shows a system notification for each reminder once a
 * day (if the user opted in and granted permission). This cannot run when the
 * app is closed – see Settings → Reminders for the explanation.
 */
export function ReminderRunner() {
  const profile = useProfile();
  const engine = useEngine();
  const fired = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!profile || !engine) return;
    const prefs = profile.reminders;
    if (!prefs.enabled || !prefs.notifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const run = async () => {
      const due = dueReminders(prefs, engine, new Date());
      for (const r of due) {
        const key = `${todayLocal()}:${r.kind}`;
        if (fired.current.has(key)) continue;
        fired.current.add(key);
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          if (reg) await reg.showNotification('Health Recovery', { body: r.text, tag: key, icon: '/pwa-192x192.png' });
          else new Notification('Health Recovery', { body: r.text, tag: key });
        } catch {
          /* notifications are best-effort */
        }
      }
    };
    void run();
    const id = window.setInterval(run, 60_000);
    return () => window.clearInterval(id);
  }, [profile, engine]);
  return null;
}
