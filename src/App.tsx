import { lazy, Suspense, useEffect, useState } from 'react';
import { Activity, CalendarCheck, LayoutDashboard, LineChart, PlusCircle, Settings as SettingsIcon } from 'lucide-react';
import { db } from './db/db';
import { useProfile } from './ui/hooks';
import { navigate, useRoute, type Route } from './ui/router';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ToastProvider, cx } from './ui/primitives';
import { useTheme } from './ui/theme';
import { PwaStatus } from './ui/pwa';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { ReminderRunner } from './ui/reminders';
import { useHealthConnectAutoSync } from './native/HealthConnectCard';

const Plan = lazy(() => import('./pages/Plan').then((m) => ({ default: m.Plan })));
const Record = lazy(() => import('./pages/Record').then((m) => ({ default: m.Record })));
const Progress = lazy(() => import('./pages/Progress').then((m) => ({ default: m.Progress })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

type StorageState = { status: 'opening' } | { status: 'ready' } | { status: 'error'; message: string; kind: string };

export function App() {
  const [storage, setStorage] = useState<StorageState>({ status: 'opening' });
  useEffect(() => {
    if (!('indexedDB' in window)) {
      setStorage({ status: 'error', kind: 'unsupported', message: 'This browser does not support on-device storage (IndexedDB).' });
      return;
    }
    db.open()
      .then(() => setStorage({ status: 'ready' }))
      .catch((e: Error) => setStorage({ status: 'error', kind: e.name, message: e.message }));
  }, []);

  if (storage.status === 'opening') return <Splash />;
  if (storage.status === 'error') return <StorageError kind={storage.kind} message={storage.message} />;
  return (
    <ToastProvider>
      <ErrorBoundary>
        <Main />
      </ErrorBoundary>
    </ToastProvider>
  );
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center text-muted" role="status">Loading…</div>;
}

function StorageError({ kind, message }: { kind: string; message: string }) {
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">Storage unavailable</h1>
      <p className="mt-2 text-sm">
        Health Recovery stores everything on this device and could not open its database. Nothing has been deleted.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Private/incognito browsing or blocked site data can prevent storage.</li>
        <li>The device may be very low on space.</li>
        <li>If this happened straight after an update, close all tabs of the app and reopen it.</li>
        <li>Use a current version of Chrome or Edge.</li>
      </ul>
      <p className="mt-3 text-xs text-muted">Technical detail: {kind}: {message}</p>
      <button type="button" className="mt-4 min-h-12 rounded-xl bg-primary px-4 font-medium text-on-primary" onClick={() => window.location.reload()}>Try again</button>
    </main>
  );
}

function Main() {
  const profile = useProfile();
  useTheme(profile?.theme);
  if (profile === null) return <Splash />;
  if (!profile?.onboardedAt) return <Onboarding />;
  return <Shell />;
}

const NAV: Array<{ section: Route['section']; label: string; icon: typeof Activity }> = [
  { section: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'plan', label: 'My Plan', icon: CalendarCheck },
  { section: 'record', label: 'Record', icon: PlusCircle },
  { section: 'progress', label: 'Progress', icon: LineChart },
  { section: 'settings', label: 'Settings', icon: SettingsIcon },
];

function Shell() {
  const route = useRoute();
  const profile = useProfile();
  useHealthConnectAutoSync(profile?.healthConnect?.enabled);
  useEffect(() => {
    document.title = `${NAV.find((n) => n.section === route.section)?.label ?? ''} · Health Recovery`;
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route.section]);
  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded-lg bg-primary px-3 py-2 text-on-primary">Skip to content</a>
      <nav aria-label="Main" className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:sticky md:top-0 md:flex md:h-dvh">
        <div className="mb-4 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">Health Recovery</span>
        </div>
        {NAV.map(({ section, label, icon: Icon }) => (
          <a key={section} href={`#/${section}`} aria-current={route.section === section ? 'page' : undefined}
            className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium', route.section === section ? 'bg-surface-2 text-primary' : 'text-muted hover:bg-surface-2 hover:text-text')}>
            <Icon size={20} aria-hidden /> {label}
          </a>
        ))}
        <p className="mt-auto px-2 text-xs text-muted">All data stays on this device.</p>
      </nav>
      <div className="min-w-0 flex-1">
        <div className="safe-top sticky top-0 z-20"><PwaStatus /></div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 outline-none md:pb-10">
          <ErrorBoundary label="this page" key={route.section}>
            <Suspense fallback={<p role="status" className="text-muted">Loading…</p>}>
              {route.section === 'dashboard' && <Dashboard />}
              {route.section === 'plan' && <Plan />}
              {route.section === 'record' && <Record sub={route.sub} />}
              {route.section === 'progress' && <Progress sub={route.sub} />}
              {route.section === 'settings' && <Settings />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ section, label, icon: Icon }) => (
            <li key={section}>
              <a href={`#/${section}`} aria-current={route.section === section ? 'page' : undefined}
                onClick={(e) => { if (route.section === section && route.sub) { e.preventDefault(); navigate(section); } }}
                className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', route.section === section ? 'text-primary' : 'text-muted')}>
                <Icon size={22} aria-hidden strokeWidth={route.section === section ? 2.4 : 1.8} />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <ReminderRunner />
    </div>
  );
}
