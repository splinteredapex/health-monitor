/**
 * Programme engine: calendar-based progression, occurrences, verification and adherence.
 * Missed tasks never block progression – the week is purely a function of the date.
 */
import type {
  ActivityCompletion, BloodPressureReading, ExerciseSession, NutritionRecord, ProgrammeWeek, ScheduledActivity,
  SleepRecord, WaistMeasurement, WeeklyReview, WeightMeasurement,
} from '../db/schemas';
import { addDays, compareDates, dateRange, diffDays, type LocalDate } from '../lib/dates';
import { PROGRAMME_WEEKS } from '../programme/template';
import { countsAsHome } from './bp';

export interface ProgrammePosition {
  beforeStart: boolean;
  /** 1-based programme week (continues past 12 into maintenance). 0 if before start. */
  weekNumber: number;
  /** 1..7 programme day within the week. 0 if before start. */
  day: number;
  /** 0-based days since start. Negative before start. */
  dayIndex: number;
  inMaintenance: boolean;
  weekStart: LocalDate;
  weekEnd: LocalDate;
}

export function programmePosition(startDate: LocalDate, date: LocalDate): ProgrammePosition {
  const dayIndex = diffDays(startDate, date);
  if (dayIndex < 0) {
    return { beforeStart: true, weekNumber: 0, day: 0, dayIndex, inMaintenance: false, weekStart: startDate, weekEnd: addDays(startDate, 6) };
  }
  const weekNumber = Math.floor(dayIndex / 7) + 1;
  const weekStart = addDays(startDate, (weekNumber - 1) * 7);
  return { beforeStart: false, weekNumber, day: (dayIndex % 7) + 1, dayIndex, inMaintenance: weekNumber > PROGRAMME_WEEKS, weekStart, weekEnd: addDays(weekStart, 6) };
}

export function weekDates(startDate: LocalDate, weekNumber: number): { start: LocalDate; end: LocalDate } {
  const start = addDays(startDate, (weekNumber - 1) * 7);
  return { start, end: addDays(start, 6) };
}

/** Programme week template used for a calendar week (maintenance = week 0). */
export const templateWeekNumber = (weekNumber: number) => (weekNumber > PROGRAMME_WEEKS ? 0 : weekNumber);

export function findWeek(weeks: readonly ProgrammeWeek[], weekNumber: number): ProgrammeWeek | undefined {
  return weeks.find((w) => w.weekNumber === templateWeekNumber(weekNumber));
}

export const occurrenceKey = (activityId: string, dueDate: LocalDate) => `${activityId}@${dueDate}`;

export interface RecordData {
  bp: readonly BloodPressureReading[];
  weights: readonly WeightMeasurement[];
  waists: readonly WaistMeasurement[];
  exercise: readonly ExerciseSession[];
  sleep: readonly SleepRecord[];
  nutrition: readonly NutritionRecord[];
  reviews: readonly WeeklyReview[];
}

export type OccurrenceStatus = 'verified' | 'done' | 'skipped' | 'pending' | 'missed' | 'upcoming';

export interface Occurrence {
  key: string;
  activity: ScheduledActivity;
  dueDate: LocalDate;
  /** Date the occurrence is shown on (rescheduled date if moved). */
  date: LocalDate;
  movedIn: boolean;
  completion: ActivityCompletion | undefined;
  status: OccurrenceStatus;
  verifiedBy: string | null;
}

function nutritionRecorded(n: NutritionRecord): boolean {
  return [n.fruitVegPortions, n.alcoholUnits, n.caffeineMg, n.saltG, n.fluidsL].some((v) => v !== null) ||
    Object.values(n.targetsMet).some((v) => v !== null);
}

/** Returns a human description of the measurement that verifies the task, or null. */
export function verify(activity: ScheduledActivity, date: LocalDate, data: RecordData, startDate: LocalDate): string | null {
  const v = activity.verification;
  if (!v) return null;
  switch (v.kind) {
    case 'bp': {
      const n = data.bp.filter((r) => r.localDate === date && r.period === v.period && countsAsHome(r)).length;
      return n >= v.minReadings ? `${n} ${v.period === 'AM' ? 'morning' : 'evening'} reading${n === 1 ? '' : 's'} recorded` : null;
    }
    case 'weight':
      return data.weights.some((w) => w.localDate === date) ? 'Weight recorded' : null;
    case 'waist':
      return data.waists.some((w) => w.localDate === date) ? 'Waist recorded' : null;
    case 'exercise': {
      const s = data.exercise.find((e) => e.localDate === date && v.types.includes(e.type) && e.durationMin >= v.minMinutes);
      return s ? `${s.durationMin} min ${s.type} logged` : null;
    }
    case 'sleep':
      return data.sleep.some((s) => s.wakeDate === date) ? 'Sleep logged' : null;
    case 'nutrition': {
      const n = data.nutrition.find((x) => x.localDate === date);
      return n && nutritionRecorded(n) ? 'Nutrition logged' : null;
    }
    case 'review': {
      const pos = programmePosition(startDate, date);
      return data.reviews.some((r) => r.weekNumber === pos.weekNumber) ? 'Review saved' : null;
    }
  }
}

