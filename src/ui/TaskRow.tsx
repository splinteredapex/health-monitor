import { useState } from 'react';
import { Activity, Bed, CalendarClock, Check, ChevronDown, ClipboardList, Dumbbell, HeartPulse, Ruler, Salad, Scale, Stethoscope, StretchHorizontal, Undo2, type LucideIcon } from 'lucide-react';
import type { ActivityCategory } from '../db/schemas';
import type { Occurrence, OccurrenceStatus } from '../domain/programme';
import { markDone, markSkipped, reschedule, setCompletionNote, undoCompletion } from '../db/repo';
import { addDays, formatDateShort, formatDateUK, type LocalDate } from '../lib/dates';
import { Button, Field, Pill, Sheet, TextArea, cx, useToast, type Tone } from './primitives';
import { navigate } from './router';

export const CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  bp: HeartPulse, aerobic: Activity, strength: Dumbbell, mobility: StretchHorizontal, weight: Scale, waist: Ruler,
  sleep: Bed, nutrition: Salad, review: ClipboardList, medical: Stethoscope, lifestyle: Salad,
};

const RECORD_TAB: Partial<Record<ActivityCategory, string>> = { bp: 'bp', aerobic: 'exercise', strength: 'exercise', mobility: 'exercise', weight: 'body', waist: 'body', sleep: 'sleep', nutrition: 'lifestyle' };

export const STATUS: Record<OccurrenceStatus, { label: string; tone: Tone }> = {
  verified: { label: 'Verified by measurement', tone: 'ok' },
  done: { label: 'Done (self-confirmed)', tone: 'ok' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  missed: { label: 'Not done', tone: 'warn' },
  pending: { label: 'To do', tone: 'info' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
};

export function TaskRow({ o, today }: { o: Occurrence; today: LocalDate }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<null | 'reschedule' | 'note' | 'skip'>(null);
  const [moveTo, setMoveTo] = useState(addDays(o.date, 1));
  const [note, setNote] = useState(o.completion?.notes ?? '');
  const [reason, setReason] = useState('');
  const Icon = CATEGORY_ICON[o.activity.category];
  const s = STATUS[o.status];
  const isDone = o.status === 'done' || o.status === 'verified';
  const future = o.date > today;
  const a = o.activity;
  const tab = RECORD_TAB[a.category];

  const act = async (fn: () => Promise<void>, msg: string) => {
    try { await fn(); toast(msg); } catch { toast('Could not save', 'danger'); }
  };

  return (
    <li className={cx('rounded-xl border border-border bg-surface', isDone && 'bg-surface-2/60')}>
      <div className="flex items-center gap-2 p-2 pl-2">
        {o.status === 'verified' ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok-bg text-ok" title="Verified by measurement"><Check size={20} aria-hidden /></span>
        ) : future ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><Icon size={18} aria-hidden /></span>
        ) : (
          <button
            type="button"
            aria-pressed={isDone}
            aria-label={isDone ? `Undo "${a.title}"` : `Mark "${a.title}" done`}
            onClick={() => (isDone || o.status === 'skipped' ? act(() => undoCompletion(a.id, o.dueDate), 'Undone') : act(() => markDone(a.id, o.dueDate), 'Marked done'))}
            className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors', isDone ? 'border-ok bg-ok text-white dark:text-black' : 'border-border text-primary hover:border-primary')}
          >
            {isDone ? <Check size={20} aria-hidden /> : o.status === 'skipped' ? <Undo2 size={18} aria-hidden /> : <Icon size={18} aria-hidden />}
          </button>
        )}
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className={cx('block font-medium leading-snug', isDone && 'text-muted')}>
              {a.title}
              {a.optional && <span className="ml-1 text-xs font-normal text-muted">(optional)</span>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Pill tone={s.tone}>{s.label}</Pill>
              {o.verifiedBy && <span className="text-xs text-muted">{o.verifiedBy}</span>}
              {o.movedIn && <span className="text-xs text-muted">Moved from {formatDateUK(o.dueDate)}</span>}
            </span>
            <span className="sr-only">{open ? 'Hide details' : 'Show details and options'}</span>
          </span>
          <ChevronDown size={20} aria-hidden className={cx('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
          <p>{a.instructions}</p>
          <div className="flex flex-wrap gap-2">
            {tab && !isDone && !future && <Button size="sm" onClick={() => navigate('record', tab)}>Record now</Button>}
            {!isDone && o.status !== 'skipped' && <Button size="sm" variant="secondary" onClick={() => setSheet('skip')}>Skip</Button>}
            {!isDone && <Button size="sm" variant="secondary" onClick={() => setSheet('reschedule')}><CalendarClock size={16} aria-hidden /> Move</Button>}
            <Button size="sm" variant="secondary" onClick={() => setSheet('note')}>Note</Button>
          </div>
          {a.targetMinutes != null && <p className="text-muted">Target: {a.targetMinutes} min</p>}
          {o.completion?.notes && <p className="rounded-lg bg-surface-2 p-2"><span className="font-medium">Note:</span> {o.completion.notes}</p>}
          {o.completion?.history.length ? (
            <div>
              <p className="font-medium">History</p>
              <ul className="text-muted">
                {o.completion.history.slice(-8).reverse().map((h, i) => (
                  <li key={i}>{new Date(h.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })} – {h.action}{h.detail ? ` (${h.detail})` : ''}</li>
                ))}
              </ul>
            </div>
          ) : <p className="text-muted">No history yet.</p>}
        </div>
      )}

      <Sheet open={sheet === 'reschedule'} onClose={() => setSheet(null)} title="Move task" footer={<Button className="flex-1" onClick={async () => { await act(() => reschedule(a.id, o.dueDate, moveTo), `Moved to ${formatDateShort(moveTo)}`); setSheet(null); }}>Move</Button>}>
        <Field label="New date" type="date" value={moveTo} min={o.dueDate} onChange={(e) => setMoveTo(e.target.value)} hint="Moving a task never changes your programme week." />
      </Sheet>
      <Sheet open={sheet === 'skip'} onClose={() => setSheet(null)} title="Skip task" footer={<Button className="flex-1" onClick={async () => { await act(() => markSkipped(a.id, o.dueDate, reason), 'Skipped'); setSheet(null); }}>Skip</Button>}>
        <p className="mb-3 text-sm text-muted">Skipping is fine – especially for pain, illness or poor sleep. Never push through concerning symptoms.</p>
        <TextArea label="Reason (optional)" value={reason} onChange={setReason} />
      </Sheet>
      <Sheet open={sheet === 'note'} onClose={() => setSheet(null)} title="Task note" footer={<Button className="flex-1" onClick={async () => { await act(() => setCompletionNote(a.id, o.dueDate, note), 'Note saved'); setSheet(null); }}>Save note</Button>}>
        <TextArea label="Note" value={note} onChange={setNote} rows={4} />
      </Sheet>
    </li>
  );
}
