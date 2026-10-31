/** Health Connect → IndexedDB sync. Idempotent; never overwrites existing records. */
import { db } from '../db/db';
import { bpReadingSchema, dailyMetricSchema, exerciseSchema, sleepSchema, weightSchema, type DailyMetric } from '../db/schemas';
import { ageOn, todayLocal } from '../lib/dates';
import { newId } from '../lib/id';
import { HealthConnect, type HcBloodPressure, type HcExercise, type HcRestingHr, type HcSleep, type HcSteps, type HcType, type HcWeight } from './healthConnect';
import { mapBp, mapDaily, mapExercise, mapSleep, mapWeight } from './hcMap';

export const FIRST_SYNC_DAYS = 30;
export interface SyncResult { added: Record<string, number>; skipped: number; errors: string[] }

export async function syncHealthConnect(now = new Date()): Promise<SyncResult> {
  const profile = await db.userProfile.get('profile');
  if (!profile) throw new Error('No profile');
  const granted = new Set(await HealthConnect.granted());
  const last = profile.healthConnect?.lastSyncAt;
  // Overlap 2 days so late-arriving watch data is picked up.
  const start = new Date(last ? last - 2 * 86_400_000 : now.getTime() - FIRST_SYNC_DAYS * 86_400_000);
  const age = profile.dateOfBirth ? ageOn(profile.dateOfBirth, todayLocal(now)) : null;
  const t = now.getTime();
  const res: SyncResult = { added: {}, skipped: 0, errors: [] };
  const read = async <T>(type: HcType): Promise<T[]> => {
    if (!granted.has(type)) return [];
    try { return (await HealthConnect.read(type, start, now)) as T[]; } catch (e) { res.errors.push(`${type}: ${(e as Error).message}`); return []; }
  };

  const [bp, weights, sleeps, exercise, rhr, steps] = await Promise.all([
    read<HcBloodPressure>('BloodPressure'), read<HcWeight>('Weight'), read<HcSleep>('SleepSession'),
    read<HcExercise>('ExerciseSession'), read<HcRestingHr>('RestingHeartRate'), read<HcSteps>('Steps'),
  ]);

  const addNew = async <R extends { id: string }>(table: 'bloodPressure' | 'weights' | 'exercise', rows: R[], schema: { safeParse: (x: unknown) => { success: boolean } }) => {
    const valid = rows.filter((r) => schema.safeParse(r).success);
    res.skipped += rows.length - valid.length;
    const existing = new Set((await db.table(table).bulkGet(valid.map((r) => r.id))).filter(Boolean).map((r: { id: string }) => r.id));
    const fresh = valid.filter((r) => !existing.has(r.id));
    res.skipped += valid.length - fresh.length;
    await db.table(table).bulkAdd(fresh);
    res.added[table] = fresh.length;
  };

  const safe = <A, B>(xs: A[], f: (a: A) => B | null): B[] => xs.flatMap((x) => { try { const v = f(x); return v ? [v] : []; } catch { res.skipped++; return []; } });

  await db.transaction('rw', [db.bloodPressure, db.weights, db.exercise, db.sleep, db.dailyMetrics, db.userProfile], async () => {
    await addNew('bloodPressure', safe(bp, (r) => mapBp(r, t)), bpReadingSchema);
    await addNew('weights', safe(weights, (r) => mapWeight(r, t)), weightSchema);
    await addNew('exercise', safe(exercise, (r) => mapExercise(r, t, age)), exerciseSchema);

    // Sleep: one main sleep per wake date – keep the longest; never replace a manual entry.
    const byWake = new Map<string, ReturnType<typeof mapSleep>>();
    for (const s of safe(sleeps, (r) => mapSleep(r, t))) if (sleepSchema.safeParse(s).success && (byWake.get(s.wakeDate)?.durationMin ?? 0) < s.durationMin) byWake.set(s.wakeDate, s);
    let sleepAdded = 0;
    for (const s of byWake.values()) {
      const clash = await db.sleep.where('wakeDate').equals(s.wakeDate).first();
      if (clash) { res.skipped++; continue; }
      await db.sleep.add(s);
      sleepAdded++;
    }
    res.added.sleep = sleepAdded;

    // Daily metrics: fill/refresh watch values; never overwrite a value the user typed.
    let dm = 0;
    for (const [date, vals] of mapDaily(rhr, steps)) {
      const cur = await db.dailyMetrics.where('localDate').equals(date).first();
      const next: DailyMetric = cur
        ? { ...cur, ...(cur.source === 'manual' && cur.restingHr != null ? {} : vals.restingHr != null ? { restingHr: vals.restingHr } : {}), ...(cur.source === 'manual' && cur.steps != null ? {} : vals.steps != null ? { steps: vals.steps } : {}), updatedAt: t }
        : { id: newId(), createdAt: t, updatedAt: t, source: 'watch', localDate: date, ...vals };
      if (dailyMetricSchema.safeParse(next).success) { await db.dailyMetrics.put(next); dm++; }
    }
    res.added.dailyMetrics = dm;

    const summary = `${Object.entries(res.added).map(([k, v]) => `${v} ${k}`).join(', ')}${res.errors.length ? `; ${res.errors.length} error(s)` : ''}`;
    await db.userProfile.update('profile', { healthConnect: { enabled: true, lastSyncAt: t, lastResult: summary.slice(0, 500) }, updatedAt: t });
  });
  return res;
}
