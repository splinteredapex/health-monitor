import type { HealthGoals, UserProfile } from '../db/schemas';
import type { RecordData } from './programme';
import { toCsv } from './csv';
import { averageReadings, classifyHomeAverage, evaluateProtocol, formatBp, homeOnly, HOME_BAND_TEXT, sortByTime } from './bp';
import { addDays, ageOn, formatDateUK, type LocalDate } from '../lib/dates';
import type { DailyMetric } from '../db/schemas';

export type CsvCategory = 'blood-pressure' | 'weight' | 'waist' | 'exercise' | 'sleep' | 'nutrition' | 'daily-metrics';

export function categoryCsv(cat: CsvCategory, d: RecordData, metrics: readonly DailyMetric[]): string {
  switch (cat) {
    case 'blood-pressure':
      return toCsv(sortByTime(d.bp), [['date', (r) => r.localDate], ['time', (r) => r.localTime], ['period', (r) => r.period], ['setting', (r) => r.setting], ['systolic_mmHg', (r) => r.systolic], ['diastolic_mmHg', (r) => r.diastolic], ['pulse_bpm', (r) => r.pulse], ['context', (r) => r.contexts], ['session', (r) => r.sessionId], ['source', (r) => r.source], ['notes', (r) => r.notes]]);
    case 'weight':
      return toCsv(d.weights, [['date', (r) => r.localDate], ['weight_kg', (r) => r.weightKg], ['source', (r) => r.source], ['notes', (r) => r.notes]]);
    case 'waist':
      return toCsv(d.waists, [['date', (r) => r.localDate], ['waist_cm', (r) => r.waistCm], ['source', (r) => r.source], ['notes', (r) => r.notes]]);
    case 'exercise':
      return toCsv(d.exercise, [['date', (r) => r.localDate], ['type', (r) => r.type], ['duration_min', (r) => r.durationMin], ['intensity', (r) => r.intensity], ['distance_km', (r) => r.distanceKm], ['planned', (r) => (r.planned ? 'yes' : 'no')], ['avg_hr', (r) => r.avgHeartRate], ['source', (r) => r.source], ['notes', (r) => r.notes]]);
    case 'sleep':
      return toCsv(d.sleep, [['wake_date', (r) => r.wakeDate], ['bedtime', (r) => r.bedLocal.replace('T', ' ')], ['wake_time', (r) => r.wakeLocal.replace('T', ' ')], ['duration_min', (r) => r.durationMin], ['quality_1to5', (r) => r.quality], ['deep_min', (r) => r.deepMin], ['rem_min', (r) => r.remMin], ['source', (r) => r.source], ['notes', (r) => r.notes]]);
    case 'nutrition':
      return toCsv(d.nutrition, [['date', (r) => r.localDate], ['fruit_veg_portions', (r) => r.fruitVegPortions ?? 'not recorded'], ['alcohol_units', (r) => r.alcoholUnits ?? 'not recorded'], ['caffeine_mg', (r) => r.caffeineMg ?? 'not recorded'], ['salt_g', (r) => r.saltG ?? 'not recorded'], ['fluids_l', (r) => r.fluidsL ?? 'not recorded'], ['low_salt', (r) => tri(r.targetsMet.lowSalt)], ['whole_foods', (r) => tri(r.targetsMet.wholeFoods)], ['no_late_eating', (r) => tri(r.targetsMet.noLateEating)], ['notes', (r) => r.notes]]);
    case 'daily-metrics':
      return toCsv(metrics, [['date', (r) => r.localDate], ['resting_hr_bpm', (r) => r.restingHr], ['steps', (r) => r.steps], ['source', (r) => r.source]]);
  }
}
const tri = (b: boolean | null) => (b == null ? 'not recorded' : b ? 'yes' : 'no');

/** Plain-text BP summary suitable for a GP or practice nurse. */
export function gpSummary(profile: UserProfile, _goals: HealthGoals, d: RecordData, today: LocalDate, protocolStarts: LocalDate[], days = 90): string {
  const from = addDays(today, -(days - 1));
  const rs = sortByTime(d.bp.filter((r) => r.localDate >= from));
  const home = homeOnly(rs);
  const avg = averageReadings(home);
  const out: string[] = [];
  out.push('HOME BLOOD PRESSURE SUMMARY');
  out.push(`Generated ${formatDateUK(today)} by Health Recovery (personal tracking app – not a medical device; values as entered by the patient).`);
  out.push('');
  out.push(`Sex: ${profile.sex}${profile.dateOfBirth ? ` · Age: ${ageOn(profile.dateOfBirth, today)}` : ''} · Height: ${profile.heightCm} cm`);
  if (profile.baselineSystolic && profile.baselineDiastolic) out.push(`Reported historical BP: around ${profile.baselineSystolic}/${profile.baselineDiastolic} mmHg`);
  out.push('');
  out.push(`Period: ${formatDateUK(from)} – ${formatDateUK(today)}`);
  out.push(`Home readings: ${home.length}${avg ? ` · average of all home readings ${formatBp(avg)} mmHg${avg.pulse != null ? `, pulse ${Math.round(avg.pulse)}` : ''}` : ''}`);
  out.push('');
  out.push('HOME MONITORING PERIODS (NICE NG136: 2 readings ~1 min apart, morning and evening, day 1 discarded)');
  const periods = protocolStarts.filter((s) => s >= addDays(from, -6) && s <= today);
  if (!periods.length) out.push('  None in this period.');
  for (const s of periods) {
    const p = evaluateProtocol(d.bp, s, today);
    const label = p.status === 'complete' ? 'complete (7 days)' : p.status === 'minimum' ? `NICE minimum met (${p.completeDays} consecutive days)` : p.status === 'in-progress' ? 'in progress' : `INCOMPLETE (${p.completeDays}/7 days complete)`;
    out.push(`  ${formatDateUK(p.startDate)} – ${formatDateUK(p.endDate)}: ${label}`);
    if (p.formal) out.push(`    Formal home average: ${formatBp(p.formal)} mmHg from ${p.formal.count} readings. ${HOME_BAND_TEXT[classifyHomeAverage(p.formal)]}`);
    else if (p.provisional) out.push(`    Average of available readings (not formal): ${formatBp(p.provisional)} mmHg from ${p.provisional.count} readings.`);
  }
  out.push('');
  out.push('ALL READINGS');
  out.push('Date        Time   AM/PM  Where   BP (mmHg)  Pulse  Context');
  for (const r of rs) {
    out.push(`${formatDateUK(r.localDate)}  ${r.localTime}  ${r.period}     ${r.setting.padEnd(6)}  ${`${r.systolic}/${r.diastolic}`.padEnd(9)}  ${String(r.pulse ?? '').padEnd(5)}  ${r.contexts.join(', ')}${r.notes ? ` – ${r.notes}` : ''}`);
  }
  out.push('');
  out.push('Thresholds referenced: NICE NG136 – home average ≥135/85 mmHg (stage 1), ≥150/95 (stage 2); clinic ≥140/90, ≥160/100, severe ≥180/120.');
  return out.join('\n');
}
