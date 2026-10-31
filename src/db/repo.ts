/**
 * Repository: the only place UI code writes to IndexedDB. Every write is
 * schema-validated so invalid data can never be persisted.
 */
import type { ZodType } from 'zod';
import { db } from './db';
import {
  activityCompletionSchema, bpReadingSchema, dailyMetricSchema, exerciseSchema, healthGoalsSchema, nutritionSchema,
  programmeWeekSchema, scheduledActivitySchema, sleepSchema, userProfileSchema, waistSchema, weeklyReviewSchema, weightSchema,
  type ActivityCompletion, type BloodPressureReading, type DailyMetric, type ExerciseSession, type HealthGoals, type NutritionRecord,
  type ProgrammeWeek, type ScheduledActivity, type SleepRecord, type UserProfile, type WaistMeasurement, type WeeklyReview,
  type WeightMeasurement,
} from './schemas';
import { buildDefaultProgramme, PROGRAMME_ID } from '../programme/template';
import { newId } from '../lib/id';
import type { LocalDate } from '../lib/dates';
import { occurrenceKey } from '../domain/programme';

export class ValidationError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super(issues.map((i) => i.message).join('; '));
    this.name = 'ValidationError';
  }
}

function validate<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

export const DEFAULT_GOALS = (now: number): HealthGoals => ({
  id: 'goals',
  updatedAt: now,
  weeklyAerobicMinutes: 150,
  weeklyStrengthSessions: 2,
  sleepTargetMinHours: 7,
  sleepTargetMaxHours: 9,
  weeklyAlcoholUnitsMax: 14,
  dailyFruitVegPortions: 5,
  dailySaltMaxG: 6,
  dailyFluidsL: 2,
  dailyCaffeineMaxMg: 400,
});

export const DEFAULT_REMINDERS: UserProfile['reminders'] = {
  enabled: false,
  notifications: false,
  bpMorning: '07:30',
  bpEvening: '20:30',
  exercise: '18:00',
  weighInDay: 1,
  weeklyReviewDay: 7,
};

/* -------- Profile / goals / programme -------- */

export async function completeOnboarding(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt' | 'onboardedAt'>, goals: Partial<HealthGoals>, now = Date.now()) {
  const p = validate(userProfileSchema, { ...profile, id: 'profile', createdAt: now, updatedAt: now, onboardedAt: now });
  const g = validate(healthGoalsSchema, { ...DEFAULT_GOALS(now), ...goals, id: 'goals', updatedAt: now });
  const prog = buildDefaultProgramme(now);
  await db.transaction('rw', [db.userProfile, db.healthGoals, db.programmes, db.programmeWeeks, db.scheduledActivities, db.weights, db.waists], async () => {
    await db.userProfile.put(p);
    await db.healthGoals.put(g);
    if (!(await db.programmes.get(PROGRAMME_ID))) {
      await db.programmes.put(prog.programme);
      await db.programmeWeeks.bulkPut(prog.weeks);
      await db.scheduledActivities.bulkPut(prog.activities);
    }
  });
  return p;
}

export async function saveProfile(patch: Partial<UserProfile>) {
  const cur = await db.userProfile.get('profile');
  if (!cur) throw new Error('Profile not found');
  const next = validate(userProfileSchema, { ...cur, ...patch, id: 'profile', updatedAt: Date.now() });
  await db.userProfile.put(next);
  return next;
}

export async function saveGoals(patch: Partial<HealthGoals>) {
  const cur = (await db.healthGoals.get('goals')) ?? DEFAULT_GOALS(Date.now());
  const next = validate(healthGoalsSchema, { ...cur, ...patch, id: 'goals', updatedAt: Date.now() });
  if (next.sleepTargetMinHours > next.sleepTargetMaxHours) throw new ValidationError([{ path: 'sleepTargetMinHours', message: 'Minimum sleep target must not exceed maximum' }]);
  await db.healthGoals.put(next);
  return next;
}

export async function resetProgrammeToDefault() {
  const prog = buildDefaultProgramme(Date.now());
  await db.transaction('rw', [db.programmes, db.programmeWeeks, db.scheduledActivities], async () => {
    await db.programmeWeeks.where('programmeId').equals(PROGRAMME_ID).delete();
    await db.scheduledActivities.where('programmeId').equals(PROGRAMME_ID).delete();
    await db.programmes.put(prog.programme);
    await db.programmeWeeks.bulkPut(prog.weeks);
    await db.scheduledActivities.bulkPut(prog.activities);
  });
}

export async function saveWeek(w: ProgrammeWeek) {
  await db.programmeWeeks.put(validate(programmeWeekSchema, { ...w, updatedAt: Date.now() }));
}

export async function saveActivity(a: Omit<ScheduledActivity, 'id' | 'updatedAt' | 'order' | 'programmeId' | 'archived'> & Partial<Pick<ScheduledActivity, 'id' | 'order' | 'archived'>>) {
  const id = a.id ?? `${PROGRAMME_ID}:custom:${newId()}`;
  const cur = a.id ? await db.scheduledActivities.get(a.id) : undefined;
  const row = validate(scheduledActivitySchema, { archived: false, order: 50, ...cur, ...a, id, programmeId: PROGRAMME_ID, updatedAt: Date.now() });
  await db.scheduledActivities.put(row);
  return row;
}

