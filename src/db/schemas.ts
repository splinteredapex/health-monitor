/**
 * Canonical record schemas. Used for (1) TypeScript types, (2) validating every
 * write through the repository layer and (3) validating untrusted JSON imports.
 */
import { z } from 'zod';
import { isLocalDate, isLocalTime } from '../lib/dates';

export const localDate = z.string().refine(isLocalDate, 'Invalid date (YYYY-MM-DD)');
export const localTime = z.string().refine(isLocalTime, 'Invalid time (HH:mm)');
const id = z.string().min(1).max(100);
const notes = z.string().max(2000).optional();
const epoch = z.number().int().nonnegative();
/** Offset in minutes from UTC (e.g. +60 for BST), as recorded on the device. */
const tzOffset = z.number().int().min(-14 * 60).max(14 * 60);
/** Where a record came from. 'watch' is reserved for wearable imports. */
export const sourceSchema = z.enum(['manual', 'watch', 'import']);

const base = {
  id,
  createdAt: epoch,
  updatedAt: epoch,
  source: sourceSchema.default('manual'),
  notes,
};

export const themeSchema = z.enum(['system', 'light', 'dark']);

export const reminderPrefsSchema = z.object({
  enabled: z.boolean(),
  notifications: z.boolean(),
  bpMorning: localTime,
  bpEvening: localTime,
  exercise: localTime,
  weighInDay: z.number().int().min(1).max(7), // programme day of week
  weeklyReviewDay: z.number().int().min(1).max(7),
});

export const userProfileSchema = z.object({
  id: z.literal('profile'),
  createdAt: epoch,
  updatedAt: epoch,
  sex: z.enum(['male', 'female', 'other', 'unspecified']),
  dateOfBirth: localDate.optional(),
  heightCm: z.number().min(100).max(250),
  baselineWeightKg: z.number().min(30).max(300),
  baselineWaistCm: z.number().min(40).max(200).optional(),
  baselineSystolic: z.number().int().min(70).max(260).optional(),
  baselineDiastolic: z.number().int().min(40).max(160).optional(),
  programmeStartDate: localDate,
  injuryNotes: z.string().max(2000).optional(),
  medicalNotes: z.string().max(2000).optional(),
  theme: themeSchema.default('system'),
  reminders: reminderPrefsSchema,
  disclaimerAcceptedAt: epoch.optional(),
  healthConnect: z.object({ enabled: z.boolean(), lastSyncAt: epoch.optional(), lastResult: z.string().max(500).optional() }).optional(),
  onboardedAt: epoch.optional(),
});

export const healthGoalsSchema = z.object({
  id: z.literal('goals'),
  updatedAt: epoch,
  targetWeightKg: z.number().min(30).max(300).optional(),
  targetWaistCm: z.number().min(40).max(200).optional(),
  weeklyAerobicMinutes: z.number().int().min(0).max(2000),
  weeklyStrengthSessions: z.number().int().min(0).max(14),
  sleepTargetMinHours: z.number().min(3).max(14),
  sleepTargetMaxHours: z.number().min(3).max(14),
  weeklyAlcoholUnitsMax: z.number().min(0).max(100),
  dailyFruitVegPortions: z.number().int().min(0).max(20),
  dailySaltMaxG: z.number().min(0).max(30),
  dailyFluidsL: z.number().min(0).max(10),
  dailyCaffeineMaxMg: z.number().min(0).max(2000),
});

export const bpContextSchema = z.enum(['rested', 'caffeine', 'exercise', 'illness', 'stress', 'other']);
export const bpReadingSchema = z
  .object({
    ...base,
    takenAt: epoch,
    tzOffsetMin: tzOffset,
    localDate,
    localTime,
    period: z.enum(['AM', 'PM']),
    setting: z.enum(['home', 'clinic']).default('home'),
    systolic: z.number().int().min(50).max(300),
    diastolic: z.number().int().min(30).max(200),
    pulse: z.number().int().min(25).max(250).optional(),
    contexts: z.array(bpContextSchema).max(6).default([]),
    sessionId: id.optional(),
    arm: z.enum(['left', 'right']).optional(),
  })
  .refine((r) => r.systolic > r.diastolic, { message: 'Systolic must be higher than diastolic', path: ['systolic'] });

