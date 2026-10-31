import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import type { HealthGoals, ReminderPrefs, Theme, UserProfile } from '../db/schemas';
import { requestPersistentStorage, saveGoals, saveProfile, ValidationError } from '../db/repo';
import { applyImport, exportBackup, parseBackup, previewImport, resetAllData, type Backup, type ImportPreview } from '../db/backup';
import { categoryCsv, gpSummary, type CsvCategory } from '../domain/exports';
import { weekDates } from '../domain/programme';
import { formatDateUK, isLocalDate, todayLocal } from '../lib/dates';
import { useDailyMetrics, useEngine, useGoals, useProfile, useWeeks } from '../ui/hooks';
import { downloadText } from '../ui/download';
import { Button, Card, ConfirmSheet, Field, Notice, PageHeader, Segmented, Select, Sheet, TextArea, parseNum, useToast } from '../ui/primitives';
import { HealthConnectCard } from '../native/HealthConnectCard';
import { nativeNotificationsAvailable, scheduleNativeReminders } from '../native/notifications';

const stamp = () => todayLocal();

export function Settings() {
  const profile = useProfile();
  const goals = useGoals();
  if (!profile) return <p role="status">Loading…</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <ProfileCard profile={profile} />
      <ProgrammeCard profile={profile} />
      <GoalsCard goals={goals} />
      <AppearanceCard theme={profile.theme} />
      <RemindersCard prefs={profile.reminders} start={profile.programmeStartDate} />
      <HealthConnectCard />
      <DataCard />
      <StorageCard />
      <AboutCard />
    </div>
  );
}

function useSaver() {
  const toast = useToast();
  return async (fn: () => Promise<unknown>, ok = 'Saved') => {
    try { await fn(); toast(ok); return true; } catch (e) { toast(e instanceof ValidationError ? e.message : 'Could not save', 'danger'); return false; }
  };
}

