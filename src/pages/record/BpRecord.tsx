import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BloodPressureReading, BpContext } from '../../db/schemas';
import { bpRepo, saveBpSession, ValidationError } from '../../db/repo';
import { averageReadings, evaluateProtocol, formatBp, groupSessions, periodForTime, readingSafety, readingWarnings, classifyHomeAverage, HOME_BAND_TEXT, type SafetyMessage } from '../../domain/bp';
import { latestProtocolStart } from '../../domain/programme';
import { formatDateShort, formatDateUK, isLocalDate, isLocalTime, localDateTimeToDate, toLocalDate, toLocalTime } from '../../lib/dates';
import { useEngine, useWeeks } from '../../ui/hooks';
import { Button, Card, Chip, ConfirmSheet, Empty, Field, IconButton, Notice, Pill, Segmented, Sheet, TextArea, parseNum, useToast } from '../../ui/primitives';
import { BpChart, RANGE_OPTIONS, rangeStart, type RangeKey } from '../../ui/charts';
import { PROTOCOL_STATUS_TEXT } from '../bpText';

const CONTEXTS: Array<{ value: BpContext; label: string }> = [
  { value: 'rested', label: 'Rested 5 min' }, { value: 'caffeine', label: 'Caffeine' }, { value: 'exercise', label: 'After exercise' },
  { value: 'illness', label: 'Unwell' }, { value: 'stress', label: 'Stressed' }, { value: 'other', label: 'Other' },
];

type Row = { s: string; d: string; p: string };
const blank = (): Row => ({ s: '', d: '', p: '' });

function validateRow(r: Row): { errors: Partial<Record<keyof Row, string>>; value?: { systolic: number; diastolic: number; pulse?: number } } {
  const e: Partial<Record<keyof Row, string>> = {};
  const s = parseNum(r.s), d = parseNum(r.d), p = parseNum(r.p);
  if (s == null) e.s = 'Enter systolic';
  else if (!Number.isInteger(s) || s < 50 || s > 300) e.s = 'Systolic must be a whole number 50–300';
  if (d == null) e.d = 'Enter diastolic';
  else if (!Number.isInteger(d) || d < 30 || d > 200) e.d = 'Diastolic must be a whole number 30–200';
  if (p != null && (!Number.isInteger(p) || p < 25 || p > 250)) e.p = 'Pulse must be 25–250';
  if (!e.s && !e.d && s! <= d!) e.s = 'Systolic must be higher than diastolic';
  if (Object.keys(e).length) return { errors: e };
  return { errors: e, value: { systolic: s!, diastolic: d!, ...(p != null ? { pulse: p } : {}) } };
}