export const weightSchema = z.object({ ...base, takenAt: epoch, tzOffsetMin: tzOffset, localDate, weightKg: z.number().min(30).max(300) });
export const waistSchema = z.object({ ...base, takenAt: epoch, tzOffsetMin: tzOffset, localDate, waistCm: z.number().min(40).max(200) });

export const exerciseTypeSchema = z.enum(['walking', 'running', 'cycling', 'swimming', 'strength', 'mobility', 'other']);
export const intensitySchema = z.enum(['easy', 'moderate', 'hard']);
export const exerciseSchema = z.object({
  ...base,
  localDate,
  startTime: localTime.optional(),
  type: exerciseTypeSchema,
  durationMin: z.number().int().min(1).max(600),
  intensity: intensitySchema,
  distanceKm: z.number().min(0).max(500).optional(),
  planned: z.boolean(),
  occurrenceId: id.optional(),
  avgHeartRate: z.number().int().min(30).max(240).optional(),
});

export const sleepSchema = z
  .object({
    ...base,
    /** The local date the person woke up on; one main sleep per wake date. */
    wakeDate: localDate,
    bedLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    wakeLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    bedAt: epoch,
    wakeAt: epoch,
    durationMin: z.number().int().min(1).max(24 * 60),
    quality: z.number().int().min(1).max(5).optional(),
    awakeMin: z.number().int().min(0).max(600).optional(),
    deepMin: z.number().int().min(0).max(900).optional(),
    remMin: z.number().int().min(0).max(900).optional(),
  })
  .refine((s) => s.wakeAt > s.bedAt, { message: 'Wake time must be after bedtime', path: ['wakeLocal'] });

const nullableNum = (min: number, max: number) => z.number().min(min).max(max).nullable();
export const drinkSchema = z.object({ label: z.string().max(60), volumeMl: z.number().min(1).max(5000), abvPercent: z.number().min(0).max(80), units: z.number().min(0).max(100) });
export const nutritionSchema = z.object({
  ...base,
  localDate,
  /** null = not recorded (distinct from 0). */
  fruitVegPortions: nullableNum(0, 30),
  alcoholUnits: nullableNum(0, 100),
  drinks: z.array(drinkSchema).max(50).default([]),
  caffeineMg: nullableNum(0, 3000),
  saltG: nullableNum(0, 50),
  fluidsL: nullableNum(0, 15),
  targetsMet: z.object({
    lowSalt: z.boolean().nullable(),
    wholeFoods: z.boolean().nullable(),
    noLateEating: z.boolean().nullable(),
  }),
});

/** Watch-ready daily metrics (resting HR, steps). Manual or wearable-imported. */
export const dailyMetricSchema = z.object({
  ...base,
  localDate,
  restingHr: z.number().int().min(25).max(200).optional(),
  steps: z.number().int().min(0).max(200000).optional(),
});

export const activityCategorySchema = z.enum(['bp', 'aerobic', 'strength', 'mobility', 'weight', 'waist', 'sleep', 'nutrition', 'review', 'medical', 'lifestyle']);
export const verificationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bp'), period: z.enum(['AM', 'PM']), minReadings: z.number().int().min(1).max(6) }),
  z.object({ kind: z.literal('weight') }),
  z.object({ kind: z.literal('waist') }),
  z.object({ kind: z.literal('exercise'), types: z.array(exerciseTypeSchema).min(1), minMinutes: z.number().int().min(0).max(600) }),
  z.object({ kind: z.literal('sleep') }),
  z.object({ kind: z.literal('nutrition') }),
  z.object({ kind: z.literal('review') }),
]);

export const programmeSchema = z.object({
  id,
  name: z.string().max(120),
  description: z.string().max(4000),
  templateVersion: z.number().int().min(1),
  weeks: z.number().int().min(1).max(52),
  createdAt: epoch,
  updatedAt: epoch,
});

