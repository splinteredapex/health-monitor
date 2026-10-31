import { useEffect, useState } from 'react';
import { RefreshCw, Watch } from 'lucide-react';
import { HC_TYPES, HealthConnect, isAndroidApp, type HcStatus, type HcType } from './healthConnect';
import { syncHealthConnect } from './sync';
import { useProfile } from '../ui/hooks';
import { Button, Card, Notice, Pill, useToast } from '../ui/primitives';

const LABEL: Record<HcType, string> = { BloodPressure: 'Blood pressure', Weight: 'Weight', SleepSession: 'Sleep', ExerciseSession: 'Exercise', RestingHeartRate: 'Resting heart rate', Steps: 'Steps', HeartRate: 'Heart rate (for exercise intensity)' };

export function HealthConnectCard() {
  const profile = useProfile();
  const toast = useToast();
  const [status, setStatus] = useState<HcStatus | null>(null);
  const [granted, setGranted] = useState<HcType[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void HealthConnect.status().then(async (s) => {
      setStatus(s);
      if (s === 'available') setGranted(await HealthConnect.granted().catch(() => []));
    });
  }, []);

  if (!isAndroidApp()) {
    return (
      <Card title={<span className="flex items-center gap-2"><Watch size={18} aria-hidden /> Galaxy Watch (Health Connect)</span>}>
        <p className="text-sm text-muted">Watch data sync is available in the Android app. In the browser you can still enter resting heart rate and steps under Record → Lifestyle.</p>
      </Card>
    );
  }

  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncHealthConnect();
      toast(`Synced: ${Object.values(r.added).reduce((a, b) => a + b, 0)} new records${r.errors.length ? ` (${r.errors.length} errors)` : ''}`, r.errors.length ? 'warn' : 'ok');
    } catch (e) { toast(`Sync failed: ${(e as Error).message}`, 'danger'); }
    setBusy(false);
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Watch size={18} aria-hidden /> Galaxy Watch (Health Connect)</span>} action={status && <Pill tone={status === 'available' ? 'ok' : 'warn'}>{status === 'available' ? 'Available' : status === 'not_installed' ? 'Not installed' : status === 'update_required' ? 'Update needed' : 'Unavailable'}</Pill>}>
      <div className="space-y-3 text-sm">
        <p>Your watch syncs to Samsung Health, which shares data with Health Connect. This app reads it from there – read-only, on this phone only.</p>
        {status !== 'available' ? (
          <Notice tone="warn">Install or update “Health Connect” from the Play Store, then reopen this screen. On Android 14+ it is built into Settings → Security & privacy → Health Connect.</Notice>
        ) : (
          <>
            <ul className="space-y-1">{HC_TYPES.map((t) => <li key={t} className="flex items-center justify-between"><span>{LABEL[t]}</span><Pill tone={granted.includes(t) ? 'ok' : 'neutral'}>{granted.includes(t) ? 'Allowed' : 'Not allowed'}</Pill></li>)}</ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={async () => { try { setGranted(await HealthConnect.request([...HC_TYPES])); } catch (e) { toast((e as Error).message, 'danger'); } }}>{granted.length ? 'Change permissions' : 'Connect'}</Button>
              <Button disabled={busy || granted.length === 0} onClick={sync}><RefreshCw size={16} aria-hidden className={busy ? 'animate-spin' : ''} /> Sync now</Button>
            </div>
            {profile?.healthConnect?.lastSyncAt && <p className="text-xs text-muted">Last sync {new Date(profile.healthConnect.lastSyncAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}: {profile.healthConnect.lastResult}</p>}
            <Notice tone="info">
              <p>In Samsung Health, turn on Settings → Health Connect so watch data is shared. The app syncs when opened and imports the last {30} days on first sync.</p>
              <p><strong>Watch blood pressure</strong> is shown in your history but never used for the formal NICE home average – that needs a validated upper-arm cuff.</p>
            </Notice>
          </>
        )}
      </div>
    </Card>
  );
}

/** Auto-sync on app start (Android only, if previously connected). */
export function useHealthConnectAutoSync(enabled: boolean | undefined) {
  useEffect(() => {
    if (!enabled || !isAndroidApp()) return;
    void syncHealthConnect().catch(() => {});
  }, [enabled]);
}
