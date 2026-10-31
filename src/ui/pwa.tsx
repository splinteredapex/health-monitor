import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from './primitives';

/** Registers the service worker and offers a safe, user-initiated update. */
export function PwaStatus() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);

  useEffect(() => {
    // The Android app ships its assets in the APK, so no service worker there.
    if (!('serviceWorker' in navigator) || import.meta.env.DEV || import.meta.env.MODE === 'test' || Capacitor.isNativePlatform()) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const fn = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
          onRegisterError: (e) => console.warn('Service worker registration failed', e),
        });
        setUpdate(() => fn);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-surface-2 px-4 py-1.5 text-xs font-medium text-muted">
          <WifiOff size={14} aria-hidden /> Offline – everything still works and is saved on this device.
        </div>
      )}
      {needRefresh && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-3 bg-info-bg px-4 py-2 text-sm text-text">
          <span>A new version is available. Your data is kept.</span>
          <Button size="sm" onClick={() => update?.(true)}><RefreshCw size={16} aria-hidden /> Update now</Button>
          <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
        </div>
      )}
    </>
  );
}
