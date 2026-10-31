import { useMemo } from 'react';
import { Bell } from 'lucide-react';
import { useDailyMetrics, useEngine, useGoals, useProfile, useWeeks } from '../ui/hooks';
import { adherence, findWeek, occurrencesForDate, programmePosition, latestProtocolStart } from '../domain/programme';
import { averageReadings, evaluateProtocol, formatBp, homeOnly, latestReading, readingSafety } from '../domain/bp';
import { bmi, change, waistToHeight } from '../domain/body';
import { exerciseTotals } from '../domain/exercise';
import { summariseSleep } from '../domain/sleep';
import { dueReminders } from '../domain/reminders';
import { addDays, diffDays, formatDateShort, formatDateUK, minutesToHM } from '../lib/dates';
import { Card, Empty, Notice, PageHeader, Pill, Stat } from '../ui/primitives';
import { TaskRow } from '../ui/TaskRow';
import { navigate } from '../ui/router';
import { PROTOCOL_STATUS_TEXT } from './bpText';

export function Dashboard() {
  const engine = useEngine();
  const profile = useProfile();
  const goals = useGoals();
  const weeks = useWeeks();
  const metrics = useDailyMetrics();
  const today = engine?.today;

  const view = useMemo(() => {
    if (!engine || !profile || !today) return null;
    const pos = programmePosition(engine.startDate, today);
    const tasks = occurrencesForDate(today, engine);
    const required = tasks.filter((t) => !t.activity.optional);
    const done = required.filter((t) => t.status === 'done' || t.status === 'verified').length;
    const weekAdh = pos.beforeStart ? null : adherence(pos.weekStart, pos.weekEnd, engine);
    const progAdh = pos.beforeStart ? null : adherence(engine.startDate, today, engine);
    const { bp, weights, waists, exercise, sleep } = engine.data;
    const home = homeOnly(bp);
    const latest = latestReading(bp);
    const last7 = home.filter((r) => r.localDate > addDays(today, -7));
    const avg7 = averageReadings(last7);
    const pStart = weeks ? latestProtocolStart(engine.startDate, today, weeks) : null;
    const protocol = pStart ? evaluateProtocol(bp, pStart, today) : null;
    const lastW = weights[weights.length - 1];
    const lastWaist = waists[waists.length - 1];
    const weekEx = pos.beforeStart ? exerciseTotals([]) : exerciseTotals(exercise.filter((e) => e.localDate >= pos.weekStart && e.localDate <= pos.weekEnd));
    const sl = summariseSleep(sleep.filter((s) => s.wakeDate > addDays(today, -7)), goals.sleepTargetMinHours, goals.sleepTargetMaxHours);
    const rhr = [...(metrics ?? [])].reverse().find((m) => m.restingHr != null);
    const pulses = last7.map((r) => r.pulse).filter((p): p is number => p != null);
    return { pos, tasks, required, done, weekAdh, progAdh, latest, avg7, protocol, lastW, lastWaist, weekEx, sl, rhr, pulses };
  }, [engine, profile, today, weeks, goals, metrics]);

  if (!view || !profile || !engine || !today) return <p role="status" className="text-muted">Loading…</p>;
  const { pos, tasks, required, done, weekAdh, progAdh, latest, avg7, protocol, lastW, lastWaist, weekEx, sl, rhr, pulses } = view;
  const pct = required.length ? Math.round((done / required.length) * 100) : null;
  const week = findWeek(weeks ?? [], pos.weekNumber);
  const reminders = dueReminders(profile.reminders, engine, new Date());
  const safety = latest ? readingSafety(latest) : null;
  const recentHigh = latest && latest.localDate >= addDays(today, -1) && safety && (safety.level === 'very-high' || safety.level === 'high');

  const subtitle = pos.beforeStart
    ? `Programme starts ${formatDateUK(engine.startDate)} (in ${diffDays(today, engine.startDate)} day${diffDays(today, engine.startDate) === 1 ? '' : 's'})`
    : pos.inMaintenance
      ? `Maintenance · week ${pos.weekNumber}, day ${pos.day}`
      : `Week ${pos.weekNumber} of 12 · day ${pos.day}${week ? ` · ${week.phase}` : ''}`;

  return (
    <div className="space-y-4">
      <PageHeader title={formatDateShort(today)} subtitle={subtitle} />

      {recentHigh && safety && (
        <Notice tone="danger" title={`${safety.title}: ${formatBp(latest)} mmHg`} role="alert">
          {safety.body.map((b) => <p key={b}>{b}</p>)}
        </Notice>
      )}

      {reminders.length > 0 && (
        <Notice tone="info" title="Reminders">
          <ul>{reminders.map((r) => <li key={r.kind} className="flex items-center gap-2"><Bell size={14} aria-hidden />{r.text}</li>)}</ul>
        </Notice>
      )}

      <Card
        title="Today"
        action={pct != null && <span className="tabular text-sm font-medium text-muted" aria-label={`${done} of ${required.length} tasks complete, ${pct} percent`}>{done}/{required.length} · {pct}%</span>}
      >
        {pct != null && (
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Today’s tasks" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        )}
        {tasks.length === 0 ? (
          <Empty>{pos.beforeStart ? 'Your programme hasn’t started yet. You can still record measurements.' : 'No tasks scheduled today.'}</Empty>
        ) : (
          <ul className="space-y-2">{tasks.map((o) => <TaskRow key={o.key} o={o} today={today} />)}</ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Blood pressure" action={<button type="button" className="text-sm font-medium text-primary" onClick={() => navigate('record', 'bp')}>Add</button>}>
          {latest ? (
            <div className="space-y-3">
              <Stat label="Latest reading" value={formatBp(latest)} unit="mmHg" sub={`${formatDateUK(latest.localDate)} ${latest.localTime}${latest.pulse ? ` · pulse ${latest.pulse}` : ''}${latest.setting === 'clinic' ? ' · clinic' : ''}`} />
              <Stat label="7-day average of available readings" value={avg7 ? formatBp(avg7) : '—'} unit={avg7 ? 'mmHg' : undefined} sub={avg7 ? `${avg7.count} home reading${avg7.count === 1 ? '' : 's'} · not a formal average` : 'No home readings in the last 7 days'} />
              {protocol && (
                <div className="text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Formal home monitoring</p>
                  {protocol.formal ? (
                    <p className="tabular mt-0.5"><span className="text-lg font-semibold">{formatBp(protocol.formal)}</span> mmHg <Pill tone="ok">{PROTOCOL_STATUS_TEXT[protocol.status]}</Pill></p>
                  ) : (
                    <p className="mt-0.5"><Pill tone={protocol.status === 'in-progress' ? 'info' : 'warn'}>{PROTOCOL_STATUS_TEXT[protocol.status]}</Pill> <span className="text-muted">{protocol.completeDays}/7 days complete</span></p>
                  )}
                </div>
              )}
            </div>
          ) : <Empty>No readings yet.</Empty>}
        </Card>

        <Card title="Weight" action={<button type="button" className="text-sm font-medium text-primary" onClick={() => navigate('record', 'body')}>Add</button>}>
          {lastW ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current" value={lastW.weightKg} unit="kg" sub={formatDateUK(lastW.localDate)} />
              <Stat label="Change" value={fmtSigned(change(profile.baselineWeightKg, lastW.weightKg))} unit="kg" sub={`Baseline ${profile.baselineWeightKg} kg`} />
              <Stat label="BMI" value={bmi(lastW.weightKg, profile.heightCm)} sub="Doesn’t reflect muscle mass" />
              {lastWaist && <Stat label="Waist" value={lastWaist.waistCm} unit="cm" sub={`Ratio ${waistToHeight(lastWaist.waistCm, profile.heightCm)}${profile.baselineWaistCm ? ` · ${fmtSigned(change(profile.baselineWaistCm, lastWaist.waistCm))} cm` : ''}`} />}
            </div>
          ) : (
            <div className="space-y-2">
              <Stat label="Baseline" value={profile.baselineWeightKg} unit="kg" sub={`BMI ${bmi(profile.baselineWeightKg, profile.heightCm)}`} />
              <p className="text-sm text-muted">No weigh-ins recorded yet.</p>
            </div>
          )}
        </Card>

        <Card title="Exercise this week" action={<button type="button" className="text-sm font-medium text-primary" onClick={() => navigate('record', 'exercise')}>Add</button>}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Moderate-equivalent" value={weekEx.moderateEquivalentMinutes} unit={`/ ${goals.weeklyAerobicMinutes} min`} sub={`${weekEx.easyAerobicMinutes} easy min not counted`} />
            <Stat label="Sessions" value={weekEx.sessions} sub={`${weekEx.strengthSessions}/${goals.weeklyStrengthSessions} strength`} />
          </div>
        </Card>

        <Card title="Sleep (last 7 nights)" action={<button type="button" className="text-sm font-medium text-primary" onClick={() => navigate('record', 'sleep')}>Add</button>}>
          {sl.nights ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Average" value={minutesToHM(sl.avgDurationMin!)} sub={`${sl.nights} night${sl.nights === 1 ? '' : 's'} logged`} />
              <Stat label="In target" value={`${sl.nightsInTarget}/${sl.nights}`} sub={`${goals.sleepTargetMinHours}–${goals.sleepTargetMaxHours} h${sl.avgQuality != null ? ` · quality ${sl.avgQuality}/5` : ''}`} />
            </div>
          ) : <Empty>No sleep logged in the last 7 nights.</Empty>}
        </Card>

        <Card title="Resting pulse">
          {rhr ? (
            <Stat label="Latest resting heart rate" value={rhr.restingHr} unit="bpm" sub={`${formatDateUK(rhr.localDate)}${rhr.source === 'watch' ? ' · from watch' : ''}`} />
          ) : pulses.length ? (
            <Stat label="Average pulse at BP readings (7 days)" value={Math.round(pulses.reduce((a, b) => a + b, 0) / pulses.length)} unit="bpm" sub={`${pulses.length} readings`} />
          ) : <Empty>Optional – add resting heart rate under Record → Lifestyle, or pulse with BP readings.</Empty>}
        </Card>

        <Card title="Programme adherence">
          {weekAdh?.percent != null || progAdh?.percent != null ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="This week" value={weekAdh?.percent ?? '—'} unit={weekAdh?.percent != null ? '%' : undefined} sub={weekAdh ? `${weekAdh.completed}/${weekAdh.due} tasks · ${weekAdh.verified} verified` : undefined} />
              <Stat label="Programme to date" value={progAdh?.percent ?? '—'} unit={progAdh?.percent != null ? '%' : undefined} sub={progAdh ? `${progAdh.missed} missed · ${progAdh.skipped} skipped` : undefined} />
            </div>
          ) : <Empty>Adherence appears once tasks are due.</Empty>}
        </Card>
      </div>
    </div>
  );
}

export const fmtSigned = (n: number | null) => (n == null ? '—' : n > 0 ? `+${n}` : `${n}`);
