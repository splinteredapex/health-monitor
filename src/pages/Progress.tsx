import { useMemo, useState } from 'react';
import type { HealthGoals, UserProfile } from '../db/schemas';
import { saveWeeklyReview } from '../db/repo';
import { averageReadings, formatBp, homeOnly } from '../domain/bp';
import { change } from '../domain/body';
import { exerciseTotals } from '../domain/exercise';
import { adherence, programmePosition, weekDates, type EngineInput } from '../domain/programme';
import { generateWeeklySummary } from '../domain/review';
import { addDays, formatDateUK, formatDayMonth, minutesToHM } from '../lib/dates';
import { mean, round, sum } from '../lib/math';
import { useEngine, useGoals, useProfile, useWeeks } from '../ui/hooks';
import { navigate } from '../ui/router';
import { BpChart, SimpleBar, SimpleLine } from '../ui/charts';
import { Button, Card, Empty, Notice, PageHeader, Segmented, Select, Stat, TextArea, cx, useToast } from '../ui/primitives';
import { fmtSigned } from './Dashboard';

export function Progress({ sub }: { sub: string | undefined }) {
  const tab = sub === 'review' ? 'review' : 'charts';
  const engine = useEngine();
  const profile = useProfile();
  const goals = useGoals();
  if (!engine || !profile) return <p role="status">Loading…</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="Progress" />
      <Segmented label="View" hideLabel value={tab} onChange={(v) => navigate('progress', v === 'review' ? 'review' : undefined)} options={[{ value: 'charts', label: 'Trends' }, { value: 'review', label: 'Weekly review' }]} />
      {tab === 'charts' ? <Trends engine={engine} profile={profile} goals={goals} /> : <Review engine={engine} profile={profile} goals={goals} />}
    </div>
  );
}

function weeksSoFar(engine: EngineInput) {
  const pos = programmePosition(engine.startDate, engine.today);
  return pos.beforeStart ? [] : Array.from({ length: pos.weekNumber }, (_, i) => i + 1);
}

function Trends({ engine, profile, goals }: { engine: EngineInput; profile: UserProfile; goals: HealthGoals }) {
  const { bp, weights, waists, sleep, nutrition, exercise } = engine.data;
  const wk = useMemo(() => weeksSoFar(engine).slice(-16), [engine]);
  const weekly = useMemo(() => wk.map((n) => {
    const { start, end } = weekDates(engine.startDate, n);
    const inW = <T extends { localDate: string }>(xs: readonly T[]) => xs.filter((x) => x.localDate >= start && x.localDate <= end);
    const alc = inW(nutrition).filter((x) => x.alcoholUnits !== null);
    const a = adherence(start, end, engine);
    return { label: `W${n}`, ex: exerciseTotals(inW(exercise)).moderateEquivalentMinutes, adh: a.percent ?? 0, adhKnown: a.percent != null, units: round(sum(alc.map((x) => x.alcoholUnits!)), 1), alcDays: alc.length };
  }), [wk, engine, nutrition, exercise]);

  const home = homeOnly(bp);
  const firstWeek = home.filter((r) => r.localDate <= addDays(home[0]?.localDate ?? engine.today, 6));
  const last7 = home.filter((r) => r.localDate > addDays(engine.today, -7));
  const bpBase = averageReadings(firstWeek), bpNow = averageReadings(last7);
  const lastW = weights[weights.length - 1], lastWa = waists[waists.length - 1];
  const sleep30 = sleep.filter((s) => s.wakeDate > addDays(engine.today, -30));
  const sleepAvg = mean(sleep30.map((s) => s.durationMin));

  return (
    <div className="space-y-4">
      <Card title="Blood pressure">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="First 7 days" value={bpBase ? formatBp(bpBase) : '—'} sub={bpBase ? `${bpBase.count} readings` : 'No data'} />
          <Stat label="Last 7 days" value={bpNow ? formatBp(bpNow) : '—'} sub={bpNow ? `${bpNow.count} readings` : 'No recent data'} />
          <Stat label="Change" value={bpBase && bpNow && bpBase !== bpNow ? `${fmtSigned(round(bpNow.systolic - bpBase.systolic))}/${fmtSigned(round(bpNow.diastolic - bpBase.diastolic))}` : '—'} sub="averages of available readings" />
        </div>
        {home.length > 0 && home.length < 8 && <Notice tone="neutral">Only {home.length} home reading{home.length === 1 ? '' : 's'} so far – too few to judge a trend.</Notice>}
        <div className="mt-3"><BpChart readings={bp} today={engine.today} defaultRange="90" /></div>
      </Card>

      <Card title="Weight & waist">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="Baseline" value={profile.baselineWeightKg} unit="kg" />
          <Stat label="Current" value={lastW?.weightKg ?? '—'} unit={lastW ? 'kg' : undefined} sub={lastW ? `${weights.length} weigh-ins` : 'None yet'} />
          <Stat label="Change" value={fmtSigned(change(profile.baselineWeightKg, lastW?.weightKg))} unit={lastW ? 'kg' : undefined} />
        </div>
        <SimpleLine data={weights.map((w) => ({ label: formatDayMonth(w.localDate), kg: w.weightKg }))} dataKey="kg" name="Weight" unit="kg" target={goals.targetWeightKg} />
        {weights.length > 0 && <p className="mt-2 text-sm text-muted">Weight from {weights[0]!.weightKg} kg to {lastW!.weightKg} kg over {weights.length} measurements.</p>}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Waist baseline" value={profile.baselineWaistCm ?? waists[0]?.waistCm ?? '—'} unit="cm" />
          <Stat label="Current" value={lastWa?.waistCm ?? '—'} unit={lastWa ? 'cm' : undefined} sub={`${waists.length} measurements`} />
          <Stat label="Change" value={fmtSigned(change(profile.baselineWaistCm ?? waists[0]?.waistCm, lastWa?.waistCm))} unit={lastWa ? 'cm' : undefined} />
        </div>
        <div className="mt-3"><SimpleLine data={waists.map((w) => ({ label: formatDayMonth(w.localDate), cm: w.waistCm }))} dataKey="cm" name="Waist" unit="cm" target={goals.targetWaistCm} /></div>
      </Card>

      <Card title="Weekly exercise (moderate-equivalent min)">
        <SimpleBar data={weekly} dataKey="ex" name="Exercise" unit="min" target={goals.weeklyAerobicMinutes} />
        {weekly.length > 0 && <p className="mt-2 text-sm text-muted">{weekly.map((w) => `${w.label}: ${w.ex}`).join(', ')}. Target {goals.weeklyAerobicMinutes}.</p>}
      </Card>

      <Card title="Sleep (last 30 days)">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat label="Average" value={sleepAvg != null ? minutesToHM(sleepAvg) : '—'} sub={`${sleep30.length} nights recorded`} />
          <Stat label="Target" value={`${goals.sleepTargetMinHours}–${goals.sleepTargetMaxHours} h`} />
        </div>
        <SimpleBar data={sleep30.map((s) => ({ label: formatDayMonth(s.wakeDate), h: round(s.durationMin / 60, 1) }))} dataKey="h" name="Sleep" unit="h" target={goals.sleepTargetMinHours} />
      </Card>

      <Card title="Programme adherence by week">
        <SimpleBar data={weekly.filter((w) => w.adhKnown)} dataKey="adh" name="Adherence" unit="%" />
        {weekly.length > 0 && <p className="mt-2 text-sm text-muted">{weekly.filter((w) => w.adhKnown).map((w) => `${w.label}: ${w.adh}%`).join(', ')}. Optional tasks excluded.</p>}
      </Card>

      <Card title="Alcohol by week (UK units)">
        <SimpleBar data={weekly} dataKey="units" name="Alcohol" unit="units" target={goals.weeklyAlcoholUnitsMax} />
        {weekly.length > 0 && <p className="mt-2 text-sm text-muted">{weekly.map((w) => `${w.label}: ${w.units} units (${w.alcDays}/7 days recorded)`).join('; ')}. Unrecorded days are not counted as zero.</p>}
      </Card>
      <p className="text-xs text-muted">Trends show what was recorded. They can’t show cause and effect, and missing days are never filled in.</p>
    </div>
  );
}