function ProfileCard({ profile }: { profile: UserProfile }) {
  const save = useSaver();
  const [sex, setSex] = useState(profile.sex);
  const [dob, setDob] = useState(profile.dateOfBirth ?? '');
  const [height, setHeight] = useState(String(profile.heightCm));
  const [weight, setWeight] = useState(String(profile.baselineWeightKg));
  const [waist, setWaist] = useState(profile.baselineWaistCm != null ? String(profile.baselineWaistCm) : '');
  const [sys, setSys] = useState(profile.baselineSystolic != null ? String(profile.baselineSystolic) : '');
  const [dia, setDia] = useState(profile.baselineDiastolic != null ? String(profile.baselineDiastolic) : '');
  const [injury, setInjury] = useState(profile.injuryNotes ?? '');
  const [medical, setMedical] = useState(profile.medicalNotes ?? '');
  const opt = (s: string) => { const n = parseNum(s); return n == null ? undefined : n; };
  return (
    <Card title="Profile & baseline">
      <div className="grid gap-3">
        <Segmented label="Sex" value={sex} onChange={setSex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'unspecified', label: 'Prefer not' }]} />
        <Field label="Date of birth" type="date" value={dob} max={todayLocal()} onChange={(e) => setDob(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height" inputMode="decimal" suffix="cm" value={height} onChange={(e) => setHeight(e.target.value)} />
          <Field label="Baseline weight" inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <Field label="Baseline waist" inputMode="decimal" suffix="cm" value={waist} onChange={(e) => setWaist(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Hist. sys" inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} />
            <Field label="Hist. dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>
        </div>
        <TextArea label="Injuries / limitations" value={injury} onChange={setInjury} />
        <TextArea label="Medical notes (for your reference)" value={medical} onChange={setMedical} />
        <Button onClick={() => save(() => saveProfile({
          sex, dateOfBirth: isLocalDate(dob) ? dob : undefined, heightCm: opt(height) ?? NaN, baselineWeightKg: opt(weight) ?? NaN,
          baselineWaistCm: opt(waist), baselineSystolic: opt(sys), baselineDiastolic: opt(dia), injuryNotes: injury, medicalNotes: medical,
        }))}>Save profile</Button>
      </div>
    </Card>
  );
}

function ProgrammeCard({ profile }: { profile: UserProfile }) {
  const save = useSaver();
  const [start, setStart] = useState(profile.programmeStartDate);
  const [confirm, setConfirm] = useState(false);
  return (
    <Card title="Programme">
      <div className="space-y-3">
        <Field label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} hint={`Current: ${formatDateUK(profile.programmeStartDate)}`} />
        <Button variant="secondary" disabled={!isLocalDate(start) || start === profile.programmeStartDate} onClick={() => setConfirm(true)}>Change start date</Button>
      </div>
      <ConfirmSheet open={confirm} title="Change start date?" confirmLabel="Change" onClose={() => setConfirm(false)}
        body={<><p>Your programme weeks will be re-aligned to start on {isLocalDate(start) ? formatDateUK(start) : ''}.</p><p>All measurements and completion history are kept. Completions stay on the dates they were made, so some may no longer match a scheduled task.</p></>}
        onConfirm={async () => { await save(() => saveProfile({ programmeStartDate: start }), 'Start date changed'); setConfirm(false); }} />
    </Card>
  );
}

function GoalsCard({ goals }: { goals: HealthGoals }) {
  const save = useSaver();
  const [g, setG] = useState(() => Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, v == null ? '' : String(v)])) as Record<string, string>);
  const f = (k: keyof HealthGoals, label: string, suffix: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <Field label={label} inputMode={mode} suffix={suffix} value={g[k] ?? ''} onChange={(e) => setG({ ...g, [k]: e.target.value })} />
  );
  return (
    <Card title="Targets">
      <div className="grid grid-cols-2 gap-3">
        {f('targetWeightKg', 'Target weight', 'kg')}
        {f('targetWaistCm', 'Target waist', 'cm')}
        {f('weeklyAerobicMinutes', 'Weekly aerobic', 'min', 'numeric')}
        {f('weeklyStrengthSessions', 'Strength sessions', '/wk', 'numeric')}
        {f('sleepTargetMinHours', 'Sleep minimum', 'h')}
        {f('sleepTargetMaxHours', 'Sleep maximum', 'h')}
        {f('weeklyAlcoholUnitsMax', 'Alcohol max', 'units/wk')}
        {f('dailyFruitVegPortions', 'Fruit & veg', '/day', 'numeric')}
        {f('dailySaltMaxG', 'Salt max', 'g/day')}
        {f('dailyFluidsL', 'Fluids', 'L/day')}
        {f('dailyCaffeineMaxMg', 'Caffeine max', 'mg/day', 'numeric')}
      </div>
      <p className="mt-2 text-xs text-muted">UK guidance: 150 min moderate activity and 2 strength sessions a week; ≤14 alcohol units a week; ≤6 g salt a day.</p>
      <Button className="mt-3" onClick={() => {
        const num = (k: string) => { const n = parseNum(g[k] ?? ''); return n == null ? undefined : n; };
        void save(() => saveGoals({
          targetWeightKg: num('targetWeightKg'), targetWaistCm: num('targetWaistCm'), weeklyAerobicMinutes: num('weeklyAerobicMinutes') ?? NaN, weeklyStrengthSessions: num('weeklyStrengthSessions') ?? NaN,
          sleepTargetMinHours: num('sleepTargetMinHours') ?? NaN, sleepTargetMaxHours: num('sleepTargetMaxHours') ?? NaN, weeklyAlcoholUnitsMax: num('weeklyAlcoholUnitsMax') ?? NaN,
          dailyFruitVegPortions: num('dailyFruitVegPortions') ?? NaN, dailySaltMaxG: num('dailySaltMaxG') ?? NaN, dailyFluidsL: num('dailyFluidsL') ?? NaN, dailyCaffeineMaxMg: num('dailyCaffeineMaxMg') ?? NaN,
        }));
      }}>Save targets</Button>
    </Card>
  );
}

function AppearanceCard({ theme }: { theme: Theme }) {
  const save = useSaver();
  return (
    <Card title="Appearance">
      <Segmented label="Theme" value={theme} onChange={(t) => void save(() => saveProfile({ theme: t }), 'Theme updated')} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      <p className="mt-2 text-xs text-muted">Units: kg, cm, mmHg, UK alcohol units. Dates: DD/MM/YYYY.</p>
    </Card>
  );
}

