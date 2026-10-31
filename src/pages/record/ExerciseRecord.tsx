import { useMemo, useState } from 'react';
import type { ExerciseSession, ExerciseType, Intensity } from '../../db/schemas';
import { exerciseRepo, ValidationError } from '../../db/repo';
import { exerciseTotals, EXERCISE_LABELS } from '../../domain/exercise';
import { adherence, programmePosition, weekDates } from '../../domain/programme';
import { formatDateShort, formatDateUK, isLocalDate, toLocalDate } from '../../lib/dates';
import { useEngine, useGoals, useProfile } from '../../ui/hooks';
import { Button, Card, Chip, ConfirmSheet, Empty, Field, Notice, Segmented, Sheet, Stat, TextArea, parseNum, useToast } from '../../ui/primitives';
import { SimpleBar } from '../../ui/charts';

const TYPES = Object.keys(EXERCISE_LABELS) as ExerciseType[];
const INTENSITY: Array<{ value: Intensity; label: string }> = [{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }];
export const INTENSITY_HELP = 'Easy: could sing. Moderate: can talk but not sing, breathing faster. Hard: only a few words at a time.';

function ExerciseForm({ initial, onSaved, submitLabel }: { initial?: ExerciseSession; onSaved: () => void; submitLabel: string }) {
  const toast = useToast();
  const [date, setDate] = useState(initial?.localDate ?? toLocalDate());
  const [type, setType] = useState<ExerciseType>(initial?.type ?? 'walking');
  const [duration, setDuration] = useState(initial ? String(initial.durationMin) : '');
  const [intensity, setIntensity] = useState<Intensity>(initial?.intensity ?? 'moderate');
  const [distance, setDistance] = useState(initial?.distanceKm != null ? String(initial.distanceKm) : '');
  const [planned, setPlanned] = useState(initial?.planned ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const e: Record<string, string> = {};
    const d = parseNum(duration), km = parseNum(distance);
    if (!isLocalDate(date) || date > toLocalDate()) e.date = 'Enter a date that is not in the future.';
    if (d == null || Number.isNaN(d) || !Number.isInteger(d) || d < 1 || d > 600) e.duration = 'Duration must be 1–600 whole minutes.';
    if (km != null && (Number.isNaN(km) || km < 0 || km > 500)) e.distance = 'Distance must be 0–500 km.';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const { distanceKm: _d, notes: _n, ...rest } = initial ?? ({} as Partial<ExerciseSession>);
      await exerciseRepo.save({ ...rest, localDate: date, type, durationMin: d!, intensity, planned, ...(km != null ? { distanceKm: km } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) } as Parameters<typeof exerciseRepo.save>[0]);
      toast('Exercise saved');
      if (!initial) { setDuration(''); setDistance(''); setNotes(''); }
      onSaved();
    } catch (err) { toast(err instanceof ValidationError ? err.message : 'Could not save', 'danger'); }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <div>
        <p id="ex-type" className="mb-1 text-sm font-medium">Activity</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ex-type">
          {TYPES.map((t) => <Chip key={t} selected={type === t} onClick={() => setType(t)}>{EXERCISE_LABELS[t]}</Chip>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" type="date" value={date} max={toLocalDate()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <Field label="Duration" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} suffix="min" error={errors.duration} />
      </div>
      <Segmented label="Perceived intensity" value={intensity} onChange={setIntensity} options={INTENSITY} />
      <p className="text-xs text-muted">{INTENSITY_HELP}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distance (optional)" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} suffix="km" error={errors.distance} />
        <Segmented label="Was it planned?" value={planned ? 'y' : 'n'} onChange={(v) => setPlanned(v === 'y')} options={[{ value: 'y', label: 'Planned' }, { value: 'n', label: 'Extra' }]} />
      </div>
      <TextArea label="Notes (optional)" value={notes} onChange={setNotes} hint="e.g. any Achilles/knee/hamstring symptoms" />
      <Button type="submit" size="lg" className="w-full">{submitLabel}</Button>
    </form>
  );
}

export function ExerciseRecord() {
  const engine = useEngine();
  const goals = useGoals();
  const profile = useProfile();
  const toast = useToast();
  const [editing, setEditing] = useState<ExerciseSession | null>(null);
  const [del, setDel] = useState<ExerciseSession | null>(null);
  const view = useMemo(() => {
    if (!engine) return null;
    const pos = programmePosition(engine.startDate, engine.today);
    const weeksSoFar = pos.beforeStart ? 0 : pos.weekNumber;
    const weekly = Array.from({ length: Math.min(weeksSoFar, 16) }, (_, i) => weeksSoFar - Math.min(weeksSoFar, 16) + i + 1).map((n) => {
      const { start, end } = weekDates(engine.startDate, n);
      const t = exerciseTotals(engine.data.exercise.filter((e) => e.localDate >= start && e.localDate <= end));
      return { label: `W${n}`, mins: t.moderateEquivalentMinutes };
    });
    const cur = pos.beforeStart ? null : (() => {
      const xs = engine.data.exercise.filter((e) => e.localDate >= pos.weekStart && e.localDate <= pos.weekEnd);
      const sched = adherence(pos.weekStart, pos.weekEnd, { ...engine, activities: engine.activities.filter((a) => a.category === 'aerobic' || a.category === 'strength') });
      return { totals: exerciseTotals(xs), sched };
    })();
    return { pos, weekly, cur };
  }, [engine]);
  if (!engine || !view) return <p role="status">Loading…</p>;
  const { cur, weekly } = view;
  const list = [...engine.data.exercise].reverse();

  return (
    <div className="space-y-4">
      {profile?.injuryNotes && <Notice tone="neutral" title="Injury reminder">{profile.injuryNotes} Stop or swap any activity that provokes pain.</Notice>}
      <Card title="Log exercise"><ExerciseForm onSaved={() => {}} submitLabel="Save session" /></Card>

      <Card title={`This week${view.pos.beforeStart ? '' : ` (week ${view.pos.weekNumber})`}`}>
        {cur ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Moderate-equiv." value={cur.totals.moderateEquivalentMinutes} unit={`/${goals.weeklyAerobicMinutes}`} sub="moderate + 2× hard" />
            <Stat label="Aerobic total" value={cur.totals.aerobicMinutes} unit="min" sub={`${cur.totals.easyAerobicMinutes} easy · ${cur.totals.moderateMinutes} mod · ${cur.totals.vigorousMinutes} hard`} />
            <Stat label="Strength" value={`${cur.totals.strengthSessions}/${goals.weeklyStrengthSessions}`} sub="sessions" />
            <Stat label="Schedule" value={cur.sched.percent != null ? `${cur.sched.percent}%` : '—'} sub={`${cur.sched.completed}/${cur.sched.due} planned sessions so far`} />
          </div>
        ) : <Empty>Your programme hasn’t started yet.</Empty>}
        <div className="mt-4">
          <SimpleBar data={weekly} dataKey="mins" name="Moderate-equivalent" unit="min" target={goals.weeklyAerobicMinutes} />
          {weekly.length > 0 && <p className="mt-2 text-sm text-muted">Weekly moderate-equivalent aerobic minutes by programme week: {weekly.map((w) => `${w.label} ${w.mins}`).join(', ')}. Dashed line: {goals.weeklyAerobicMinutes} min target.</p>}
        </div>
      </Card>

      <Card title="History">
        {list.length === 0 ? <Empty>No sessions yet.</Empty> : (
          <ul className="divide-y divide-border">
            {list.slice(0, 100).map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-left">
                  <span>
                    <span className="block font-medium">{EXERCISE_LABELS[s.type]} · {s.durationMin} min · {s.intensity}{s.distanceKm != null ? ` · ${s.distanceKm} km` : ''}</span>
                    <span className="block text-xs text-muted">{formatDateShort(s.localDate)} {formatDateUK(s.localDate).slice(6)} · {s.planned ? 'planned' : 'extra'}{s.source !== 'manual' ? ` · ${s.source}` : ''}{s.notes ? ` · ${s.notes}` : ''}</span>
                  </span>
                  <span className="text-sm text-primary">Edit</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit session" footer={<Button variant="danger" className="flex-1" onClick={() => { setDel(editing); setEditing(null); }}>Delete session</Button>}>
        {editing && <ExerciseForm key={editing.id} initial={editing} submitLabel="Save changes" onSaved={() => setEditing(null)} />}
      </Sheet>
      <ConfirmSheet open={!!del} title="Delete session?" body={<p>This cannot be undone.</p>} confirmLabel="Delete" danger onClose={() => setDel(null)} onConfirm={async () => { if (del) await exerciseRepo.remove(del.id); setDel(null); toast('Deleted'); }} />
    </div>
  );
}