function statusFor(c: ActivityCompletion | undefined, verifiedBy: string | null, date: LocalDate, today: LocalDate): OccurrenceStatus {
  if (c?.status === 'done') return 'done';
  if (c?.status === 'skipped') return 'skipped';
  if (verifiedBy) return 'verified';
  const cmp = compareDates(date, today);
  return cmp < 0 ? 'missed' : cmp === 0 ? 'pending' : 'upcoming';
}

export interface EngineInput {
  startDate: LocalDate;
  activities: readonly ScheduledActivity[];
  completions: readonly ActivityCompletion[];
  data: RecordData;
  today: LocalDate;
}

/** All task occurrences shown on `date`, including tasks rescheduled onto it. */
export function occurrencesForDate(date: LocalDate, input: EngineInput): Occurrence[] {
  const { startDate, activities, completions, data, today } = input;
  const pos = programmePosition(startDate, date);
  const byKey = new Map(completions.map((c) => [c.id, c]));
  const actById = new Map(activities.map((a) => [a.id, a]));
  const out: Occurrence[] = [];

  if (!pos.beforeStart) {
    const tw = templateWeekNumber(pos.weekNumber);
    for (const a of activities) {
      if (a.archived || a.weekNumber !== tw || a.day !== pos.day) continue;
      const key = occurrenceKey(a.id, date);
      const c = byKey.get(key);
      if (c?.rescheduledTo && c.rescheduledTo !== date) continue; // moved away
      const verifiedBy = verify(a, date, data, startDate);
      out.push({ key, activity: a, dueDate: date, date, movedIn: false, completion: c, status: statusFor(c, verifiedBy, date, today), verifiedBy });
    }
  }
  for (const c of completions) {
    if (c.rescheduledTo !== date || c.dueDate === date) continue;
    const a = actById.get(c.activityId);
    if (!a || a.archived) continue;
    const verifiedBy = verify(a, date, data, startDate);
    out.push({ key: c.id, activity: a, dueDate: c.dueDate, date, movedIn: true, completion: c, status: statusFor(c, verifiedBy, date, today), verifiedBy });
  }
  return out.sort((x, y) => x.activity.day - y.activity.day || categoryRank(x.activity.category) - categoryRank(y.activity.category) || x.activity.order - y.activity.order);
}

const RANK = ['medical', 'bp', 'weight', 'waist', 'aerobic', 'strength', 'mobility', 'sleep', 'nutrition', 'lifestyle', 'review'];
const categoryRank = (c: string) => RANK.indexOf(c);

export interface Adherence {
  due: number;
  completed: number; // done + verified
  verified: number;
  manual: number;
  skipped: number;
  missed: number;
  pending: number;
  optionalCompleted: number;
  /** completed / due, 0..100; null if nothing due yet. Optional tasks excluded. */
  percent: number | null;
}

/** Adherence over [from, to] (inclusive), counting only dates up to and including today. */
export function adherence(from: LocalDate, to: LocalDate, input: EngineInput): Adherence {
  const end = compareDates(to, input.today) > 0 ? input.today : to;
  const res: Adherence = { due: 0, completed: 0, verified: 0, manual: 0, skipped: 0, missed: 0, pending: 0, optionalCompleted: 0, percent: null };
  if (compareDates(end, from) < 0) return res;
  for (const d of dateRange(from, end)) {
    for (const o of occurrencesForDate(d, input)) {
      const done = o.status === 'done' || o.status === 'verified';
      if (o.activity.optional) {
        if (done) res.optionalCompleted++;
        continue;
      }
      res.due++;
      if (o.status === 'verified') { res.verified++; res.completed++; }
      else if (o.status === 'done') { res.manual++; res.completed++; }
      else if (o.status === 'skipped') res.skipped++;
      else if (o.status === 'missed') res.missed++;
      else if (o.status === 'pending') res.pending++;
    }
  }
  res.percent = res.due ? Math.round((res.completed / res.due) * 100) : null;
  return res;
}

/** Default BP protocol window start for the current or most recent protocol week. */
export function latestProtocolStart(startDate: LocalDate, today: LocalDate, weeks: readonly ProgrammeWeek[]): LocalDate | null {
  const pos = programmePosition(startDate, today);
  if (pos.beforeStart) return null;
  const protocolWeeks = weeks.filter((w) => w.bpProtocolWeek && w.weekNumber > 0).map((w) => w.weekNumber).filter((n) => n <= pos.weekNumber);
  if (!protocolWeeks.length) return null;
  return weekDates(startDate, Math.max(...protocolWeeks)).start;
}
