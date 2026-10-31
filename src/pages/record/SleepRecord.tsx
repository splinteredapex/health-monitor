import { useState } from 'react';
import type { SleepRecord } from '../../db/schemas';
import { sleepRepo, ValidationError } from '../../db/repo';
import { QUALITY_LABELS, resolveSleep, summariseSleep } from '../../domain/sleep';
import { addDays, formatDateShort, formatDayMonth, isLocalDate, isLocalTime, minutesToHM, toLocalDate } from '../../lib/dates';
import { useEngine, useGoals } from '../../ui/hooks';
import { Button, Card, ConfirmSheet, Empty, Field, Notice, Segmented, Sheet, Stat, TextArea, useToast } from '../../ui/primitives';
import { SimpleBar } from '../../ui/charts';

function SleepForm({ initial, existing, onSaved, submitLabel }: { initial?: SleepRecord; existing: readonly SleepRecord[]; onSaved: () => void; submitLabel: string }) {
  const toast = useToast();
  const [wakeDate, setWakeDate] = useState(initial?.wakeDate ?? toLocalDate());
  const [bed, setBed] = useState(initial?.bedLocal.slice(11) ?? '23:00');
  const [wake, setWake] = useState(initial?.wakeLocal.slice(11) ?? '07:00');
  const [quality, setQuality] = useState<string>(initial?.quality ? String(initial.quality) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  let preview: string | null = null;
  try { if (isLocalDate(wakeDate) && isLocalTime(bed) && isLocalTime(wake)) preview = minutesToHM(resolveSleep(wakeDate, bed, wake).durationMin); } catch { preview = null; }

  async function save() {
    setErr('');
    if (!isLocalDate(wakeDate) || wakeDate > toLocalDate()) { setErr('Enter a wake date that is not in the future.'); return; }
    if (!isLocalTime(bed) || !isLocalTime(wake)) { setErr('Enter bedtime and wake time.'); return; }
    let t;
    try { t = resolveSleep(wakeDate, bed, wake); } catch (e) { setErr((e as Error).message); return; }
    const dup = existing.find((s) => s.wakeDate === wakeDate && s.id !== initial?.id);
    if (dup) { setErr(`A sleep for ${formatDateShort(wakeDate)} already exists – edit it instead.`); return; }
    try {
      const { quality: _q, notes: _n, ...rest } = initial ?? ({} as Partial<SleepRecord>);
      await sleepRepo.save({ ...rest, wakeDate, ...t, ...(quality ? { quality: Number(quality) } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) } as Parameters<typeof sleepRepo.save>[0]);
      toast('Sleep saved');
      onSaved();
    } catch (e) { setErr(e instanceof ValidationError ? e.message : 'Could not save'); }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <Field label="Woke up on" type="date" value={wakeDate} max={toLocalDate()} onChange={(e) => setWakeDate(e.target.value)} hint={isLocalDate(wakeDate) ? `Night of ${formatDateShort(addDays(wakeDate, -1))} → ${formatDateShort(wakeDate)}` : undefined} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedtime" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        <Field label="Wake time" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
      </div>
      {preview && <p className="text-sm" aria-live="polite">Duration: <strong className="tabular">{preview}</strong></p>}
      <Segmented label="How rested do you feel? (optional)" value={quality} onChange={setQuality} options={[{ value: '', label: '–' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]} />
      <p className="text-xs text-muted">1 = {QUALITY_LABELS[1]}, 5 = {QUALITY_LABELS[5]}. Quality is your own judgement – it isn’t inferred from duration.</p>
      <TextArea label="Notes (optional)" value={notes} onChange={setNotes} />
      {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
      <Button type="submit" size="lg" className="w-full">{submitLabel}</Button>
    </form>
  );
}

export function SleepRecordPage() {
  const engine = useEngine();
  const goals = useGoals();
  const toast = useToast();
  const [editing, setEditing] = useState<SleepRecord | null>(null);
  const [del, setDel] = useState<SleepRecord | null>(null);
  if (!engine) return <p role="status">Loading…</p>;
  const all = engine.data.sleep;
  const today = engine.today;
  const s7 = summariseSleep(all.filter((s) => s.wakeDate > addDays(today, -7)), goals.sleepTargetMinHours, goals.sleepTargetMaxHours);
  const last14 = all.filter((s) => s.wakeDate > addDays(today, -14)).map((s) => ({ label: formatDayMonth(s.wakeDate), hours: Math.round((s.durationMin / 60) * 10) / 10 }));

  return (
    <div className="space-y-4">
      <Card title="Log sleep"><SleepForm existing={all} onSaved={() => {}} submitLabel="Save sleep" /></Card>
      <Card title="Last 7 nights">
        {s7.nights ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Average" value={minutesToHM(s7.avgDurationMin!)} sub={`${s7.nights} logged`} />
            <Stat label="In target" value={`${s7.nightsInTarget}/${s7.nights}`} sub={`${goals.sleepTargetMinHours}–${goals.sleepTargetMaxHours} h`} />
            <Stat label="Quality" value={s7.avgQuality ?? '—'} unit={s7.avgQuality != null ? '/5' : undefined} />
          </div>
        ) : <Empty>No nights logged in the last 7 days.</Empty>}
        <div className="mt-4">
          <SimpleBar data={last14} dataKey="hours" name="Sleep" unit="h" target={goals.sleepTargetMinHours} />
          {last14.length > 0 && <p className="mt-2 text-sm text-muted">Hours slept, last 14 days: {last14.map((d) => `${d.label} ${d.hours} h`).join(', ')}.</p>}
        </div>
        {s7.nights > 0 && s7.nightsInTarget < s7.nights / 2 && <div className="mt-3"><Notice tone="neutral">Fewer than half of recent nights were in your target range. Consistent wake times help most.</Notice></div>}
      </Card>
      <Card title="History">
        {all.length === 0 ? <Empty>No sleep logged yet.</Empty> : (
          <ul className="divide-y divide-border">
            {[...all].reverse().slice(0, 100).map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="flex min-h-12 w-full items-center justify-between py-2 text-left">
                  <span>
                    <span className="tabular block font-medium">{minutesToHM(s.durationMin)}{s.quality ? ` · ${QUALITY_LABELS[s.quality]}` : ''}</span>
                    <span className="block text-xs text-muted">{s.bedLocal.slice(11)} → {s.wakeLocal.slice(11)} · woke {formatDateShort(s.wakeDate)}{s.source !== 'manual' ? ` · ${s.source}` : ''}</span>
                  </span>
                  <span className="text-sm text-primary">Edit</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit sleep" footer={<Button variant="danger" className="flex-1" onClick={() => { setDel(editing); setEditing(null); }}>Delete</Button>}>
        {editing && <SleepForm key={editing.id} initial={editing} existing={all} submitLabel="Save changes" onSaved={() => setEditing(null)} />}
      </Sheet>
      <ConfirmSheet open={!!del} title="Delete sleep record?" body={<p>This cannot be undone.</p>} confirmLabel="Delete" danger onClose={() => setDel(null)} onConfirm={async () => { if (del) await sleepRepo.remove(del.id); setDel(null); toast('Deleted'); }} />
    </div>
  );
}
