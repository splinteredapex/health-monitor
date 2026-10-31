/** Factual, locally generated weekly summary. No inference, no AI. */
import type { HealthGoals, ProgrammeWeek, UserProfile } from '../db/schemas';
import { dateRange, formatDateUK, minutesToHM } from '../lib/dates';
import { round, sum } from '../lib/math';
import { averageReadings, classifyHomeAverage, evaluateProtocol, formatBp, homeOnly, HOME_BAND_TEXT } from './bp';
import { exerciseTotals } from './exercise';
import { adherence, findWeek, occurrencesForDate, weekDates, type EngineInput } from './programme';
import { summariseSleep } from './sleep';

export interface WeeklySummary {
  weekNumber: number;
  start: string;
  end: string;
  lines: string[];
  missedTasks: string[];
  nextFocus: string[];
}

export function generateWeeklySummary(
  weekNumber: number,
  input: EngineInput,
  profile: UserProfile,
  goals: HealthGoals,
  weeks: readonly ProgrammeWeek[],
): WeeklySummary {
  const { start, end } = weekDates(input.startDate, weekNumber);
  const inWeek = <T extends { localDate: string }>(xs: readonly T[]) => xs.filter((x) => x.localDate >= start && x.localDate <= end);
  const lines: string[] = [];

  const adh = adherence(start, end, input);
  lines.push(
    adh.percent == null
      ? 'Tasks: none due yet.'
      : `Tasks: ${adh.completed} of ${adh.due} completed (${adh.percent}%) – ${adh.verified} verified by measurements, ${adh.manual} confirmed manually, ${adh.skipped} skipped, ${adh.missed} missed.`,
  );

  const ex = exerciseTotals(inWeek(input.data.exercise));
  if (ex.sessions === 0) lines.push('Exercise: no sessions recorded.');
  else
    lines.push(
      `Exercise: ${ex.sessions} session${ex.sessions === 1 ? '' : 's'}, ${ex.aerobicMinutes} aerobic min (${ex.easyAerobicMinutes} easy, ${ex.moderateMinutes} moderate, ${ex.vigorousMinutes} hard), ${ex.strengthSessions} strength (target ${goals.weeklyStrengthSessions}).`,
      `Moderate-equivalent minutes: ${ex.moderateEquivalentMinutes} (target ${goals.weeklyAerobicMinutes}). Easy minutes are not counted.`,
    );

  const sl = summariseSleep(input.data.sleep.filter((s) => s.wakeDate >= start && s.wakeDate <= end), goals.sleepTargetMinHours, goals.sleepTargetMaxHours);
  lines.push(
    sl.nights === 0
      ? 'Sleep: no nights recorded.'
      : `Sleep: ${sl.nights} night${sl.nights === 1 ? '' : 's'} recorded, average ${minutesToHM(sl.avgDurationMin!)}; ${sl.nightsInTarget} within ${goals.sleepTargetMinHours}–${goals.sleepTargetMaxHours} h${sl.avgQuality != null ? `; average quality ${sl.avgQuality}/5` : ''}.`,
  );

  const bpWeek = homeOnly(inWeek(input.data.bp));
  const pw = findWeek(weeks, weekNumber);
  if (bpWeek.length === 0) lines.push('Blood pressure: no home readings recorded.');
  else {
    const avg = averageReadings(bpWeek)!;
    lines.push(`Blood pressure: ${avg.count} home reading${avg.count === 1 ? '' : 's'}, average of available readings ${formatBp(avg)} mmHg (not a formal home average).`);
  }
  if (pw?.bpProtocolWeek) {
    const p = evaluateProtocol(input.data.bp, start, input.today);
    if (p.formal) lines.push(`Home monitoring (${p.status === 'complete' ? '7-day protocol complete' : `NICE minimum met, ${p.completeDays} complete days`}): formal average ${formatBp(p.formal)} mmHg from ${p.formal.count} readings. ${HOME_BAND_TEXT[classifyHomeAverage(p.formal)]}`);
    else lines.push(`Home monitoring protocol: ${p.status === 'in-progress' ? 'in progress' : 'incomplete'} (${p.completeDays} of 7 days complete) – no formal average.`);
  }

  const w = [...inWeek(input.data.weights)].sort((a, b) => a.takenAt - b.takenAt);
  if (w.length) {
    const last = w[w.length - 1]!;
    lines.push(`Weight: ${last.weightKg} kg on ${formatDateUK(last.localDate)} (${signed(round(last.weightKg - profile.baselineWeightKg, 1))} kg vs baseline).`);
  } else lines.push('Weight: not recorded this week.');
  const wa = [...inWeek(input.data.waists)].sort((a, b) => a.takenAt - b.takenAt);
  if (wa.length) {
    const last = wa[wa.length - 1]!;
    const base = profile.baselineWaistCm;
    lines.push(`Waist: ${last.waistCm} cm${base != null ? ` (${signed(round(last.waistCm - base, 1))} cm vs baseline)` : ''}.`);
  }

  const nut = inWeek(input.data.nutrition);
  const alcoholDays = nut.filter((n) => n.alcoholUnits !== null);
  const days = dateRange(start, end).filter((d) => d <= input.today).length;
  if (alcoholDays.length === 0) lines.push('Alcohol: not recorded.');
  else {
    const units = round(sum(alcoholDays.map((n) => n.alcoholUnits!)), 1);
    const unrecorded = days - alcoholDays.length;
    lines.push(`Alcohol: ${units} units across ${alcoholDays.length} recorded day${alcoholDays.length === 1 ? '' : 's'}${unrecorded > 0 ? ` (${unrecorded} day${unrecorded === 1 ? '' : 's'} not recorded, so the true total may be higher)` : ''}; target ≤ ${goals.weeklyAlcoholUnitsMax}.`);
  }

  const missedTasks: string[] = [];
  for (const d of dateRange(start, end)) {
    if (d > input.today) break;
    for (const o of occurrencesForDate(d, input)) {
      if (!o.activity.optional && (o.status === 'missed' || o.status === 'skipped')) missedTasks.push(`${formatDateUK(d)}: ${o.activity.title}${o.status === 'skipped' ? ' (skipped)' : ''}`);
    }
  }
  const next = findWeek(weeks, weekNumber + 1);
  return { weekNumber, start, end, lines, missedTasks, nextFocus: next?.objectives ?? [] };
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