function RemindersCard({ prefs, start }: { prefs: ReminderPrefs; start: string }) {
  const save = useSaver();
  const toast = useToast();
  const native = nativeNotificationsAvailable();
  const [p, setP] = useState(prefs);
  const [perm, setPerm] = useState(native ? 'default' : typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const set = (patch: Partial<ReminderPrefs>) => setP({ ...p, ...patch });
  return (
    <Card title="Reminders">
      <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Show in-app reminders</label>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Morning BP" type="time" value={p.bpMorning} onChange={(e) => set({ bpMorning: e.target.value })} />
          <Field label="Evening BP" type="time" value={p.bpEvening} onChange={(e) => set({ bpEvening: e.target.value })} />
          <Field label="Exercise" type="time" value={p.exercise} onChange={(e) => set({ exercise: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Weigh-in day" value={String(p.weighInDay)} onChange={(e) => set({ weighInDay: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>Programme day {d}</option>)}</Select>
          <Select label="Weekly review day" value={String(p.weeklyReviewDay)} onChange={(e) => set({ weeklyReviewDay: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>Programme day {d}</option>)}</Select>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={p.notifications} disabled={perm === 'unsupported' || perm === 'denied'}
            onChange={async (e) => {
              if (!native && e.target.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                const r = await Notification.requestPermission();
                setPerm(r);
                if (r !== 'granted') return;
              }
              set({ notifications: e.target.checked });
            }} />
          Also show system notifications
        </label>
        <Notice tone="neutral">
          {native ? (
            <p>Notifications are scheduled on this phone and fire even when the app is closed. Battery optimisation can occasionally delay them. Evening BP and exercise reminders fire daily, even on days without that task.</p>
          ) : (
            <p>In the browser, reminders only work while the app is open (or recently in the background). It cannot guarantee a notification when closed – use the Android app or your phone’s alarm for reminders you must not miss.</p>
          )}
          {perm === 'denied' && <p>Notifications are blocked in your browser settings.</p>}
        </Notice>
        <Button onClick={async () => {
          const ok = await save(() => saveProfile({ reminders: p }));
          if (ok && native) {
            const r = await scheduleNativeReminders(p, start).catch(() => 'denied' as const);
            if (r === 'denied') toast('Notification permission was not granted', 'warn');
          }
        }}>Save reminders</Button>
      </div>
    </Card>
  );
}

function DataCard() {
  const toast = useToast();
  const engine = useEngine();
  const profile = useProfile();
  const goals = useGoals();
  const weeks = useWeeks();
  const metrics = useDailyMetrics();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<CsvCategory>('blood-pressure');
  const [pending, setPending] = useState<{ backup: Backup; preview: ImportPreview; warnings: string[] } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState('');
  const [gpOpen, setGpOpen] = useState(false);

  const gpText = () => {
    if (!engine || !profile || !weeks) return '';
    const starts = weeks.filter((w) => w.bpProtocolWeek && w.weekNumber > 0).map((w) => weekDates(engine.startDate, w.weekNumber).start);
    return gpSummary(profile, goals, engine.data, engine.today, starts);
  };
  const backupNow = async () => {
    downloadText(`health-recovery-backup-${stamp()}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json');
    toast('Backup downloaded');
  };

  async function onFile(f: File | undefined) {
    setImportErrors([]);
    if (!f) return;
    try {
      const r = parseBackup(await f.text());
      if (!r.ok) { setImportErrors(r.errors); return; }
      setPending({ backup: r.backup, preview: await previewImport(r.backup), warnings: r.warnings });
    } catch { setImportErrors(['Could not read the file.']); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <Card title="Data">
      <div className="space-y-4">
        <div>
          <h3 className="mb-1 text-sm font-semibold">Full backup</h3>
          <p className="mb-2 text-xs text-muted">One JSON file with everything. Keep it somewhere safe (e.g. your own cloud drive). It is not encrypted.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={backupNow}><Download size={16} aria-hidden /> Export backup</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={16} aria-hidden /> Restore from backup</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose backup file" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
          {importErrors.length > 0 && (
            <div className="mt-2"><Notice tone="danger" title="Backup not imported" role="alert"><ul className="list-disc pl-4">{importErrors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul><p>Nothing was changed.</p></Notice></div>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Spreadsheet export (CSV)</h3>
          <div className="flex items-end gap-2">
            <Select className="flex-1" label="Category" value={cat} onChange={(e) => setCat(e.target.value as CsvCategory)}>
              <option value="blood-pressure">Blood pressure</option><option value="weight">Weight</option><option value="waist">Waist</option><option value="exercise">Exercise</option>
              <option value="sleep">Sleep</option><option value="nutrition">Nutrition & alcohol</option><option value="daily-metrics">Resting HR & steps</option>
            </Select>
            <Button variant="secondary" disabled={!engine} onClick={() => engine && downloadText(`health-recovery-${cat}-${stamp()}.csv`, categoryCsv(cat, engine.data, metrics ?? []), 'text/csv')}>Download</Button>
          </div>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">GP blood pressure summary</h3>
          <p className="mb-2 text-xs text-muted">Last 90 days: monitoring periods, formal averages and every reading, in plain text.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setGpOpen(true)}><FileText size={16} aria-hidden /> View</Button>
            <Button variant="secondary" onClick={() => downloadText(`bp-summary-${stamp()}.txt`, gpText())}><Download size={16} aria-hidden /> Download</Button>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="mb-1 text-sm font-semibold text-danger">Delete all data</h3>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>Delete everything…</Button>
        </div>
      </div>

      <Sheet open={gpOpen} onClose={() => setGpOpen(false)} title="GP summary">
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap text-xs">{gpOpen ? gpText() : ''}</pre>
      </Sheet>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restore backup"
        footer={<><Button variant="secondary" className="flex-1" onClick={async () => {
          if (!pending) return;
          try { const r = await applyImport(pending.backup, 'merge'); toast(`Added ${r.added} records, kept ${r.skipped} existing`); setPending(null); } catch { toast('Import failed – nothing changed', 'danger'); }
        }}>Merge</Button><Button variant="danger" className="flex-1" onClick={() => setConfirmReplace(true)}>Replace all</Button></>}>
        {pending && (
          <div className="space-y-3 text-sm">
            <p>Backup from {pending.backup.exportedAt ? new Date(pending.backup.exportedAt).toLocaleString('en-GB') : 'unknown date'} · {pending.preview.totalIncoming} records.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="text-muted"><th className="py-1">Type</th><th>In file</th><th>On device</th><th>New</th><th>Same</th><th>Conflicts</th></tr></thead>
                <tbody>{pending.preview.tables.filter((t) => t.incoming || t.existing).map((t) => (
                  <tr key={t.table} className="border-t border-border tabular"><td className="py-1">{t.table}</td><td>{t.incoming}</td><td>{t.existing}</td><td>{t.added}</td><td>{t.identical}</td><td>{t.conflicts}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <Notice tone="info"><p><strong>Merge</strong> adds {pending.preview.totalAdded} new records and never overwrites the {pending.preview.totalConflicts} conflicting ones on this device.</p><p><strong>Replace all</strong> deletes everything on this device first, then loads the backup.</p></Notice>
            {pending.warnings.length > 0 && <Notice tone="warn">{pending.warnings.map((w) => <p key={w}>{w}</p>)}</Notice>}
          </div>
        )}
      </Sheet>
      <ConfirmSheet open={confirmReplace} danger title="Replace all data?" confirmLabel="Replace"
        body={<><p>All {pending?.preview.totalExisting ?? 0} records on this device will be deleted and replaced by the backup. This cannot be undone.</p><p>Tip: export a backup of the current data first.</p><Button variant="secondary" size="sm" onClick={backupNow}>Export current data first</Button></>}
        onClose={() => setConfirmReplace(false)}
        onConfirm={async () => {
          if (!pending) return;
          try { await applyImport(pending.backup, 'replace'); toast('Backup restored'); } catch { toast('Import failed – nothing changed', 'danger'); }
          setConfirmReplace(false); setPending(null);
        }} />
      <Sheet open={confirmReset} onClose={() => { setConfirmReset(false); setResetText(''); }} title="Delete all data?"
        footer={<Button variant="danger" className="flex-1" disabled={resetText !== 'DELETE'} onClick={async () => { await resetAllData(); toast('All data deleted'); setConfirmReset(false); }}>Delete permanently</Button>}>
        <div className="space-y-3 text-sm">
          <p>This permanently deletes your profile, plan and every record on this device.</p>
          <Button variant="secondary" size="sm" onClick={backupNow}>Export a backup first</Button>
          <Field label='Type "DELETE" to confirm' value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
        </div>
      </Sheet>
    </Card>
  );
}

function StorageCard() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage != null ? `${(e.usage / 1024 / 1024).toFixed(1)} MB used` : '')).catch(() => {});
  }, []);
  return (
    <Card title="Storage & privacy">
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>All data is stored only on this device. Nothing is sent anywhere – no accounts, analytics or adverts.</li>
        <li>Data is not encrypted by the app. Use a screen lock on your phone.</li>
        <li>Clearing site/app data or uninstalling deletes your records. Export backups regularly.</li>
      </ul>
      <p className="mt-2 text-sm">Persistent storage: <strong>{persisted == null ? 'unknown' : persisted ? 'granted' : 'not granted'}</strong>{usage && ` · ${usage}`}</p>
      {!persisted && <Button className="mt-2" size="sm" variant="secondary" onClick={async () => setPersisted(await requestPersistentStorage())}>Request persistent storage</Button>}
    </Card>
  );
}

function AboutCard() {
  return (
    <Card title="About">
      <div className="space-y-2 text-sm">
        <p>Health Recovery v{__APP_VERSION__}. A personal tracking tool – not a medical device, and not medical advice. Blood pressure thresholds follow NICE NG136 for information only.</p>
        <p>If you have chest pain, sudden breathlessness, severe headache, weakness, confusion or vision changes, call 999. For urgent advice call NHS 111.</p>
      </div>
    </Card>
  );
}
