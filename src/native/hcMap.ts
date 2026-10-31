/**
 * Pure mapping from Health Connect records to app records. Deterministic ids
 * (`hc:<id>`) make re-syncs idempotent; existing records are never overwritten.
 */
import type { BloodPressureReading, DailyMetric, ExerciseSession, ExerciseType, Intensity, SleepRecord, WeightMeasurement } from '../db/schemas';
import { isLocalDate } from '../lib/dates';
import { periodForTime } from '../domain/bp';
import type { HcBloodPressure, HcExercise, HcRestingHr, HcSleep, HcSteps, HcWeight } from './healthConnect';

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock date/time where the measurement was taken (uses the record's own offset if present). */
export function localParts(iso: string, offsetSeconds: number | null | undefined): { ms: number; date: string; time: string; offsetMin: number } {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new RangeError(`Bad timestamp ${iso}`);
  const offsetMin = offsetSeconds != null ? Math.round(offsetSeconds / 60) : -new Date(ms).getTimezoneOffset();
  const d = new Date(ms + offsetMin * 60_000);
  return { ms, offsetMin, date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

const hcId = (id: string) => `hc:${id}`.slice(0, 100);
const base = (id: string, now: number) => ({ id: hcId(id), createdAt: now, updatedAt: now, source: 'watch' as const });

export function mapBp(r: HcBloodPressure, now: number): BloodPressureReading {
  const p = localParts(r.time, r.zoneOffsetSeconds);
  return {
    ...base(r.id, now), takenAt: p.ms, tzOffsetMin: p.offsetMin, localDate: p.date, localTime: p.time, period: periodForTime(p.time),
    setting: 'home', systolic: Math.round(r.systolic), diastolic: Math.round(r.diastolic), contexts: [],
    notes: `Imported from Health Connect${r.origin ? ` (${r.origin})` : ''}. Not used for formal home averages.`,
  };
}

export function mapWeight(r: HcWeight, now: number): WeightMeasurement {
  const p = localParts(r.time, r.zoneOffsetSeconds);
  return { ...base(r.id, now), takenAt: p.ms, tzOffsetMin: p.offsetMin, localDate: p.date, weightKg: Math.round(r.kg * 10) / 10 };
}

export function mapSleep(r: HcSleep, now: number): SleepRecord {
  const s = localParts(r.startTime, r.startZoneOffsetSeconds);
  const e = localParts(r.endTime, r.endZoneOffsetSeconds ?? r.startZoneOffsetSeconds);
  const durationMin = Math.round((e.ms - s.ms) / 60_000);
  const opt = (k: 'deepMin' | 'remMin' | 'awakeMin') => (r[k] != null && r[k]! >= 0 ? { [k]: Math.round(r[k]!) } : {});
  return {
    ...base(r.id, now), wakeDate: e.date, bedLocal: `${s.date}T${s.time}`, wakeLocal: `${e.date}T${e.time}`, bedAt: s.ms, wakeAt: e.ms,
    durationMin, ...opt('deepMin'), ...opt('remMin'), ...opt('awakeMin'),
  };
}

const TYPES: ExerciseType[] = ['walking', 'running', 'cycling', 'swimming', 'strength', 'mobility', 'other'];

/**
 * Intensity from average heart rate as % of age-predicted max (220 − age):
 * < 64 % easy, 64–76 % moderate, > 76 % hard (ACSM bands). Without HR or age we
 * do NOT assume moderate – the session is marked easy and flagged for review.
 */
export function intensityFromHr(avgHr: number | null | undefined, age: number | null): { intensity: Intensity; estimated: boolean } {
  if (avgHr == null || age == null || age <= 0) return { intensity: 'easy', estimated: false };
  const pct = avgHr / (220 - age);
  return { intensity: pct > 0.76 ? 'hard' : pct >= 0.64 ? 'moderate' : 'easy', estimated: true };
}

export function mapExercise(r: HcExercise, now: number, age: number | null): ExerciseSession | null {
  const s = localParts(r.startTime, r.startZoneOffsetSeconds);
  const durationMin = Math.round((Date.parse(r.endTime) - s.ms) / 60_000);
  if (durationMin < 1) return null;
  const type = (TYPES as string[]).includes(r.category) ? (r.category as ExerciseType) : 'other';
  const { intensity, estimated } = type === 'strength' || type === 'mobility' ? { intensity: 'moderate' as Intensity, estimated: false } : intensityFromHr(r.avgHr, age);
  const note = estimated ? `Intensity estimated from average HR ${Math.round(r.avgHr!)} bpm – edit if it felt different.` : type === 'strength' || type === 'mobility' ? 'Imported from watch.' : 'Imported from watch without heart rate – intensity set to easy; edit to match how it felt.';
  return {
    ...base(r.id, now), localDate: s.date, startTime: s.time, type, durationMin: Math.min(600, durationMin), intensity, planned: false,
    ...(r.distanceM != null && r.distanceM > 0 ? { distanceKm: Math.round(r.distanceM / 10) / 100 } : {}),
    ...(r.avgHr != null ? { avgHeartRate: Math.round(r.avgHr) } : {}),
    notes: `${r.title ? `${r.title}. ` : ''}${note}`,
  };
}

/** Merge resting HR (latest per day) and steps into per-day metrics. */
export function mapDaily(rhr: readonly HcRestingHr[], steps: readonly HcSteps[]): Map<string, Pick<DailyMetric, 'restingHr' | 'steps'>> {
  const out = new Map<string, Pick<DailyMetric, 'restingHr' | 'steps'>>();
  const latest = new Map<string, number>();
  for (const r of rhr) {
    const p = localParts(r.time, r.zoneOffsetSeconds);
    if ((latest.get(p.date) ?? -1) < p.ms) {
      latest.set(p.date, p.ms);
      out.set(p.date, { ...out.get(p.date), restingHr: Math.round(r.bpm) });
    }
  }
  for (const s of steps) if (isLocalDate(s.date) && s.steps > 0) out.set(s.date, { ...out.get(s.date), steps: Math.round(s.steps) });
  return out;
}
