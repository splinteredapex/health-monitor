import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { waistRepo, weightRepo } from '../../db/repo';
import { bmi, bmiBand, change, waistToHeight, whtrBand } from '../../domain/body';
import { formatDateUK, formatDayMonth, isLocalDate, localDateTimeToDate, toLocalDate, toLocalTime } from '../../lib/dates';
import { useEngine, useGoals, useProfile } from '../../ui/hooks';
import { Button, Card, ConfirmSheet, Empty, Field, IconButton, Notice, Stat, parseNum, useToast } from '../../ui/primitives';
import { SimpleLine } from '../../ui/charts';
import { fmtSigned } from '../Dashboard';

type Kind = 'weight' | 'waist';

export function BodyRecord() {
  const engine = useEngine();
  const profile = useProfile();
  const goals = useGoals();
  const toast = useToast();
  const [date, setDate] = useState(toLocalDate());
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [errors, setErrors] = useState<{ weight?: string; waist?: string; date?: string }>({});
  const [del, setDel] = useState<{ kind: Kind; id: string; label: string } | null>(null);
  if (!engine || !profile) return <p role="status">Loading…</p>;
  const { weights, waists } = engine.data;
  const lastW = weights[weights.length - 1];
  const lastWa = waists[waists.length - 1];

  async function save() {
    const e: typeof errors = {};
    const w = parseNum(weight), wa = parseNum(waist);
    if (!isLocalDate(date) || date > engine!.today) e.date = 'Enter a date that is not in the future.';
    if (w == null && wa == null) e.weight = 'Enter weight and/or waist.';
    if (w != null && (Number.isNaN(w) || w < 30 || w > 300)) e.weight = 'Weight must be 30–300 kg.';
    if (wa != null && (Number.isNaN(wa) || wa < 40 || wa > 200)) e.waist = 'Waist must be 40–200 cm.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const at = date === toLocalDate() ? new Date() : localDateTimeToDate(date, '08:00');
    const stamp = { takenAt: at.getTime(), tzOffsetMin: -at.getTimezoneOffset(), localDate: date };
    try {
      if (w != null) await weightRepo.save({ ...stamp, weightKg: Math.round(w * 10) / 10 });
      if (wa != null) await waistRepo.save({ ...stamp, waistCm: Math.round(wa * 10) / 10 });
      toast('Saved');
      setWeight(''); setWaist('');
    } catch { toast('Could not save', 'danger'); }
  }

  const wData = weights.map((w) => ({ label: formatDayMonth(w.localDate), kg: w.weightKg }));
  const waData = waists.map((w) => ({ label: formatDayMonth(w.localDate), cm: w.waistCm }));

  return (
    <div className="space-y-4">
      <Card title="New measurement">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <Field label="Date" type="date" value={date} max={engine.today} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} suffix="kg" error={errors.weight} placeholder={lastW ? String(lastW.weightKg) : ''} />
            <Field label="Waist" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} suffix="cm" error={errors.waist} placeholder={lastWa ? String(lastWa.waistCm) : ''} />
          </div>
          <p className="text-xs text-muted">Weigh in the morning after the toilet, before food. Measure waist halfway between lowest rib and top of hip, breathing out.</p>
          <Button type="submit" size="lg" className="w-full">Save</Button>
        </form>
      </Card>

      <Card title="Weight">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="Baseline" value={profile.baselineWeightKg} unit="kg" />
          <Stat label="Current" value={lastW?.weightKg ?? '—'} unit={lastW ? 'kg' : undefined} sub={lastW && formatDateUK(lastW.localDate)} />
          <Stat label="Change" value={fmtSigned(change(profile.baselineWeightKg, lastW?.weightKg))} unit={lastW ? 'kg' : undefined} />
        </div>
        {lastW && <p className="mb-3 text-sm text-muted">BMI {bmi(lastW.weightKg, profile.heightCm)} – {bmiBand(bmi(lastW.weightKg, profile.heightCm))}. BMI doesn’t distinguish muscle from fat; changes in weight aren’t automatically good or bad.</p>}
        <SimpleLine data={wData} dataKey="kg" name="Weight" unit="kg" target={goals.targetWeightKg} />
        {weights.length > 0 && <p className="mt-2 text-sm text-muted">{weights.length} weigh-in{weights.length === 1 ? '' : 's'}, from {weights[0]!.weightKg} kg ({formatDateUK(weights[0]!.localDate)}) to {lastW!.weightKg} kg ({formatDateUK(lastW!.localDate)}).{goals.targetWeightKg ? ` Dashed line: target ${goals.targetWeightKg} kg.` : ''}</p>}
        <History items={[...weights].reverse().map((w) => ({ id: w.id, label: `${w.weightKg} kg`, date: w.localDate, time: toLocalTime(new Date(w.takenAt)) }))} onDelete={(id, label) => setDel({ kind: 'weight', id, label })} />
      </Card>

      <Card title="Waist">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Stat label="Baseline" value={profile.baselineWaistCm ?? waists[0]?.waistCm ?? '—'} unit={profile.baselineWaistCm ?? waists[0] ? 'cm' : undefined} />
          <Stat label="Current" value={lastWa?.waistCm ?? '—'} unit={lastWa ? 'cm' : undefined} />
          <Stat label="Waist:height" value={lastWa ? waistToHeight(lastWa.waistCm, profile.heightCm) : '—'} />
        </div>
        {lastWa && <Notice tone="neutral">Waist-to-height ratio {waistToHeight(lastWa.waistCm, profile.heightCm)}: {whtrBand(waistToHeight(lastWa.waistCm, profile.heightCm))}. NICE suggests keeping waist below half your height.</Notice>}
        <div className="mt-3"><SimpleLine data={waData} dataKey="cm" name="Waist" unit="cm" target={goals.targetWaistCm} /></div>
        <History items={[...waists].reverse().map((w) => ({ id: w.id, label: `${w.waistCm} cm`, date: w.localDate, time: toLocalTime(new Date(w.takenAt)) }))} onDelete={(id, label) => setDel({ kind: 'waist', id, label })} />
      </Card>

      <ConfirmSheet open={!!del} title="Delete measurement?" body={<p>Delete {del?.label}? This cannot be undone.</p>} confirmLabel="Delete" danger onClose={() => setDel(null)}
        onConfirm={async () => { if (del) await (del.kind === 'weight' ? weightRepo : waistRepo).remove(del.id); setDel(null); toast('Deleted'); }} />
    </div>
  );
}

function History({ items, onDelete }: { items: Array<{ id: string; label: string; date: string; time: string }>; onDelete: (id: string, label: string) => void }) {
  if (!items.length) return <div className="mt-3"><Empty>No records yet.</Empty></div>;
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">History ({items.length})</summary>
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between py-1">
            <span className="tabular text-sm"><span className="font-medium">{i.label}</span> <span className="text-muted">· {formatDateUK(i.date)}</span></span>
            <IconButton label={`Delete ${i.label} on ${formatDateUK(i.date)}`} onClick={() => onDelete(i.id, `${i.label} on ${formatDateUK(i.date)}`)}><Trash2 size={18} aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
    </details>
  );
}
