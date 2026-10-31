import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react';
import type { Drink, NutritionRecord } from '../../db/schemas';
import { saveDailyMetricForDate, saveNutritionForDate, ValidationError } from '../../db/repo';
import { DRINK_PRESETS, ukUnits, UK_WEEKLY_UNIT_GUIDELINE } from '../../domain/alcohol';
import { addDays, formatDateShort, isLocalDate } from '../../lib/dates';
import { round, sum } from '../../lib/math';
import { programmePosition } from '../../domain/programme';
import { useDailyMetrics, useEngine, useGoals } from '../../ui/hooks';
import { Button, Card, Field, IconButton, Notice, Segmented, Select, Stat, TextArea, parseNum, useToast } from '../../ui/primitives';

type Tri = 'yes' | 'no' | '';
const triOf = (b: boolean | null | undefined): Tri => (b == null ? '' : b ? 'yes' : 'no');
const boolOf = (t: Tri) => (t === '' ? null : t === 'yes');
const numStr = (n: number | null | undefined) => (n == null ? '' : String(n));

export function LifestyleRecord() {
  const engine = useEngine();
  const goals = useGoals();
  const metrics = useDailyMetrics();
  const toast = useToast();
  const [date, setDate] = useState(engine?.today ?? '');
  const today = engine?.today;
  useEffect(() => { if (today && !date) setDate(today); }, [today, date]);
  const rec = engine?.data.nutrition.find((n) => n.localDate === date);
  const metric = metrics?.find((m) => m.localDate === date);

  const [fv, setFv] = useState<number | null>(null);
  const [units, setUnits] = useState('');
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [caffeine, setCaffeine] = useState('');
  const [salt, setSalt] = useState('');
  const [fluids, setFluids] = useState('');
  const [lowSalt, setLowSalt] = useState<Tri>('');
  const [wholeFoods, setWholeFoods] = useState<Tri>('');
  const [noLate, setNoLate] = useState<Tri>('');
  const [notes, setNotes] = useState('');
  const [rhr, setRhr] = useState('');
  const [steps, setSteps] = useState('');
  const [preset, setPreset] = useState('0');
  const [vol, setVol] = useState(String(DRINK_PRESETS[0].volumeMl));
  const [abv, setAbv] = useState(String(DRINK_PRESETS[0].abvPercent));
  const [err, setErr] = useState('');
  const recId = rec?.id;
  const recUpdated = rec?.updatedAt;
  const metricUpdated = metric?.updatedAt;

  // Load the form whenever the date (or the stored record) changes.
  useEffect(() => {
    setFv(rec?.fruitVegPortions ?? null);
    setUnits(numStr(rec?.alcoholUnits));
    setDrinks(rec?.drinks ?? []);
    setCaffeine(numStr(rec?.caffeineMg));
    setSalt(numStr(rec?.saltG));
    setFluids(numStr(rec?.fluidsL));
    setLowSalt(triOf(rec?.targetsMet.lowSalt));
    setWholeFoods(triOf(rec?.targetsMet.wholeFoods));
    setNoLate(triOf(rec?.targetsMet.noLateEating));
    setNotes(rec?.notes ?? '');
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, recId, recUpdated]);
  useEffect(() => {
    setRhr(numStr(metric?.restingHr));
    setSteps(numStr(metric?.steps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, metricUpdated]);

  if (!engine || !date) return <p role="status">Loading…</p>;

  const addDrink = () => {
    const v = parseNum(vol), a = parseNum(abv);
    if (v == null || a == null || Number.isNaN(v) || Number.isNaN(a) || v <= 0 || a < 0 || a > 80) { setErr('Enter a valid volume and ABV.'); return; }
    const p = DRINK_PRESETS[Number(preset)];
    const d: Drink = { label: p && p.volumeMl === v && p.abvPercent === a ? p.label : `${v} ml at ${a}%`, volumeMl: v, abvPercent: a, units: ukUnits(v, a) };
    const next = [...drinks, d];
    setDrinks(next);
    setUnits(String(round(sum(next.map((x) => x.units)), 1)));
    setErr('');
  };
  const removeDrink = (i: number) => {
    const next = drinks.filter((_, j) => j !== i);
    setDrinks(next);
    setUnits(next.length ? String(round(sum(next.map((x) => x.units)), 1)) : '');
  };

  async function save() {
    setErr('');
    const n = (s: string, max: number, label: string) => {
      const v = parseNum(s);
      if (v == null) return null;
      if (Number.isNaN(v) || v < 0 || v > max) throw new ValidationError([{ path: label, message: `${label} must be 0–${max}` }]);
      return v;
    };
    try {
      const patch: Partial<NutritionRecord> = {
        fruitVegPortions: fv, alcoholUnits: n(units, 100, 'Alcohol units'), drinks, caffeineMg: n(caffeine, 3000, 'Caffeine'),
        saltG: n(salt, 50, 'Salt'), fluidsL: n(fluids, 15, 'Fluids'),
        targetsMet: { lowSalt: boolOf(lowSalt), wholeFoods: boolOf(wholeFoods), noLateEating: boolOf(noLate) },
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await saveNutritionForDate(date, patch);
      const r = parseNum(rhr), st = parseNum(steps);
      if (r != null || st != null || metric) {
        if (r != null && (Number.isNaN(r) || r < 25 || r > 200)) throw new ValidationError([{ path: 'rhr', message: 'Resting heart rate must be 25–200' }]);
        if (st != null && (Number.isNaN(st) || st < 0 || st > 200000)) throw new ValidationError([{ path: 'steps', message: 'Steps must be 0–200,000' }]);
        await saveDailyMetricForDate(date, { ...(r != null ? { restingHr: Math.round(r) } : {}), ...(st != null ? { steps: Math.round(st) } : {}) });
      }
      toast('Saved');
    } catch (e) { setErr(e instanceof ValidationError ? e.message : 'Could not save'); }
  }

  // Weekly alcohol (programme week), distinguishing unrecorded days.
  const pos = programmePosition(engine.startDate, date);
  const wkStart = pos.beforeStart ? addDays(date, -6) : pos.weekStart;
  const wkEnd = pos.beforeStart ? date : pos.weekEnd;
  const wk = engine.data.nutrition.filter((x) => x.localDate >= wkStart && x.localDate <= wkEnd && x.alcoholUnits !== null);
  const wkUnits = round(sum(wk.map((x) => x.alcoholUnits!)), 1);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft aria-hidden /></IconButton>
          <div className="text-center">
            <p className="font-semibold">{formatDateShort(date)}</p>
            <input type="date" aria-label="Choose date" className="text-sm text-muted bg-transparent" value={date} max={engine.today} onChange={(e) => isLocalDate(e.target.value) && setDate(e.target.value)} />
          </div>
          <IconButton label="Next day" disabled={date >= engine.today} onClick={() => setDate(addDays(date, 1))}><ChevronRight aria-hidden /></IconButton>
        </div>
        <p className="mt-2 text-center text-xs text-muted">{rec ? 'Recorded – edit and save to update.' : 'Nothing recorded for this day yet. Blank means “not recorded”, not zero.'}</p>
      </Card>

      <Card title="Nutrition">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium" id="fv">Fruit & vegetable portions <span className="font-normal text-muted">(target {goals.dailyFruitVegPortions})</span></p>
            <div className="flex items-center gap-3" role="group" aria-labelledby="fv">
              <IconButton label="One fewer portion" disabled={fv == null || fv <= 0} onClick={() => setFv((v) => (v == null ? 0 : Math.max(0, v - 1)))} className="border border-border"><Minus aria-hidden /></IconButton>
              <output className="tabular w-24 text-center text-2xl font-semibold" aria-live="polite">{fv == null ? '–' : fv}</output>
              <IconButton label="One more portion" onClick={() => setFv((v) => (v == null ? 1 : Math.min(30, v + 1)))} className="border border-border"><Plus aria-hidden /></IconButton>
              {fv == null ? <Button size="sm" variant="ghost" onClick={() => setFv(0)}>None</Button> : <Button size="sm" variant="ghost" onClick={() => setFv(null)}>Clear</Button>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Caffeine" inputMode="numeric" value={caffeine} onChange={(e) => setCaffeine(e.target.value)} suffix="mg" hint="Coffee ≈ 100, tea ≈ 50" />
            <Field label="Salt (if known)" inputMode="decimal" value={salt} onChange={(e) => setSalt(e.target.value)} suffix="g" hint={`Max ${goals.dailySaltMaxG} g`} />
            <Field label="Fluids" inputMode="decimal" value={fluids} onChange={(e) => setFluids(e.target.value)} suffix="L" hint={`Target ${goals.dailyFluidsL} L`} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Self-confirmed targets</legend>
            <Segmented size="sm" label="Kept salt low" value={lowSalt} onChange={setLowSalt} options={[{ value: '', label: '–' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            <Segmented size="sm" label="Mostly whole foods" value={wholeFoods} onChange={setWholeFoods} options={[{ value: '', label: '–' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            <Segmented size="sm" label="No eating late at night" value={noLate} onChange={setNoLate} options={[{ value: '', label: '–' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </fieldset>
        </div>
      </Card>

      <Card title="Alcohol (UK units)">
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Field className="flex-1" label="Units today" inputMode="decimal" value={units} onChange={(e) => { setUnits(e.target.value); setDrinks([]); }} suffix="units" hint="Blank = not recorded" />
            <Button variant="secondary" onClick={() => { setUnits('0'); setDrinks([]); }}>None today</Button>
          </div>
          <details className="rounded-xl border border-border p-3">
            <summary className="min-h-10 cursor-pointer text-sm font-medium">Unit calculator</summary>
            <div className="mt-3 space-y-3">
              <Select label="Drink" value={preset} onChange={(e) => { setPreset(e.target.value); const p = DRINK_PRESETS[Number(e.target.value)]; if (p) { setVol(String(p.volumeMl)); setAbv(String(p.abvPercent)); } }}>
                {DRINK_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Volume" inputMode="numeric" value={vol} onChange={(e) => setVol(e.target.value)} suffix="ml" />
                <Field label="Strength" inputMode="decimal" value={abv} onChange={(e) => setAbv(e.target.value)} suffix="% ABV" />
              </div>
              <p className="text-sm">= <strong className="tabular">{(() => { const v = parseNum(vol), a = parseNum(abv); try { return v != null && a != null ? ukUnits(v, a) : '–'; } catch { return '–'; } })()}</strong> units <span className="text-muted">(ml × ABV ÷ 1000)</span></p>
              <Button size="sm" onClick={addDrink}><Plus size={16} aria-hidden /> Add drink</Button>
              {drinks.length > 0 && (
                <ul className="divide-y divide-border text-sm">
                  {drinks.map((d, i) => (
                    <li key={i} className="flex items-center justify-between py-1"><span>{d.label} – {d.units} units</span><IconButton label={`Remove ${d.label}`} onClick={() => removeDrink(i)}><Trash2 size={16} aria-hidden /></IconButton></li>
                  ))}
                </ul>
              )}
            </div>
          </details>
          <Stat label="This week" value={wkUnits} unit={`/ ${goals.weeklyAlcoholUnitsMax} units`} sub={`${wk.length} of 7 days recorded${wk.length < 7 ? ' – unrecorded days are not counted as zero' : ''}`} />
          {wkUnits > UK_WEEKLY_UNIT_GUIDELINE && <Notice tone="warn">Above the UK Chief Medical Officers’ low-risk guideline of 14 units a week. Alcohol raises blood pressure.</Notice>}
        </div>
      </Card>

      <Card title="Resting heart rate & steps (optional)">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Resting heart rate" inputMode="numeric" value={rhr} onChange={(e) => setRhr(e.target.value)} suffix="bpm" hint="e.g. from your watch" />
          <Field label="Steps" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} />
        </div>
        {metric?.source === 'watch' && <p className="mt-2 text-xs text-muted">Imported from watch.</p>}
      </Card>

      <TextArea label="Notes" value={notes} onChange={setNotes} />
      {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
      <Button size="lg" className="w-full" onClick={save}>Save day</Button>
    </div>
  );
}
