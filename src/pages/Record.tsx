import { lazy, Suspense } from 'react';
import { navigate } from '../ui/router';
import { cx } from '../ui/primitives';
import { BpRecord } from './record/BpRecord';

const BodyRecord = lazy(() => import('./record/BodyRecord').then((m) => ({ default: m.BodyRecord })));
const ExerciseRecord = lazy(() => import('./record/ExerciseRecord').then((m) => ({ default: m.ExerciseRecord })));
const SleepRecordPage = lazy(() => import('./record/SleepRecord').then((m) => ({ default: m.SleepRecordPage })));
const LifestyleRecord = lazy(() => import('./record/LifestyleRecord').then((m) => ({ default: m.LifestyleRecord })));

const TABS = [
  { id: 'bp', label: 'Blood pressure' },
  { id: 'body', label: 'Body' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'lifestyle', label: 'Lifestyle' },
] as const;

export function Record({ sub }: { sub: string | undefined }) {
  const tab = TABS.find((t) => t.id === sub)?.id ?? 'bp';
  return (
    <div>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">Record</h1>
      <nav aria-label="Record type" className="-mx-4 mb-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-1 rounded-xl bg-surface-2 p-1">
          {TABS.map((t) => (
            <li key={t.id}>
              <a href={`#/record/${t.id}`} aria-current={tab === t.id ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); navigate('record', t.id); }}
                className={cx('flex min-h-10 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap', tab === t.id ? 'bg-surface text-text shadow-sm ring-1 ring-border' : 'text-muted')}>
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense fallback={<p role="status" className="text-muted">Loading…</p>}>
        {tab === 'bp' && <BpRecord />}
        {tab === 'body' && <BodyRecord />}
        {tab === 'exercise' && <ExerciseRecord />}
        {tab === 'sleep' && <SleepRecordPage />}
        {tab === 'lifestyle' && <LifestyleRecord />}
      </Suspense>
    </div>
  );
}
