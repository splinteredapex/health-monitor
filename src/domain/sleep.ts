import { addDays, localDateTimeToDate, type LocalDate, type LocalTime } from '../lib/dates';
import { mean, round } from '../lib/math';
import type { SleepRecord } from '../db/schemas';

export interface SleepTimes {
  bedLocal: string; // YYYY-MM-DDTHH:mm
  wakeLocal: string;
  bedAt: number;
  wakeAt: number;
  durationMin: number;
}

/**
 * Resolve a night's sleep from the wake date and two wall-clock times.
 * If bedtime is later in the day than wake time (e.g. 23:15 → 06:45) the
 * bedtime is on the previous calendar day. Duration uses real elapsed time, so
 * a night spanning a DST change is correctly 1 h shorter/longer.
 */
export function resolveSleep(wakeDate: LocalDate, bedTime: LocalTime, wakeTime: LocalTime): SleepTimes {
  const bedDate = bedTime > wakeTime ? addDays(wakeDate, -1) : wakeDate;
  const bed = localDateTimeToDate(bedDate, bedTime);
  const wake = localDateTimeToDate(wakeDate, wakeTime);
  const durationMin = Math.round((wake.getTime() - bed.getTime()) / 60_000);
  if (durationMin <= 0) throw new RangeError('Wake time must be after bedtime');
  if (durationMin > 20 * 60) throw new RangeError('Sleep longer than 20 hours – please check the times');
  return {
    bedLocal: `${bedDate}T${bedTime}`,
    wakeLocal: `${wakeDate}T${wakeTime}`,
    bedAt: bed.getTime(),
    wakeAt: wake.getTime(),
    durationMin,
  };
}

export interface SleepSummary {
  nights: number;
  avgDurationMin: number | null;
  avgQuality: number | null;
  nightsInTarget: number;
}

export function summariseSleep(records: readonly SleepRecord[], targetMinH: number, targetMaxH: number): SleepSummary {
  const durations = records.map((r) => r.durationMin);
  const qualities = records.map((r) => r.quality).filter((q): q is number => q != null);
  const avg = mean(durations);
  const avgQ = mean(qualities);
  return {
    nights: records.length,
    avgDurationMin: avg == null ? null : Math.round(avg),
    avgQuality: avgQ == null ? null : round(avgQ, 1),
    nightsInTarget: records.filter((r) => r.durationMin >= targetMinH * 60 && r.durationMin <= targetMaxH * 60).length,
  };
}

export const QUALITY_LABELS: Record<number, string> = { 1: 'Very poor', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Very good' };
