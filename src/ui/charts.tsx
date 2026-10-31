import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import type { BloodPressureReading } from '../db/schemas';
import { dailyAverages, sevenDayTrend, homeOnly, NICE } from '../domain/bp';
import { addDays, formatDateUK, formatDayMonth, toLocalDate, type LocalDate } from '../lib/dates';
import { Empty, Segmented } from './primitives';

export type RangeKey = '7' | '30' | '90' | 'all';
export const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All' },
];
export function rangeStart(range: RangeKey, today: LocalDate): LocalDate | null {
  return range === 'all' ? null : addDays(today, -(Number(range) - 1));
}

const C = { s: 'var(--chart-1)', d: 'var(--chart-2)', x: 'var(--chart-3)' };
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Chart wrapper: visual chart is hidden from AT; a textual summary is always provided. */
export function ChartFrame({ summary, children, height = 220 }: { summary: ReactNode; children: ReactNode; height?: number }) {
  return (
    <figure className="m-0">
      <div aria-hidden className="w-full" style={{ height }}>{children}</div>
      <figcaption className="mt-2 text-sm text-muted">{summary}</figcaption>
    </figure>
  );
}

type BpMode = 'readings' | 'daily' | 'trend';

export function BpChart({ readings, today, defaultRange = '30' }: { readings: readonly BloodPressureReading[]; today: LocalDate; defaultRange?: RangeKey }) {
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const [mode, setMode] = useState<BpMode>('daily');
  const from = rangeStart(range, today);
  const home = useMemo(() => homeOnly(readings).filter((r) => !from || r.localDate >= from), [readings, from]);
  const daily = useMemo(() => {
    // Trend needs the preceding 6 days for context, then is clipped to range.
    const all = dailyAverages(readings);
    return sevenDayTrend(all).filter((d) => !from || d.date >= from);
  }, [readings, from]);

  const anim = !reducedMotion();
  let chart: ReactNode;
  if (home.length === 0) chart = null;
  else if (mode === 'readings') {
    const pts = home.map((r) => ({ t: r.takenAt, s: r.systolic, d: r.diastolic, label: `${formatDateUK(r.localDate)} ${r.localTime}` }));
    chart = (
      <ResponsiveContainer>
        <ComposedChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatDayMonth(toLocalDate(new Date(t)))} fontSize={12} minTickGap={24} />
          <YAxis domain={[40, 'dataMax + 10']} fontSize={12} allowDecimals={false} />
          <Tooltip labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string })?.label ?? ''} />
          <ReferenceLine y={NICE.home.stage1.s} stroke={C.s} strokeDasharray="4 4" />
          <ReferenceLine y={NICE.home.stage1.d} stroke={C.d} strokeDasharray="4 4" />
          <Scatter name="Systolic" dataKey="s" fill={C.s} isAnimationActive={anim} />
          <Scatter name="Diastolic" dataKey="d" fill={C.d} shape="diamond" isAnimationActive={anim} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  } else {
    const data = daily.map((d) => ({ ...d, label: formatDayMonth(d.date) }));
    chart = (
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={12} minTickGap={16} />
          <YAxis domain={[40, 'dataMax + 10']} fontSize={12} allowDecimals={false} />
          <Tooltip />
          <ReferenceLine y={NICE.home.stage1.s} stroke={C.s} strokeDasharray="4 4" />
          <ReferenceLine y={NICE.home.stage1.d} stroke={C.d} strokeDasharray="4 4" />
          {mode === 'daily' ? (
            <>
              <Line name="Systolic (daily avg)" dataKey="systolic" stroke={C.s} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={anim} />
              <Line name="Diastolic (daily avg)" dataKey="diastolic" stroke={C.d} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} isAnimationActive={anim} />
            </>
          ) : (
            <>
              <Line name="Systolic 7-day" dataKey="trendS" stroke={C.s} strokeWidth={2} connectNulls={false} dot={false} isAnimationActive={anim} />
              <Line name="Diastolic 7-day" dataKey="trendD" stroke={C.d} strokeWidth={2} strokeDasharray="6 3" connectNulls={false} dot={false} isAnimationActive={anim} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const sMax = home.reduce<BloodPressureReading | null>((m, r) => (!m || r.systolic > m.systolic ? r : m), null);
  const sMin = home.reduce<BloodPressureReading | null>((m, r) => (!m || r.systolic < m.systolic ? r : m), null);
  const days = new Set(home.map((r) => r.localDate)).size;
  const avgS = home.length ? Math.round(home.reduce((a, r) => a + r.systolic, 0) / home.length) : 0;
  const avgD = home.length ? Math.round(home.reduce((a, r) => a + r.diastolic, 0) / home.length) : 0;
  const trendNote = mode === 'trend' && daily.every((d) => d.trendS == null) ? ' A 7-day trend needs readings on at least 3 days within a week.' : '';

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Segmented label="Chart range" hideLabel size="sm" value={range} onChange={setRange} options={RANGE_OPTIONS} />
        <Segmented label="Chart type" hideLabel size="sm" value={mode} onChange={setMode} options={[{ value: 'readings', label: 'Readings' }, { value: 'daily', label: 'Daily avg' }, { value: 'trend', label: '7-day trend' }]} />
      </div>
      {home.length === 0 ? (
        <Empty>No home readings in this period.</Empty>
      ) : (
        <ChartFrame
          summary={
            <>
              <span className="mr-3 inline-flex items-center gap-1"><Swatch color={C.s} /> Systolic</span>
              <span className="mr-3 inline-flex items-center gap-1"><Swatch color={C.d} dashed /> Diastolic</span>
              <span className="inline-flex items-center gap-1">Dashed lines: 135/85 home threshold.</span>
              <span className="mt-1 block">
                {home.length} home reading{home.length === 1 ? '' : 's'} on {days} day{days === 1 ? '' : 's'}; average {avgS}/{avgD} mmHg. Highest systolic {sMax?.systolic}/{sMax?.diastolic} on {sMax && formatDateUK(sMax.localDate)}; lowest {sMin?.systolic}/{sMin?.diastolic} on {sMin && formatDateUK(sMin.localDate)}.{trendNote}
              </span>
            </>
          }
        >
          {chart}
        </ChartFrame>
      )}
    </div>
  );
}

export function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)` : color }} />;
}

export function SimpleLine({ data, dataKey, name, unit, target, height = 200 }: { data: Array<Record<string, unknown>>; dataKey: string; name: string; unit: string; target?: number | undefined; height?: number }) {
  if (!data.length) return <Empty>No data yet.</Empty>;
  return (
    <div aria-hidden style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={12} minTickGap={16} />
          <YAxis domain={['dataMin - 2', 'dataMax + 2']} fontSize={12} tickFormatter={(v: number) => String(Math.round(v))} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, name]} />
          {target != null && <ReferenceLine y={target} stroke={C.x} strokeDasharray="4 4" />}
          <Line dataKey={dataKey} name={name} stroke={C.s} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={!reducedMotion()} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBar({ data, dataKey, name, unit, target, height = 200 }: { data: Array<Record<string, unknown>>; dataKey: string; name: string; unit: string; target?: number | undefined; height?: number }) {
  if (!data.length) return <Empty>No data yet.</Empty>;
  return (
    <div aria-hidden style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={12} minTickGap={8} />
          <YAxis fontSize={12} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, name]} />
          {target != null && <ReferenceLine y={target} stroke={C.x} strokeDasharray="4 4" />}
          <Bar dataKey={dataKey} name={name} fill={C.s} radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion()} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
