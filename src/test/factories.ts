import type { BloodPressureReading, ExerciseSession, SleepRecord } from '../db/schemas';
import { localDateTimeToDate } from '../lib/dates';
let n = 0;
export function bp(localDate: string, localTime: string, systolic: number, diastolic: number, extra: Partial<BloodPressureReading> = {}): BloodPressureReading {
  const d = localDateTimeToDate(localDate, localTime);
  return {
    id: `bp${++n}`, createdAt: 0, updatedAt: 0, source: 'manual', takenAt: d.getTime(), tzOffsetMin: -d.getTimezoneOffset(),
    localDate, localTime, period: Number(localTime.slice(0, 2)) < 12 ? 'AM' : 'PM', setting: 'home', systolic, diastolic, contexts: [], ...extra,
  };
}
export function protocolDay(date: string, s: number, d: number, am = 2, pm = 2): BloodPressureReading[] {
  return [
    ...Array.from({ length: am }, (_, i) => bp(date, `07:0${i}`, s, d)),
    ...Array.from({ length: pm }, (_, i) => bp(date, `20:0${i}`, s, d)),
  ];
}
export function ex(localDate: string, type: ExerciseSession['type'], durationMin: number, intensity: ExerciseSession['intensity'], planned = true): ExerciseSession {
  return { id: `ex${++n}`, createdAt: 0, updatedAt: 0, source: 'manual', localDate, type, durationMin, intensity, planned };
}
export function sleepRec(wakeDate: string, durationMin: number, quality?: number): SleepRecord {
  return { id: `sl${++n}`, createdAt: 0, updatedAt: 0, source: 'manual', wakeDate, bedLocal: `${wakeDate}T00:00`, wakeLocal: `${wakeDate}T07:00`, bedAt: 0, wakeAt: 1, durationMin, ...(quality ? { quality } : {}) };
}