function Review({ engine, profile, goals }: { engine: EngineInput; profile: UserProfile; goals: HealthGoals }) {
  const weeks = useWeeks();
  const toast = useToast();
  const all = weeksSoFar(engine);
  const [n, setN] = useState(all[all.length - 1] ?? 1);
  const existing = engine.data.reviews.find((r) => r.weekNumber === n);
  const [reflection, setReflection] = useState(existing?.reflection ?? '');
  const [focus, setFocus] = useState(existing?.nextFocus ?? '');
  const [loadedFor, setLoadedFor] = useState(n);
  if (loadedFor !== n) { setLoadedFor(n); setReflection(existing?.reflection ?? ''); setFocus(existing?.nextFocus ?? ''); }
  const summary = useMemo(() => (weeks && all.length ? generateWeeklySummary(n, engine, profile, goals, weeks) : null), [weeks, n, engine, profile, goals, all.length]);
  if (!all.length) return <Empty>Weekly reviews start once your programme begins.</Empty>;
  if (!summary) return <p role="status">Loading…</p>;

  return (
    <div className="space-y-4">
      <Select label="Week" value={String(n)} onChange={(e) => setN(Number(e.target.value))}>
        {[...all].reverse().map((w) => <option key={w} value={w}>Week {w}{engine.data.reviews.some((r) => r.weekNumber === w) ? ' ✓ reviewed' : ''}</option>)}
      </Select>
      <Card title={`Week ${n} summary`} action={<span className="text-xs text-muted">{formatDateUK(summary.start)} – {formatDateUK(summary.end)}</span>}>
        <ul className="space-y-2 text-sm">{summary.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        {summary.end >= engine.today && <p className="mt-3 text-xs text-muted">This week is still in progress.</p>}
      </Card>
      <Card title={`Missed or skipped (${summary.missedTasks.length})`}>
        {summary.missedTasks.length ? (
          <details><summary className="min-h-10 cursor-pointer text-sm font-medium">Show list</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{summary.missedTasks.map((m) => <li key={m}>{m}</li>)}</ul></details>
        ) : <p className="text-sm text-muted">Nothing missed.</p>}
      </Card>
      <Card title="Next week’s focus">
        <ul className="list-disc space-y-1 pl-5 text-sm">{summary.nextFocus.map((f) => <li key={f}>{f}</li>)}</ul>
      </Card>
      <Card title="Your reflection">
        <div className="space-y-3">
          <TextArea label="How did the week go?" value={reflection} onChange={setReflection} rows={4} />
          <TextArea label="My focus for next week" value={focus} onChange={setFocus} rows={2} />
          <Button className={cx('w-full')} size="lg" onClick={async () => {
            await saveWeeklyReview({ weekNumber: n, startDate: summary.start, endDate: summary.end, generatedAt: Date.now(), summaryLines: summary.lines, ...(reflection.trim() ? { reflection: reflection.trim() } : {}), ...(focus.trim() ? { nextFocus: focus.trim() } : {}) });
            toast('Review saved');
          }}>{existing ? 'Update review' : 'Save review'}</Button>
          {existing && <p className="text-xs text-muted">Last saved {new Date(existing.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</p>}
        </div>
      </Card>
    </div>
  );
}
