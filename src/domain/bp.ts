/**
 * Blood pressure calculations and interpretation.
 * Thresholds follow NICE NG136 (Hypertension in adults, updated Nov 2023).
 * See CLINICAL_GUIDANCE.md. Nothing here diagnoses; outputs are informational.
 */
import type { BloodPressureReading } from '../db/schemas';
import { addDays, compareDates, dateRange, diffDays, type LocalDate } from '../lib/dates';
import { mean, round } from '../lib/math';

export type Bp = { systolic: number; diastolic: number };
export type BpAverage = Bp & { count: number; pulse: number | null };

/** NICE NG136 thresholds (mmHg). */
export const NICE = {
  clinic: { stage1: { s: 140, d: 90 }, stage2: { s: 160, d: 100 }, severe: { s: 180, d: 120 } },
  home: { stage1: { s: 135, d: 85 }, stage2: { s: 150, d: 95 } },
  /** NICE treatment target for adults < 80: clinic < 140/90, home < 135/85. */
  targetUnder80: { clinic: { s: 140, d: 90 }, home: { s: 135, d: 85 } },
} as const;

/** Very low values that warrant a symptom check (NHS: below 90/60 is low BP). */
export const LOW_BP = { s: 90, d: 60 } as const;

export function averageReadings(readings: readonly BloodPressureReading[]): BpAverage | null {
  if (readings.length === 0) return null;
  const pulses = readings.map((r) => r.pulse).filter((p): p is number => p != null);
  const p = mean(pulses);
  return {
    systolic: round(mean(readings.map((r) => r.systolic))!, 1),
    diastolic: round(mean(readings.map((r) => r.diastolic))!, 1),
    count: readings.length,
    pulse: p == null ? null : round(p, 1),
  };
}

/**
 * Readings that count towards home averages and the NICE protocol: home cuff
 * readings only. Wearable ('watch') BP is cuffless/unvalidated for NICE home
 * monitoring, so it is shown but never averaged.
 */
export const countsAsHome = (r: BloodPressureReading) => r.setting === 'home' && r.source !== 'watch';
export const homeOnly = (rs: readonly BloodPressureReading[]) => rs.filter(countsAsHome);

export function sortByTime<T extends { takenAt: number }>(rs: readonly T[]): T[] {
  return [...rs].sort((a, b) => a.takenAt - b.takenAt);
}

export function latestReading(rs: readonly BloodPressureReading[]): BloodPressureReading | null {
  return rs.length ? sortByTime(rs)[rs.length - 1]! : null;
}

export interface DailyBp { date: LocalDate; systolic: number; diastolic: number; count: number }