/** Archive rather than delete so historic completions keep their context. */
export async function archiveActivity(id: string) {
  await db.scheduledActivities.update(id, { archived: true, updatedAt: Date.now() });
}

/* -------- Checklist completions -------- */

async function upsertCompletion(activityId: string, dueDate: LocalDate, mutate: (c: ActivityCompletion) => void) {
  const id = occurrenceKey(activityId, dueDate);
  await db.transaction('rw', db.activityCompletions, async () => {
    const now = Date.now();
    const c: ActivityCompletion = (await db.activityCompletions.get(id)) ?? { id, activityId, dueDate, status: 'pending', history: [], updatedAt: now };
    mutate(c);
    c.updatedAt = now;
    if (c.history.length > 200) c.history = c.history.slice(-200);
    await db.activityCompletions.put(validate(activityCompletionSchema, c));
  });
}

export const markDone = (activityId: string, dueDate: LocalDate) =>
  upsertCompletion(activityId, dueDate, (c) => { c.status = 'done'; c.completedAt = Date.now(); c.history.push({ at: Date.now(), action: 'done' }); });

export const markSkipped = (activityId: string, dueDate: LocalDate, reason?: string) =>
  upsertCompletion(activityId, dueDate, (c) => { c.status = 'skipped'; delete c.completedAt; c.history.push({ at: Date.now(), action: 'skipped', ...(reason ? { detail: reason.slice(0, 300) } : {}) }); });

export const undoCompletion = (activityId: string, dueDate: LocalDate) =>
  upsertCompletion(activityId, dueDate, (c) => { c.status = 'pending'; delete c.completedAt; c.history.push({ at: Date.now(), action: 'undone' }); });

export const reschedule = (activityId: string, dueDate: LocalDate, to: LocalDate) =>
  upsertCompletion(activityId, dueDate, (c) => {
    if (to === dueDate) delete c.rescheduledTo; else c.rescheduledTo = to;
    c.history.push({ at: Date.now(), action: 'rescheduled', detail: `to ${to}` });
  });

export const setCompletionNote = (activityId: string, dueDate: LocalDate, note: string) =>
  upsertCompletion(activityId, dueDate, (c) => { c.notes = note.slice(0, 2000) || undefined; c.history.push({ at: Date.now(), action: 'note' }); });

/* -------- Generic record CRUD -------- */

type Stamped = { id: string; createdAt: number; updatedAt: number };
type Input<T extends Stamped> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'source'> & Partial<Pick<T, 'id'>> & { source?: T extends { source: infer S } ? S : never };

function crud<T extends Stamped>(table: () => import('dexie').Table<T, string>, schema: ZodType<T>) {
  return {
    async save(input: Input<T>): Promise<T> {
      const now = Date.now();
      const existing = input.id ? await table().get(input.id) : undefined;
      const row = validate(schema, { source: 'manual', ...existing, ...input, id: input.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now });
      await table().put(row);
      return row;
    },
    async remove(id: string) {
      await table().delete(id);
    },
  };
}

export const bpRepo = crud<BloodPressureReading>(() => db.bloodPressure, bpReadingSchema);
export const weightRepo = crud<WeightMeasurement>(() => db.weights, weightSchema);
export const waistRepo = crud<WaistMeasurement>(() => db.waists, waistSchema);
export const exerciseRepo = crud<ExerciseSession>(() => db.exercise, exerciseSchema);
export const sleepRepo = crud<SleepRecord>(() => db.sleep, sleepSchema);
export const nutritionRepo = crud<NutritionRecord>(() => db.nutrition, nutritionSchema);
export const dailyMetricRepo = crud<DailyMetric>(() => db.dailyMetrics, dailyMetricSchema);

/** Save several BP readings from one sitting atomically, sharing a session id. */
export async function saveBpSession(readings: Input<BloodPressureReading>[]) {
  const sessionId = newId();
  const now = Date.now();
  const rows = readings.map((r) => validate(bpReadingSchema, { source: 'manual', ...r, id: newId(), sessionId, createdAt: now, updatedAt: now }));
  await db.bloodPressure.bulkAdd(rows);
  return rows;
}

export async function saveWeeklyReview(r: Omit<WeeklyReview, 'id' | 'updatedAt'>) {
  const row = validate(weeklyReviewSchema, { ...r, id: `review-w${r.weekNumber}`, updatedAt: Date.now() });
  await db.weeklyReviews.put(row);
  return row;
}

/** Nutrition is one record per local date. */
export async function saveNutritionForDate(localDate: LocalDate, patch: Partial<Omit<NutritionRecord, 'id' | 'localDate'>>) {
  const cur = await db.nutrition.where('localDate').equals(localDate).first();
  const blank = { fruitVegPortions: null, alcoholUnits: null, drinks: [], caffeineMg: null, saltG: null, fluidsL: null, targetsMet: { lowSalt: null, wholeFoods: null, noLateEating: null } };
  return nutritionRepo.save({ ...blank, ...cur, ...patch, localDate } as Input<NutritionRecord>);
}

export async function saveDailyMetricForDate(localDate: LocalDate, patch: Partial<Pick<DailyMetric, 'restingHr' | 'steps' | 'source' | 'notes'>>) {
  const cur = await db.dailyMetrics.where('localDate').equals(localDate).first();
  return dailyMetricRepo.save({ ...cur, ...patch, localDate } as Input<DailyMetric>);
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
