import { useState } from 'react';
import { ShieldCheck, HeartPulse } from 'lucide-react';
import { completeOnboarding, DEFAULT_REMINDERS, requestPersistentStorage, ValidationError } from '../db/repo';
import { formatDateUK, isLocalDate, todayLocal } from '../lib/dates';
import { Button, Card, Field, Notice, Segmented, TextArea, parseNum, useToast } from '../ui/primitives';
import type { UserProfile } from '../db/schemas';

const STEPS = ['Welcome', 'About you', 'Programme', 'Privacy'] as const;

export function Onboarding() {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [sex, setSex] = useState<UserProfile['sex']>('male');
  const [dob, setDob] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [injuries, setInjuries] = useState('');
  const [start, setStart] = useState(todayLocal());
  const [targetWeight, setTargetWeight] = useState('');
  const [targetWaist, setTargetWaist] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0 && !ack) e.ack = 'Please confirm you have read this.';
    if (s === 1) {
      const h = parseNum(height), w = parseNum(weight), wa = parseNum(waist), sy = parseNum(sys), di = parseNum(dia);
      if (dob && (!isLocalDate(dob) || dob > todayLocal())) e.dob = 'Enter a valid date of birth.';
      if (h == null || Number.isNaN(h) || h < 100 || h > 250) e.height = 'Height must be 100–250 cm.';
      if (w == null || Number.isNaN(w) || w < 30 || w > 300) e.weight = 'Weight must be 30–300 kg.';
      if (wa != null && (Number.isNaN(wa) || wa < 40 || wa > 200)) e.waist = 'Waist must be 40–200 cm.';
      if (sy != null && (Number.isNaN(sy) || sy < 70 || sy > 260)) e.sys = 'Systolic must be 70–260.';
      if (di != null && (Number.isNaN(di) || di < 40 || di > 160)) e.dia = 'Diastolic must be 40–160.';
      if (sy != null && di != null && sy <= di) e.sys = 'Systolic must be higher than diastolic.';
    }
    if (s === 2) {
      if (!isLocalDate(start)) e.start = 'Choose a start date.';
      const tw = parseNum(targetWeight), twa = parseNum(targetWaist);
      if (tw != null && (Number.isNaN(tw) || tw < 30 || tw > 300)) e.targetWeight = 'Target must be 30–300 kg.';
      if (twa != null && (Number.isNaN(twa) || twa < 40 || twa > 200)) e.targetWaist = 'Target must be 40–200 cm.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function finish() {
    setBusy(true);
    try {
      const opt = (s: string) => { const n = parseNum(s); return n == null ? undefined : n; };
      await requestPersistentStorage();
      await completeOnboarding(
        {
          sex,
          ...(dob ? { dateOfBirth: dob } : {}),
          heightCm: opt(height)!,
          baselineWeightKg: opt(weight)!,
          ...(opt(waist) != null ? { baselineWaistCm: opt(waist) } : {}),
          ...(opt(sys) != null ? { baselineSystolic: Math.round(opt(sys)!) } : {}),
          ...(opt(dia) != null ? { baselineDiastolic: Math.round(opt(dia)!) } : {}),
          programmeStartDate: start,
          ...(injuries.trim() ? { injuryNotes: injuries.trim() } : {}),
          theme: 'system',
          reminders: DEFAULT_REMINDERS,
          disclaimerAcceptedAt: Date.now(),
        },
        { ...(opt(targetWeight) != null ? { targetWeightKg: opt(targetWeight) } : {}), ...(opt(targetWaist) != null ? { targetWaistCm: opt(targetWaist) } : {}) },
      );
      toast('Your programme is ready');
    } catch (err) {
      toast(err instanceof ValidationError ? err.message : 'Could not save – storage may be unavailable.', 'danger');
      setBusy(false);
    }
  }

  const next = () => { if (validateStep(step)) setStep((s) => s + 1); };

  return (
    <main className="safe-top mx-auto max-w-lg px-4 pb-10 pt-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white dark:bg-surface-2"><HeartPulse aria-hidden /></span>
        <div>
          <h1 className="text-xl font-semibold">Health Recovery</h1>
          <p className="text-sm text-muted">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
        </div>
      </div>
      <ol className="mb-5 grid grid-cols-4 gap-1" aria-hidden>
        {STEPS.map((s, i) => <li key={s} className={`h-1.5 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`} />)}
      </ol>

      {step === 0 && (
        <Card title="Before you start">
          <div className="space-y-3 text-sm">
            <p>This app helps you follow a 12-week programme and keep accurate records of your blood pressure, body measurements, exercise, sleep and lifestyle.</p>
            <Notice tone="info" title="Not a medical device">
              <p>It does not diagnose conditions or recommend medication. Thresholds follow UK NICE guidance for information only. Always follow advice from your GP or health professional.</p>
            </Notice>
            <Notice tone="danger" title="In an emergency call 999">
              <p>If you have chest pain, sudden breathlessness, severe headache, weakness, confusion or vision changes, call 999.</p>
            </Notice>
            <label className="flex min-h-12 items-start gap-3 rounded-xl border border-border p-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-describedby={errors.ack ? 'ack-err' : undefined} />
              <span>I understand this app is for personal tracking and is not medical advice.</span>
            </label>
            {errors.ack && <p id="ack-err" role="alert" className="text-sm text-danger">{errors.ack}</p>}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="About you">
          <div className="grid gap-4">
            <Segmented label="Sex" value={sex} onChange={setSex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'unspecified', label: 'Prefer not' }]} />
            <Field label="Date of birth (optional)" type="date" value={dob} max={todayLocal()} onChange={(e) => setDob(e.target.value)} error={errors.dob} hint="Used to show your age and estimate exercise intensity from heart rate." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} suffix="cm" error={errors.height} />
              <Field label="Baseline weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} suffix="kg" error={errors.weight} />
            </div>
            <Field label="Baseline waist (optional)" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} suffix="cm" error={errors.waist} />
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-1 text-sm font-medium">Typical historical BP (optional)</legend>
              <Field label="Systolic" inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} suffix="mmHg" error={errors.sys} />
              <Field label="Diastolic" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} suffix="mmHg" error={errors.dia} />
            </fieldset>
            <TextArea label="Injuries / limitations (optional)" value={injuries} onChange={setInjuries} rows={3} hint="e.g. past tendon or joint problems. Shown alongside exercise as a reminder. The plan never prescribes high-intensity work." />
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Your programme">
          <div className="grid gap-4">
            <Field label="Programme start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} error={errors.start} hint={isLocalDate(start) ? `Week 1 begins ${formatDateUK(start)}. Weeks progress by calendar – missed tasks never block you.` : undefined} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target weight (optional)" inputMode="decimal" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} suffix="kg" error={errors.targetWeight} />
              <Field label="Target waist (optional)" inputMode="decimal" value={targetWaist} onChange={(e) => setTargetWaist(e.target.value)} suffix="cm" error={errors.targetWaist} />
            </div>
            <Notice tone="warn" title="Check with your GP first">
              <p>
                {Number(sys) >= 140 || Number(dia) >= 90
                  ? `Your typical readings (${sys}/${dia} mmHg) are at or above the NICE clinic threshold of 140/90. `
                  : ''}
                Week 1 includes a reminder to book a GP or practice nurse review before increasing activity. Exercise targets build gradually and can be edited at any time.
              </p>
            </Notice>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title={<span className="flex items-center gap-2"><ShieldCheck size={18} aria-hidden /> Your data stays on this device</span>}>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>No account, no cloud, no analytics, no adverts. Nothing is sent anywhere.</li>
            <li>Data is stored in this browser’s local storage. It is <strong>not encrypted</strong> by the app – protect your phone with a screen lock.</li>
            <li>Clearing site data, uninstalling the app or resetting the browser <strong>will delete your records</strong>. Export a backup regularly from Settings → Data.</li>
            <li>We’ll ask the browser to keep your data persistent where supported.</li>
          </ul>
        </Card>
      )}

      <div className="mt-5 flex gap-3">
        {step > 0 && <Button variant="secondary" className="flex-1" onClick={() => setStep((s) => s - 1)}>Back</Button>}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" onClick={next}>Continue</Button>
        ) : (
          <Button className="flex-1" onClick={finish} disabled={busy}>{busy ? 'Setting up…' : 'Start my programme'}</Button>
        )}
      </div>
    </main>
  );
}