/** Average of all home readings per local date. */
export function dailyAverages(rs: readonly BloodPressureReading[]): DailyBp[] {
  const byDate = new Map<LocalDate, BloodPressureReading[]>();
  for (const r of homeOnly(rs)) {
    const arr = byDate.get(r.localDate) ?? [];
    arr.push(r);
    byDate.set(r.localDate, arr);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .map(([date, arr]) => {
      const a = averageReadings(arr)!;
      return { date, systolic: a.systolic, diastolic: a.diastolic, count: a.count };
    });
}

/**
 * Trailing seven-calendar-day mean of daily averages (days without readings are
 * skipped, never interpolated). Requires at least `minDays` days with data.
 */
export function sevenDayTrend(daily: readonly DailyBp[], minDays = 3): Array<DailyBp & { trendS: number | null; trendD: number | null }> {
  return daily.map((d) => {
    const from = addDays(d.date, -6);
    const win = daily.filter((x) => x.date >= from && x.date <= d.date);
    const ok = win.length >= minDays;
    return {
      ...d,
      trendS: ok ? round(mean(win.map((x) => x.systolic))!, 1) : null,
      trendD: ok ? round(mean(win.map((x) => x.diastolic))!, 1) : null,
    };
  });
}

/* ---------------- Home BP monitoring protocol (NICE NG136 1.2.6) ---------------- */

export const PROTOCOL_DAYS = 7;
export const PROTOCOL_MIN_DAYS = 4; // NICE: "at least 4 days, ideally 7"
export const READINGS_PER_SESSION = 2;

export interface ProtocolDay {
  date: LocalDate;
  dayIndex: number; // 1..7
  am: number;
  pm: number;
  complete: boolean; // ≥2 AM and ≥2 PM readings
  excluded: boolean; // day 1 is always excluded from the formal average
}

export type ProtocolStatus = 'complete' | 'minimum' | 'incomplete' | 'in-progress';

export interface ProtocolResult {
  startDate: LocalDate;
  endDate: LocalDate;
  days: ProtocolDay[];
  status: ProtocolStatus;
  /** Formal average – only when status is 'complete' or 'minimum'. */
  formal: BpAverage | null;
  /** Average of whatever counted readings exist (days 2+), for incomplete protocols. */
  provisional: BpAverage | null;
  completeDays: number;
  issues: string[];
}

/**
 * Evaluate a 7-day home monitoring window starting `startDate`.
 *  - Each day should have 2 morning + 2 evening readings (~1 min apart).
 *  - Day 1 readings are discarded.
 *  - 'complete'  = all 7 days complete.
 *  - 'minimum'   = days 1..N complete consecutively with N ≥ 4 (NICE minimum), window finished.
 *  - 'in-progress' = window not yet finished and no gaps so far.
 *  - 'incomplete' = otherwise. Never labelled formal.
 * Uses each reading's stored *local date* and AM/PM period. Clinic readings are ignored.
 */
export function evaluateProtocol(all: readonly BloodPressureReading[], startDate: LocalDate, today: LocalDate): ProtocolResult {
  const endDate = addDays(startDate, PROTOCOL_DAYS - 1);
  const inWindow = homeOnly(all).filter((r) => r.localDate >= startDate && r.localDate <= endDate);
  const days: ProtocolDay[] = dateRange(startDate, endDate).map((date, i) => {
    const rs = inWindow.filter((r) => r.localDate === date);
    const am = rs.filter((r) => r.period === 'AM').length;
    const pm = rs.filter((r) => r.period === 'PM').length;
    return { date, dayIndex: i + 1, am, pm, complete: am >= READINGS_PER_SESSION && pm >= READINGS_PER_SESSION, excluded: i === 0 };
  });

  const counted = inWindow.filter((r) => r.localDate !== startDate);
  const provisional = averageReadings(counted);
  const completeDays = days.filter((d) => d.complete).length;
  let leadingComplete = 0;
  for (const d of days) {
    if (!d.complete) break;
    leadingComplete++;
  }
  const windowFinished = compareDates(today, endDate) > 0;
  const elapsed = Math.min(PROTOCOL_DAYS, Math.max(0, diffDays(startDate, today) + 1));

  let status: ProtocolStatus;
  if (completeDays === PROTOCOL_DAYS) status = 'complete';
  else if (!windowFinished && leadingComplete >= elapsed - 1 && days.slice(0, Math.max(0, elapsed - 1)).every((d) => d.complete)) status = 'in-progress';
  else if (windowFinished && leadingComplete >= PROTOCOL_MIN_DAYS) status = 'minimum';
  else status = 'incomplete';

  let formal: BpAverage | null = null;
  if (status === 'complete') formal = provisional;
  if (status === 'minimum') {
    const lastIncluded = addDays(startDate, leadingComplete - 1);
    formal = averageReadings(counted.filter((r) => r.localDate <= lastIncluded));
  }

  const issues: string[] = [];
  for (const d of days) {
    if (compareDates(d.date, today) > 0) continue;
    if (d.date === today && !windowFinished) continue;
    if (d.am < READINGS_PER_SESSION) issues.push(`Day ${d.dayIndex}: ${d.am} of 2 morning readings`);
    if (d.pm < READINGS_PER_SESSION) issues.push(`Day ${d.dayIndex}: ${d.pm} of 2 evening readings`);
  }
  return { startDate, endDate, days, status, formal, provisional, completeDays, issues };
}

/* ---------------- Interpretation ---------------- */

export type HomeBand = 'below-threshold' | 'stage1-range' | 'stage2-range';

/** Classify a *home average* (never an individual reading) against NICE home thresholds. */
export function classifyHomeAverage(bp: Bp): HomeBand {
  const { stage1, stage2 } = NICE.home;
  if (bp.systolic >= stage2.s || bp.diastolic >= stage2.d) return 'stage2-range';
  if (bp.systolic >= stage1.s || bp.diastolic >= stage1.d) return 'stage1-range';
  return 'below-threshold';
}

export type ClinicBand = 'below-threshold' | 'stage1-range' | 'stage2-range' | 'severe-range';
export function classifyClinic(bp: Bp): ClinicBand {
  const { stage1, stage2, severe } = NICE.clinic;
  if (bp.systolic >= severe.s || bp.diastolic >= severe.d) return 'severe-range';
  if (bp.systolic >= stage2.s || bp.diastolic >= stage2.d) return 'stage2-range';
  if (bp.systolic >= stage1.s || bp.diastolic >= stage1.d) return 'stage1-range';
  return 'below-threshold';
}

export const HOME_BAND_TEXT: Record<HomeBand, string> = {
  'below-threshold': 'Below the NICE home threshold of 135/85 mmHg.',
  'stage1-range': 'At or above the NICE home threshold of 135/85 mmHg. This may indicate high blood pressure – share these readings with your GP or practice nurse.',
  'stage2-range': 'At or above 150/95 mmHg (NICE stage 2 home range). Arrange a GP or practice nurse appointment soon and share these readings.',
};

export type SafetyLevel = 'none' | 'low' | 'high' | 'very-high';
export interface SafetyMessage { level: SafetyLevel; title: string; body: string[] }

export const EMERGENCY_SYMPTOMS =
  'chest pain, shortness of breath, severe headache, confusion, blurred or loss of vision, weakness or numbness in the face or limbs, difficulty speaking, or fainting';

/** Safety message for a single reading. Individual readings are not diagnoses. */
export function readingSafety(bp: Bp): SafetyMessage {
  if (bp.systolic >= NICE.clinic.severe.s || bp.diastolic >= NICE.clinic.severe.d) {
    return {
      level: 'very-high',
      title: 'Very high reading',
      body: [
        `If you have ${EMERGENCY_SYMPTOMS}: call 999 now.`,
        'If you feel well: sit quietly for 5 minutes and measure again. If it is still 180/120 mmHg or higher, contact your GP surgery today or call NHS 111.',
      ],
    };
  }
  if (bp.systolic >= NICE.clinic.stage2.s || bp.diastolic >= NICE.clinic.stage2.d) {
    return {
      level: 'high',
      title: 'High reading',
      body: [
        'Rest for 5 minutes and re-measure. A single reading is not a diagnosis.',
        'If readings stay at this level, book a GP or practice nurse appointment and share your home readings.',
        `Seek urgent help (999) if you have ${EMERGENCY_SYMPTOMS}.`,
      ],
    };
  }
  if (bp.systolic < LOW_BP.s || bp.diastolic < LOW_BP.d) {
    return {
      level: 'low',
      title: 'Low reading',
      body: [
        'Low readings are often normal if you feel well.',
        'If you feel dizzy, faint, confused or unwell, sit or lie down and seek medical advice (NHS 111). Call 999 if you collapse or have chest pain.',
      ],
    };
  }
  return { level: 'none', title: '', body: [] };
}

/** Plausibility checks beyond schema bounds; returns warnings, not errors. */
export function readingWarnings(bp: Bp & { pulse?: number }): string[] {
  const w: string[] = [];
  if (bp.systolic - bp.diastolic < 15) w.push('Pulse pressure is unusually narrow – check the values were entered correctly.');
  if (bp.systolic - bp.diastolic > 100) w.push('Pulse pressure is unusually wide – check the values were entered correctly.');
  if (bp.pulse != null && (bp.pulse < 40 || bp.pulse > 120)) w.push('Pulse is outside the usual resting range – check the value and how you feel.');
  return w;
}

export function formatBp(bp: Bp | null | undefined): string {
  if (!bp) return '—';
  return `${Math.round(bp.systolic)}/${Math.round(bp.diastolic)}`;
}

/** Group readings that share a session (taken together). */
export function groupSessions(rs: readonly BloodPressureReading[]): BloodPressureReading[][] {
  const map = new Map<string, BloodPressureReading[]>();
  for (const r of sortByTime(rs)) {
    const key = r.sessionId ?? r.id;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.values()].sort((a, b) => b[0]!.takenAt - a[0]!.takenAt);
}

/** Period from local wall-clock hour: before 12:00 = AM. */
export function periodForTime(time: string): 'AM' | 'PM' {
  return Number(time.slice(0, 2)) < 12 ? 'AM' : 'PM';
}
