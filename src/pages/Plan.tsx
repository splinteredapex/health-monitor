import type React from 'react';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw } from 'lucide-react';
import type { ActivityCategory, ProgrammeWeek, ScheduledActivity } from '../db/schemas';
import { archiveActivity, resetProgrammeToDefault, saveActivity, saveWeek } from '../db/repo';
import { adherence, findWeek, occurrencesForDate, programmePosition, templateWeekNumber, weekDates } from '../domain/programme';
import { dateRange, formatDateShort, formatDateUK } from '../lib/dates';
import { PROGRAMME_WEEKS } from '../programme/template';
import { useEngine, useWeeks } from '../ui/hooks';
import { Button, Card, ConfirmSheet, Empty, Field, IconButton, Notice, PageHeader, Pill, Select, Sheet, TextArea, useToast } from '../ui/primitives';
import { TaskRow } from '../ui/TaskRow';

const CATS: ActivityCategory[] = ['aerobic', 'strength', 'mobility', 'bp', 'weight', 'waist', 'sleep', 'nutrition', 'review', 'medical', 'lifestyle'];

export function Plan() {
  const engine = useEngine();
  const weeks = useWeeks();
  const toast = useToast();
  const current = engine ? programmePosition(engine.startDate, engine.today) : null;
  const [weekNo, setWeekNo] = useState<number | null>(null);
  const [editWeek, setEditWeek] = useState<ProgrammeWeek | null>(null);
  const [editAct, setEditAct] = useState<Partial<ScheduledActivity> | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const n = weekNo ?? Math.max(1, current?.weekNumber ?? 1);

  const view = useMemo(() => {
    if (!engine || !weeks) return null;
    const { start, end } = weekDates(engine.startDate, n);
    const days = dateRange(start, end).map((d) => ({ date: d, occ: occurrencesForDate(d, engine) }));
    return { start, end, days, adh: adherence(start, end, engine), week: findWeek(weeks, n) };
  }, [engine, weeks, n]);

  if (!engine || !view || !current) return <p role="status">Loading…</p>;
  const { week, days, adh, start, end } = view;
  const maxWeek = Math.max(PROGRAMME_WEEKS, current.weekNumber) + 1;

  return (
    <div className="space-y-4">
      <PageHeader title="My Plan" subtitle={`Started ${formatDateUK(engine.startDate)} · change in Settings`} />
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-2">
        <IconButton label="Previous week" disabled={n <= 1} onClick={() => setWeekNo(n - 1)}><ChevronLeft aria-hidden /></IconButton>
        <div className="text-center" aria-live="polite">
          <p className="font-semibold">{n > PROGRAMME_WEEKS ? `Week ${n} · Maintenance` : `Week ${n} of ${PROGRAMME_WEEKS}`}</p>
          <p className="text-xs text-muted">{formatDateUK(start)} – {formatDateUK(end)}{n === current.weekNumber ? ' · this week' : ''}</p>
        </div>
        <IconButton label="Next week" disabled={n >= maxWeek} onClick={() => setWeekNo(n + 1)}><ChevronRight aria-hidden /></IconButton>
      </div>
      {n !== current.weekNumber && !current.beforeStart && <Button variant="ghost" size="sm" onClick={() => setWeekNo(current.weekNumber)}>Back to this week</Button>}

      {week && (
        <Card title={week.title} action={<IconButton label="Edit week details" onClick={() => setEditWeek(week)}><Pencil size={18} aria-hidden /></IconButton>}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Pill tone="info">{week.phase}</Pill>
              {week.bpProtocolWeek && <Pill tone="info">7-day BP monitoring week</Pill>}
              {adh.percent != null && <Pill tone={adh.percent >= 70 ? 'ok' : 'neutral'}>{adh.percent}% done so far</Pill>}
            </div>
            <Section title="Objectives"><ul className="list-disc space-y-1 pl-5">{week.objectives.map((o) => <li key={o}>{o}</li>)}</ul></Section>
            <Section title="Exercise">{week.exerciseSchedule}</Section>
            <Section title="Nutrition focus">{week.nutritionFocus}</Section>
            <Section title="Recovery">{week.recoveryAdvice}</Section>
            <Section title="Measurements"><ul className="list-disc pl-5">{week.measurementReminders.map((m) => <li key={m}>{m}</li>)}</ul></Section>
            <Section title="Review questions"><ul className="list-disc pl-5">{week.reviewPrompts.map((m) => <li key={m}>{m}</li>)}</ul></Section>
            {week.notes && <Section title="Your notes">{week.notes}</Section>}
            <Notice tone="warn" title="Safety">{week.cautions.map((c) => <p key={c}>{c}</p>)}</Notice>
          </div>
        </Card>
      )}

      {days.map(({ date, occ }) => {
        const pos = programmePosition(engine.startDate, date);
        return (
          <Card key={date} title={<>{formatDateShort(date)} <span className="font-normal text-muted">· day {pos.day}</span>{date === engine.today && <span className="ml-2"><Pill tone="info">Today</Pill></span>}</>}
            action={<IconButton label={`Add task on ${formatDateShort(date)}`} onClick={() => setEditAct({ weekNumber: templateWeekNumber(n), day: pos.day, category: 'aerobic', optional: false, title: '', instructions: '' })}><Plus size={18} aria-hidden /></IconButton>}>
            {occ.length === 0 ? <Empty>Rest day – nothing scheduled.</Empty> : (
              <ul className="space-y-2">
                {occ.map((o) => <TaskRow key={o.key} o={o} today={engine.today} />)}
              </ul>
            )}
            {occ.length > 0 && (
              <details className="mt-2">
                <summary className="min-h-10 cursor-pointer py-2 text-sm text-muted">Edit this day’s tasks</summary>
                <ul className="flex flex-wrap gap-2">{occ.map((o) => <li key={o.key}><Button size="sm" variant="secondary" onClick={() => setEditAct(o.activity)}>{o.activity.title}</Button></li>)}</ul>
              </details>
            )}
          </Card>
        );
      })}

      <Card title="Programme template">
        <p className="mb-3 text-sm text-muted">Edits change every future occurrence of a task in that week{n > PROGRAMME_WEEKS ? ' (maintenance applies to every week after 12)' : ''}. Completed history is kept.</p>
        <Button variant="secondary" onClick={() => setConfirmReset(true)}><RotateCcw size={16} aria-hidden /> Restore default plan</Button>
      </Card>

      {editWeek && <WeekEditor week={editWeek} onClose={() => setEditWeek(null)} />}
      {editAct && <ActivityEditor initial={editAct} onClose={() => setEditAct(null)} />}
      <ConfirmSheet open={confirmReset} title="Restore default plan?" danger confirmLabel="Restore"
        body={<><p>Your edits to weeks and tasks will be replaced with the default 12-week plan.</p><p>Your measurements and completion history are not affected.</p></>}
        onClose={() => setConfirmReset(false)} onConfirm={async () => { await resetProgrammeToDefault(); setConfirmReset(false); toast('Default plan restored'); }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3><div className="mt-0.5">{children}</div></div>;
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function WeekEditor({ week, onClose }: { week: ProgrammeWeek; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(week.title);
  const [objectives, setObjectives] = useState(week.objectives.join('\n'));
  const [exercise, setExercise] = useState(week.exerciseSchedule);
  const [nutrition, setNutrition] = useState(week.nutritionFocus);
  const [recovery, setRecovery] = useState(week.recoveryAdvice);
  const [notes, setNotes] = useState(week.notes ?? '');
  const [err, setErr] = useState('');
  return (
    <Sheet open onClose={onClose} title={`Edit ${week.weekNumber === 0 ? 'maintenance week' : `week ${week.weekNumber}`}`} footer={<Button className="flex-1" onClick={async () => {
      try { await saveWeek({ ...week, title: title.trim() || week.title, objectives: lines(objectives), exerciseSchedule: exercise, nutritionFocus: nutrition, recoveryAdvice: recovery, ...(notes.trim() ? { notes: notes.trim() } : { notes: undefined }) }); toast('Week updated'); onClose(); }
      catch (e) { setErr((e as Error).message); }
    }}>Save</Button>}>
      <div className="space-y-3">
        <Field label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <TextArea label="Objectives (one per line)" value={objectives} onChange={setObjectives} rows={5} />
        <TextArea label="Exercise schedule" value={exercise} onChange={setExercise} />
        <TextArea label="Nutrition focus" value={nutrition} onChange={setNutrition} />
        <TextArea label="Recovery advice" value={recovery} onChange={setRecovery} />
        <TextArea label="Your notes" value={notes} onChange={setNotes} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}

function ActivityEditor({ initial, onClose }: { initial: Partial<ScheduledActivity>; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial.title ?? '');
  const [category, setCategory] = useState<ActivityCategory>(initial.category ?? 'aerobic');
  const [day, setDay] = useState(String(initial.day ?? 1));
  const [instructions, setInstructions] = useState(initial.instructions ?? '');
  const [target, setTarget] = useState(initial.targetMinutes != null ? String(initial.targetMinutes) : '');
  const [optional, setOptional] = useState(initial.optional ?? false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const isNew = !initial.id;

  async function save() {
    if (!title.trim()) { setErr('Enter a title.'); return; }
    const t = target ? Number(target) : undefined;
    if (t != null && (!Number.isInteger(t) || t < 0 || t > 600)) { setErr('Target minutes must be 0–600.'); return; }
    let verification = initial.verification;
    if (category !== initial.category || (verification?.kind === 'exercise' && t != null)) {
      verification = category === 'aerobic' ? { kind: 'exercise', types: ['walking', 'running', 'cycling', 'swimming', 'other'], minMinutes: t ?? 10 }
        : category === 'strength' ? { kind: 'exercise', types: ['strength'], minMinutes: t ?? 10 }
        : category === 'mobility' ? { kind: 'exercise', types: ['mobility'], minMinutes: t ?? 5 }
        : category === 'weight' ? { kind: 'weight' } : category === 'waist' ? { kind: 'waist' } : category === 'sleep' ? { kind: 'sleep' }
        : category === 'nutrition' ? { kind: 'nutrition' } : category === 'review' ? { kind: 'review' } : category === 'bp' ? (initial.verification ?? { kind: 'bp', period: 'AM', minReadings: 2 }) : undefined;
    }
    try {
      await saveActivity({
        ...(initial.id ? { id: initial.id } : {}), weekNumber: initial.weekNumber ?? 1, day: Number(day), title: title.trim(), category,
        instructions: instructions.trim(), optional, ...(t != null ? { targetMinutes: t } : {}), ...(verification ? { verification } : {}),
      });
      toast(isNew ? 'Task added' : 'Task updated');
      onClose();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <Sheet open onClose={onClose} title={isNew ? 'Add task' : 'Edit task'} footer={<>{!isNew && <Button variant="danger" onClick={() => setConfirm(true)}>Remove</Button>}<Button className="flex-1" onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={category} onChange={(e) => setCategory(e.target.value as ActivityCategory)}>{CATS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}</Select>
            <Select label="Programme day" value={day} onChange={(e) => setDay(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>Day {d}</option>)}</Select>
          </div>
          <Field label="Target minutes (optional)" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} />
          <TextArea label="Instructions" value={instructions} onChange={setInstructions} rows={4} />
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={optional} onChange={(e) => setOptional(e.target.checked)} /> Optional (not counted in adherence)</label>
          <p className="text-xs text-muted">Applies to {initial.weekNumber === 0 ? 'every maintenance week' : `week ${initial.weekNumber}`}. Don’t increase load through pain or worrying symptoms.</p>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
      </Sheet>
      <ConfirmSheet open={confirm} title="Remove task?" confirmLabel="Remove" danger body={<p>It will no longer be scheduled. Past completions are kept.</p>} onClose={() => setConfirm(false)} onConfirm={async () => { await archiveActivity(initial.id!); setConfirm(false); onClose(); toast('Task removed'); }} />
    </>
  );
}


