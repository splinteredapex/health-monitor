import Dexie from 'dexie';
import { db, DB_NAME } from '../db/db';
import { completeOnboarding, DEFAULT_REMINDERS, sleepRepo, saveDailyMetricForDate } from '../db/repo';

const records: Record<string, unknown[]> = {
  BloodPressure: [{ id: 'bp1', time: '2026-11-03T07:00:00Z', zoneOffsetSeconds: 0, systolic: 130, diastolic: 82 }, { id: 'bad', time: '2026-11-03T07:00:00Z', zoneOffsetSeconds: 0, systolic: 20, diastolic: 82 }],
  Weight: [{ id: 'w1', time: '2026-11-03T07:00:00Z', zoneOffsetSeconds: 0, kg: 85.5 }],
  SleepSession: [
    { id: 's1', startTime: '2026-11-02T23:00:00Z', endTime: '2026-11-03T07:00:00Z', startZoneOffsetSeconds: 0, endZoneOffsetSeconds: 0 },
    { id: 's2', startTime: '2026-11-03T13:00:00Z', endTime: '2026-11-03T13:30:00Z', startZoneOffsetSeconds: 0, endZoneOffsetSeconds: 0 },
    { id: 's3', startTime: '2026-11-03T23:00:00Z', endTime: '2026-11-04T06:00:00Z', startZoneOffsetSeconds: 0, endZoneOffsetSeconds: 0 },
  ],
  ExerciseSession: [{ id: 'e1', startTime: '2026-11-03T17:00:00Z', endTime: '2026-11-03T17:30:00Z', startZoneOffsetSeconds: 0, category: 'walking', avgHr: 120 }],
  RestingHeartRate: [{ id: 'r1', time: '2026-11-03T06:00:00Z', zoneOffsetSeconds: 0, bpm: 61 }, { id: 'r2', time: '2026-11-04T06:00:00Z', zoneOffsetSeconds: 0, bpm: 59 }],
  Steps: [{ date: '2026-11-03', steps: 9000 }, { date: '2026-11-04', steps: 7000 }],
};

vi.mock('./healthConnect', () => ({
  HealthConnect: {
    granted: async () => ['BloodPressure', 'Weight', 'SleepSession', 'ExerciseSession', 'RestingHeartRate', 'Steps', 'HeartRate'],
    read: async (type: string) => records[type] ?? [],
  },
}));

const { syncHealthConnect } = await import('./sync');

beforeEach(async () => {
  db.close();
  await Dexie.delete(DB_NAME);
  await db.open();
  await completeOnboarding({ sex: 'male', heightCm: 178, baselineWeightKg: 80, programmeStartDate: '2026-11-02', theme: 'system', reminders: DEFAULT_REMINDERS, dateOfBirth: '1990-05-01' }, {});
});

describe('Health Connect sync', () => {
  it('imports valid records, is idempotent and respects manual data', async () => {
    // A manual sleep for 4 Nov and a manual resting HR for 4 Nov must win.
    await sleepRepo.save({ wakeDate: '2026-11-04', bedLocal: '2026-11-03T22:00', wakeLocal: '2026-11-04T06:30', bedAt: 1, wakeAt: 2, durationMin: 510 });
    await saveDailyMetricForDate('2026-11-04', { restingHr: 55 });

    const r1 = await syncHealthConnect(new Date('2026-11-05T12:00:00Z'));
    expect(r1.added).toMatchObject({ bloodPressure: 1, weights: 1, exercise: 1, sleep: 1 });
    expect(r1.skipped).toBeGreaterThanOrEqual(2); // invalid BP + clashing sleep
    expect((await db.sleep.where('wakeDate').equals('2026-11-03').first())!.durationMin).toBe(480); // longest, not the nap
    expect((await db.sleep.where('wakeDate').equals('2026-11-04').first())!.source).toBe('manual');
    const d4 = (await db.dailyMetrics.where('localDate').equals('2026-11-04').first())!;
    expect(d4).toMatchObject({ restingHr: 55, steps: 7000 });
    expect((await db.exercise.toArray())[0]).toMatchObject({ intensity: 'moderate', source: 'watch' }); // 120 / 184 = 65% of HRmax

    const r2 = await syncHealthConnect(new Date('2026-11-05T13:00:00Z'));
    expect(r2.added).toMatchObject({ bloodPressure: 0, weights: 0, exercise: 0, sleep: 0 });
    expect(await db.bloodPressure.count()).toBe(1);
    expect((await db.userProfile.get('profile'))!.healthConnect?.enabled).toBe(true);
  });
});
