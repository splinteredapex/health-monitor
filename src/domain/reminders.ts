import type { ReminderPrefs } from '../db/schemas';
import { toLocalTime, toLocalDate } from '../lib/dates';
import { occurrencesForDate, programmePosition, type EngineInput } from './programme';

export type ReminderKind = 'bp-am' | 'bp-pm' | 'exercise' | 'weigh-in' | 'weekly-review';
export interface DueReminder { kind: ReminderKind; time: string; text: string }

/** Reminders that are due (time passed) and whose task for today is still open. */
export function dueReminders(prefs: ReminderPrefs, input: EngineInput, now: Date): DueReminder[] {
  if (!prefs.enabled) return [];
  const today = toLocalDate(now);
  const time = toLocalTime(now);
  const occ = occurrencesForDate(today, input);
  const open = (pred: (o: (typeof occ)[number]) => boolean) => occ.some((o) => pred(o) && (o.status === 'pending' || o.status === 'missed'));
  const out: DueReminder[] = [];
  const pos = programmePosition(input.startDate, today);
  const check = (kind: ReminderKind, at: string, text: string, pred: (o: (typeof occ)[number]) => boolean) => {
    if (time >= at && open(pred)) out.push({ kind, time: at, text });
  };
  check('bp-am', prefs.bpMorning, 'Morning blood pressure readings are due.', (o) => o.activity.verification?.kind === 'bp' && o.activity.verification.period === 'AM');
  check('bp-pm', prefs.bpEvening, 'Evening blood pressure readings are due.', (o) => o.activity.verification?.kind === 'bp' && o.activity.verification.period === 'PM');
  check('exercise', prefs.exercise, 'Today’s planned exercise is still open.', (o) => o.activity.category === 'aerobic' || o.activity.category === 'strength');
  if (pos.day === prefs.weighInDay) check('weigh-in', '00:00', 'Weekly weigh-in is due today.', (o) => o.activity.category === 'weight');
  if (pos.day === prefs.weeklyReviewDay) check('weekly-review', '00:00', 'Weekly review is due today.', (o) => o.activity.category === 'review');
  return out;
}