export function BpRecord() {
  const engine = useEngine();
  const weeks = useWeeks();
  const toast = useToast();
  const now = new Date();
  const [date, setDate] = useState(toLocalDate(now));
  const [time, setTime] = useState(toLocalTime(now));
  const [period, setPeriod] = useState<'AM' | 'PM'>(periodForTime(toLocalTime(now)));
  const [periodTouched, setPeriodTouched] = useState(false);
  const [setting, setSetting] = useState<'home' | 'clinic'>('home');
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [rowErrors, setRowErrors] = useState<Array<Partial<Record<keyof Row, string>>>>([]);
  const [contexts, setContexts] = useState<BpContext[]>(['rested']);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<{ safety: SafetyMessage; warnings: string[]; text: string } | null>(null);
  const [editing, setEditing] = useState<BloodPressureReading | null>(null);
  const [range, setRange] = useState<RangeKey>('30');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'AM' | 'PM'>('all');
  const [filterSetting, setFilterSetting] = useState<'all' | 'home' | 'clinic'>('all');
  const diaRefs = useRef<Array<HTMLInputElement | null>>([]);

  const today = engine?.today ?? toLocalDate();
  const readings = useMemo(() => engine?.data.bp ?? [], [engine]);

  const protocol = useMemo(() => {
    if (!engine || !weeks) return null;
    const start = latestProtocolStart(engine.startDate, today, weeks);
    return start ? evaluateProtocol(readings, start, today) : null;
  }, [engine, weeks, readings, today]);

  function updateRow(i: number, k: keyof Row, v: string) {
    const clean = v.replace(/[^\d]/g, '').slice(0, 3);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: clean } : r)));
    // Fast entry: jump to diastolic after a 3-digit systolic.
    if (k === 's' && clean.length === 3) diaRefs.current[i]?.focus();
  }

  async function save() {
    setFormError('');
    setResult(null);
    if (!isLocalDate(date) || !isLocalTime(time)) { setFormError('Enter a valid date and time.'); return; }
    const base = localDateTimeToDate(date, time);
    if (base.getTime() > Date.now() + 5 * 60_000) { setFormError('Readings cannot be in the future.'); return; }
    const used = rows.filter((r, i) => i === 0 || r.s || r.d || r.p);
    const checks = used.map(validateRow);
    setRowErrors(checks.map((c) => c.errors));
    if (checks.some((c) => !c.value)) { setFormError('Please correct the highlighted values.'); return; }
    try {
      const saved = await saveBpSession(
        checks.map((c, i) => {
          const at = new Date(base.getTime() + i * 60_000);
          return {
            ...c.value!,
            takenAt: at.getTime(), tzOffsetMin: -at.getTimezoneOffset(), localDate: toLocalDate(at), localTime: toLocalTime(at),
            period, setting, contexts, ...(notes.trim() ? { notes: notes.trim() } : {}),
          };
        }),
      );
      const worst = saved.reduce((m, r) => (r.systolic > m.systolic || r.diastolic > m.diastolic ? r : m), saved[0]!);
      const avg = averageReadings(saved)!;
      setResult({ safety: readingSafety(worst), warnings: [...new Set(saved.flatMap((r) => readingWarnings({ ...r, ...(r.pulse != null ? { pulse: r.pulse } : {}) })))], text: `Saved ${saved.length} reading${saved.length === 1 ? '' : 's'} – session average ${formatBp(avg)} mmHg.` });
      toast(`Saved ${saved.length} reading${saved.length === 1 ? '' : 's'}`);
      setRows([blank(), blank()]);
      setRowErrors([]);
      setNotes('');
      const n = new Date();
      setTime(toLocalTime(n));
      setDate(toLocalDate(n));
    } catch (e) {
      setFormError(e instanceof ValidationError ? e.message : 'Could not save. Storage may be full or unavailable.');
    }
  }

  const from = rangeStart(range, today);
  const filtered = readings.filter((r) => (!from || r.localDate >= from) && (filterPeriod === 'all' || r.period === filterPeriod) && (filterSetting === 'all' || r.setting === filterSetting));
  const sessions = groupSessions(filtered);

  return (
    <div className="space-y-4">
      <Card title="New reading">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            <Field label="Time" type="time" value={time} onChange={(e) => { setTime(e.target.value); if (!periodTouched && isLocalTime(e.target.value)) setPeriod(periodForTime(e.target.value)); }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Segmented label="Session" value={period} onChange={(v) => { setPeriod(v); setPeriodTouched(true); }} options={[{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }]} />
            <Segmented label="Where" value={setting} onChange={setSetting} options={[{ value: 'home', label: 'Home' }, { value: 'clinic', label: 'Clinic' }]} />
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Readings (about 1 minute apart)</legend>
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted">Reading {i + 1}{i > 0 ? ' (leave blank to skip)' : ''}</span>
                  {i > 0 && <IconButton label={`Remove reading ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={18} aria-hidden /></IconButton>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Systolic" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" value={r.s} onChange={(e) => updateRow(i, 's', e.target.value)} error={rowErrors[i]?.s} placeholder="135" />
                  <Field label="Diastolic" ref={(el: HTMLInputElement | null) => { diaRefs.current[i] = el; }} inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" value={r.d} onChange={(e) => updateRow(i, 'd', e.target.value)} error={rowErrors[i]?.d} placeholder="85" />
                  <Field label="Pulse" inputMode="numeric" pattern="[0-9]*" enterKeyHint={i === rows.length - 1 ? 'done' : 'next'} autoComplete="off" value={r.p} onChange={(e) => updateRow(i, 'p', e.target.value)} error={rowErrors[i]?.p} placeholder="opt." />
                </div>
              </div>
            ))}
            {rows.length < 6 && <Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, blank()])}><Plus size={16} aria-hidden /> Add another reading</Button>}
          </fieldset>
          <div>
            <p className="mb-1 text-sm font-medium" id="ctx-label">Context</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ctx-label">
              {CONTEXTS.map((c) => (
                <Chip key={c.value} selected={contexts.includes(c.value)} onClick={() => setContexts((xs) => (xs.includes(c.value) ? xs.filter((x) => x !== c.value) : [...xs, c.value]))}>{c.label}</Chip>
              ))}
            </div>
          </div>
          <TextArea label="Notes (optional)" value={notes} onChange={setNotes} />
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
          <Button type="submit" size="lg" className="w-full">Save readings</Button>
        </form>
        {result && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <p className="text-sm font-medium">{result.text}</p>
            {result.safety.level !== 'none' && (
              <Notice tone={result.safety.level === 'low' ? 'warn' : 'danger'} title={result.safety.title} role="alert">
                {result.safety.body.map((b) => <p key={b}>{b}</p>)}
              </Notice>
            )}
            {result.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
          </div>
        )}
      </Card>

      {protocol && <ProtocolCard protocol={protocol} />}

      <Card title="Chart">
        <BpChart readings={readings} today={today} />
      </Card>

      <Card title="History">
        <div className="mb-3 grid gap-2">
          <Segmented label="History range" hideLabel size="sm" value={range} onChange={setRange} options={RANGE_OPTIONS} />
          <div className="grid grid-cols-2 gap-2">
            <Segmented label="Session filter" hideLabel size="sm" value={filterPeriod} onChange={setFilterPeriod} options={[{ value: 'all', label: 'All' }, { value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]} />
            <Segmented label="Setting filter" hideLabel size="sm" value={filterSetting} onChange={setFilterSetting} options={[{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'clinic', label: 'Clinic' }]} />
          </div>
        </div>
        {sessions.length === 0 ? <Empty>No readings match.</Empty> : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => {
              const first = s[0]!;
              const avg = averageReadings(s)!;
              return (
                <li key={first.sessionId ?? first.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{formatDateShort(first.localDate)} · {first.localTime} · {first.period === 'AM' ? 'Morning' : 'Evening'}{first.setting === 'clinic' ? ' · Clinic' : ''}</p>
                    {s.length > 1 && <span className="tabular text-xs text-muted">avg {formatBp(avg)}</span>}
                  </div>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {s.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setEditing(r)} className="tabular min-h-11 rounded-lg border border-border px-3 text-left hover:bg-surface-2" aria-label={`Edit reading ${r.systolic} over ${r.diastolic} at ${r.localTime}`}>
                          <span className="font-semibold">{r.systolic}/{r.diastolic}</span>
                          {r.pulse != null && <span className="ml-2 text-sm text-muted">♥ {r.pulse}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {(first.contexts.length > 0 || first.notes) && <p className="mt-1 text-xs text-muted">{first.contexts.map((c) => CONTEXTS.find((x) => x.value === c)?.label).join(', ')}{first.notes ? ` · ${first.notes}` : ''}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && <EditReading reading={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProtocolCard({ protocol }: { protocol: ReturnType<typeof evaluateProtocol> }) {
  const tone = protocol.formal ? 'ok' : protocol.status === 'in-progress' ? 'info' : 'warn';
  return (
    <Card title="7-day home monitoring" action={<Pill tone={tone}>{PROTOCOL_STATUS_TEXT[protocol.status]}</Pill>}>
      <p className="text-sm text-muted">{formatDateUK(protocol.startDate)} – {formatDateUK(protocol.endDate)}. 2 morning and 2 evening readings daily; day 1 is excluded from the average (NICE NG136).</p>
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center text-xs" aria-label="Days">
        {protocol.days.map((d) => (
          <li key={d.date} className={`rounded-lg border p-1 ${d.complete ? 'border-ok/40 bg-ok-bg' : 'border-border'}`}>
            <span className="block font-semibold">D{d.dayIndex}</span>
            <span className="block">AM {d.am}</span>
            <span className="block">PM {d.pm}</span>
            <span className="sr-only">{d.complete ? 'complete' : 'incomplete'}{d.excluded ? ', excluded' : ''}</span>
            {d.excluded && <span aria-hidden className="block text-muted">excl.</span>}
          </li>
        ))}
      </ol>
      <div className="mt-3 space-y-2 text-sm">
        {protocol.formal ? (
          <>
            <p><span className="text-muted">Formal home average:</span> <span className="tabular text-lg font-semibold">{formatBp(protocol.formal)}</span> mmHg from {protocol.formal.count} readings</p>
            <Notice tone={classifyHomeAverage(protocol.formal) === 'below-threshold' ? 'ok' : 'warn'}>{HOME_BAND_TEXT[classifyHomeAverage(protocol.formal)]}</Notice>
          </>
        ) : protocol.provisional ? (
          <p><span className="text-muted">Average of available readings (days 2+):</span> <span className="tabular font-semibold">{formatBp(protocol.provisional)}</span> mmHg · {protocol.provisional.count} readings. <strong>Not a formal home average.</strong></p>
        ) : <p className="text-muted">No counted readings yet.</p>}
        {protocol.issues.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">{protocol.issues.length} gap{protocol.issues.length === 1 ? '' : 's'}</summary>
            <ul className="mt-1 list-disc pl-5 text-muted">{protocol.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function EditReading({ reading, onClose }: { reading: BloodPressureReading; onClose: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(reading.localDate);
  const [time, setTime] = useState(reading.localTime);
  const [period, setPeriod] = useState(reading.period);
  const [setting, setSetting] = useState(reading.setting);
  const [row, setRow] = useState<Row>({ s: String(reading.systolic), d: String(reading.diastolic), p: reading.pulse != null ? String(reading.pulse) : '' });
  const [notes, setNotes] = useState(reading.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<keyof Row, string>>>({});
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  async function save() {
    const c = validateRow(row);
    setErrors(c.errors);
    if (!c.value) return;
    if (!isLocalDate(date) || !isLocalTime(time)) { setErr('Enter a valid date and time.'); return; }
    const at = localDateTimeToDate(date, time);
    if (at.getTime() > Date.now() + 5 * 60_000) { setErr('Readings cannot be in the future.'); return; }
    try {
      const { pulse: _p, notes: _n, ...rest } = reading;
      await bpRepo.save({ ...rest, ...c.value, takenAt: at.getTime(), tzOffsetMin: -at.getTimezoneOffset(), localDate: date, localTime: time, period, setting, ...(notes.trim() ? { notes: notes.trim() } : {}) });
      toast('Reading updated');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    }
  }

  return (
    <>
      <Sheet open onClose={onClose} title="Edit reading" footer={<><Button variant="danger" onClick={() => setConfirm(true)} aria-label="Delete reading"><Trash2 size={18} aria-hidden /></Button><Button className="flex-1" onClick={save}>Save changes</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Field label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Segmented label="Session" value={period} onChange={setPeriod} options={[{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }]} />
            <Segmented label="Where" value={setting} onChange={setSetting} options={[{ value: 'home', label: 'Home' }, { value: 'clinic', label: 'Clinic' }]} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Systolic" inputMode="numeric" value={row.s} onChange={(e) => setRow({ ...row, s: e.target.value })} error={errors.s} />
            <Field label="Diastolic" inputMode="numeric" value={row.d} onChange={(e) => setRow({ ...row, d: e.target.value })} error={errors.d} />
            <Field label="Pulse" inputMode="numeric" value={row.p} onChange={(e) => setRow({ ...row, p: e.target.value })} error={errors.p} />
          </div>
          <TextArea label="Notes" value={notes} onChange={setNotes} />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
      </Sheet>
      <ConfirmSheet open={confirm} title="Delete reading?" body={<p>Delete {reading.systolic}/{reading.diastolic} from {formatDateUK(reading.localDate)} {reading.localTime}? This cannot be undone.</p>} confirmLabel="Delete" danger
        onClose={() => setConfirm(false)} onConfirm={async () => { await bpRepo.remove(reading.id); toast('Reading deleted'); setConfirm(false); onClose(); }} />
    </>
  );
}