export const programmeWeekSchema = z.object({
  id,
  programmeId: id,
  /** 1..N for programme weeks; 0 is the repeating maintenance template. */
  weekNumber: z.number().int().min(0).max(52),
  title: z.string().max(120),
  phase: z.string().max(60),
  objectives: z.array(z.string().max(400)).max(20),
  exerciseSchedule: z.string().max(1000),
  nutritionFocus: z.string().max(1000),
  recoveryAdvice: z.string().max(1000),
  measurementReminders: z.array(z.string().max(300)).max(20),
  reviewPrompts: z.array(z.string().max(300)).max(20),
  cautions: z.array(z.string().max(400)).max(10),
  bpProtocolWeek: z.boolean(),
  notes,
  updatedAt: epoch,
});

export const scheduledActivitySchema = z.object({
  id,
  programmeId: id,
  weekNumber: z.number().int().min(0).max(52),
  /** Programme day within the week, 1..7 (day 1 = same weekday as start date). */
  day: z.number().int().min(1).max(7),
  order: z.number().int().min(0).max(100),
  title: z.string().min(1).max(120),
  category: activityCategorySchema,
  instructions: z.string().max(2000),
  targetMinutes: z.number().int().min(0).max(600).optional(),
  optional: z.boolean(),
  verification: verificationSchema.optional(),
  archived: z.boolean().default(false),
  updatedAt: epoch,
});

export const completionEventSchema = z.object({
  at: epoch,
  action: z.enum(['done', 'skipped', 'rescheduled', 'undone', 'note']),
  detail: z.string().max(300).optional(),
});
export const activityCompletionSchema = z.object({
  /** `${activityId}@${dueDate}` – one record per occurrence. */
  id,
  activityId: id,
  dueDate: localDate,
  status: z.enum(['pending', 'done', 'skipped']),
  rescheduledTo: localDate.optional(),
  completedAt: epoch.optional(),
  notes,
  history: z.array(completionEventSchema).max(200),
  updatedAt: epoch,
});

export const weeklyReviewSchema = z.object({
  id,
  weekNumber: z.number().int().min(1).max(520),
  startDate: localDate,
  endDate: localDate,
  generatedAt: epoch,
  summaryLines: z.array(z.string().max(500)).max(60),
  reflection: z.string().max(4000).optional(),
  nextFocus: z.string().max(2000).optional(),
  updatedAt: epoch,
});

export type Source = z.infer<typeof sourceSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type ReminderPrefs = z.infer<typeof reminderPrefsSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type HealthGoals = z.infer<typeof healthGoalsSchema>;
export type BpContext = z.infer<typeof bpContextSchema>;
export type BloodPressureReading = z.infer<typeof bpReadingSchema>;
export type WeightMeasurement = z.infer<typeof weightSchema>;
export type WaistMeasurement = z.infer<typeof waistSchema>;
export type ExerciseType = z.infer<typeof exerciseTypeSchema>;
export type Intensity = z.infer<typeof intensitySchema>;
export type ExerciseSession = z.infer<typeof exerciseSchema>;
export type SleepRecord = z.infer<typeof sleepSchema>;
export type Drink = z.infer<typeof drinkSchema>;
export type NutritionRecord = z.infer<typeof nutritionSchema>;
export type DailyMetric = z.infer<typeof dailyMetricSchema>;
export type ActivityCategory = z.infer<typeof activityCategorySchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type Programme = z.infer<typeof programmeSchema>;
export type ProgrammeWeek = z.infer<typeof programmeWeekSchema>;
export type ScheduledActivity = z.infer<typeof scheduledActivitySchema>;
export type ActivityCompletion = z.infer<typeof activityCompletionSchema>;
export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;

/** Table name → schema. Order matters for import (programme before weeks etc.). */
export const TABLE_SCHEMAS = {
  userProfile: userProfileSchema,
  healthGoals: healthGoalsSchema,
  programmes: programmeSchema,
  programmeWeeks: programmeWeekSchema,
  scheduledActivities: scheduledActivitySchema,
  activityCompletions: activityCompletionSchema,
  bloodPressure: bpReadingSchema,
  weights: weightSchema,
  waists: waistSchema,
  exercise: exerciseSchema,
  sleep: sleepSchema,
  nutrition: nutritionSchema,
  dailyMetrics: dailyMetricSchema,
  weeklyReviews: weeklyReviewSchema,
} as const;
export type TableName = keyof typeof TABLE_SCHEMAS;
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];
