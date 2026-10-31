/**
 * Dexie database with explicit, append-only versioned migrations.
 *
 * RULES (see AGENTS.md):
 *  - Never edit an existing version() block once released. Add a new version.
 *  - Upgrades must be idempotent and must never delete user health records.
 *  - Bump DB_SCHEMA_VERSION and BACKUP_FORMAT_VERSION consumers when shapes change.
 */
import Dexie, { type Table } from 'dexie';
import type {
  ActivityCompletion, BloodPressureReading, DailyMetric, ExerciseSession, HealthGoals, NutritionRecord,
  Programme, ProgrammeWeek, ScheduledActivity, SleepRecord, UserProfile, WaistMeasurement, WeeklyReview,
  WeightMeasurement,
} from './schemas';

export const DB_NAME = 'health-recovery';
export const DB_SCHEMA_VERSION = 2;

export class HealthDB extends Dexie {
  userProfile!: Table<UserProfile, string>;
  healthGoals!: Table<HealthGoals, string>;
  programmes!: Table<Programme, string>;
  programmeWeeks!: Table<ProgrammeWeek, string>;
  scheduledActivities!: Table<ScheduledActivity, string>;
  activityCompletions!: Table<ActivityCompletion, string>;
  bloodPressure!: Table<BloodPressureReading, string>;
  weights!: Table<WeightMeasurement, string>;
  waists!: Table<WaistMeasurement, string>;
  exercise!: Table<ExerciseSession, string>;
  sleep!: Table<SleepRecord, string>;
  nutrition!: Table<NutritionRecord, string>;
  dailyMetrics!: Table<DailyMetric, string>;
  weeklyReviews!: Table<WeeklyReview, string>;

  constructor(name = DB_NAME) {
    super(name);
    defineVersions(this);
  }
}

/** v1 store definitions – kept verbatim for migration tests. */
export const V1_STORES = {
  userProfile: 'id',
  healthGoals: 'id',
  programmes: 'id',
  programmeWeeks: 'id, programmeId, weekNumber',
  scheduledActivities: 'id, programmeId, weekNumber, [weekNumber+day]',
  activityCompletions: 'id, activityId, dueDate, rescheduledTo',
  bloodPressure: 'id, takenAt, localDate, sessionId',
  weights: 'id, takenAt, localDate',
  waists: 'id, takenAt, localDate',
  exercise: 'id, localDate, type, occurrenceId',
  sleep: 'id, wakeDate, bedAt',
  nutrition: 'id, &localDate',
  weeklyReviews: 'id, weekNumber, startDate',
};

export function defineVersions(db: Dexie) {
  db.version(1).stores(V1_STORES);

  // v2: record provenance (`source`) for wearable/import readiness, plus a
  // dailyMetrics table for resting heart rate and steps.
  db.version(2)
    .stores({
      bloodPressure: 'id, takenAt, localDate, sessionId, source',
      sleep: 'id, wakeDate, bedAt, source',
      exercise: 'id, localDate, type, occurrenceId, source',
      dailyMetrics: 'id, &localDate, source',
    })
    .upgrade(async (tx) => {
      for (const table of ['bloodPressure', 'weights', 'waists', 'exercise', 'sleep', 'nutrition']) {
        await tx
          .table(table)
          .toCollection()
          .modify((r: { source?: string }) => {
            if (!r.source) r.source = 'manual';
          });
      }
    });
}

export let db = new HealthDB();

/** Test hook: swap the database instance (e.g. a fresh fake-indexeddb name). */
export function _setDb(next: HealthDB) {
  db = next;
}
