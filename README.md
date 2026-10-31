# Health Recovery

A private, on-device health tracker for a **12-week cardiovascular recovery programme** and ongoing maintenance: daily checklist, blood pressure (with the NICE 7-day home monitoring protocol), weight and waist, exercise, sleep, nutrition and alcohol, trends, weekly reviews and exports.

It runs as an **Android app** (with Galaxy Watch data via Health Connect) and as an installable **web app (PWA)**. There is no account, server, analytics or cloud sync: all data stays on your device.

> Not a medical device and not medical advice. See [CLINICAL_GUIDANCE.md](CLINICAL_GUIDANCE.md).

## Install on your Android phone

1. On your phone, open **GitHub → health-monitor → Releases** and download the newest `health-recovery-<n>.apk`.
2. When prompted, allow your browser to *install unknown apps*, then install.
3. Open **Health Recovery** and complete the 4-step setup.
4. **Galaxy Watch data:** in **Samsung Health → Settings → Health Connect**, allow Samsung Health to share data. Then in the app go to **Settings → Galaxy Watch (Health Connect) → Connect**, approve the permissions and tap **Sync now**. The app re-syncs each time you open it.

Updates: install a newer APK over the top. Your data is kept as long as builds are signed with your key (see *Signing* below). **Do not uninstall** – uninstalling deletes all records. Export a backup first if you ever need to (Settings → Data → Export backup).

### What comes from the watch

| Data | Used for | Notes |
|---|---|---|
| Sleep sessions (+ deep/REM/awake) | Sleep log | Longest sleep per wake date; never replaces a sleep you typed |
| Exercise sessions (+ avg HR, distance) | Exercise log | Intensity estimated from avg HR (% of 220 − age); without HR it is set to *easy* and flagged – edit if it felt harder |
| Resting heart rate, steps | Dashboard, lifestyle | Never overwrites a value you typed |
| Weight | Body | If your scale writes to Samsung Health/Health Connect |
| Blood pressure | History only | Watch BP is **excluded** from formal NICE averages – use a validated upper-arm cuff for those |

Reading is one-way (read-only) and only happens while the app is open. Reading the watch *directly* would need a separate Wear OS app; Health Connect is Samsung's supported route.

## Use as a web app (optional)

Deploy `dist/` to any static host (below), open it in Chrome/Edge and choose **Install app**. Works offline after the first load. Watch sync and closed-app notifications are Android-app only.

## Develop

Requires Node 22.

```bash
npm ci
npm run dev          # http://localhost:5173
npm run typecheck
npm run lint
npm test             # Vitest unit + integration (fake IndexedDB, Europe/London TZ for DST cases)
npm run build        # production build to dist/
npm run test:e2e     # Playwright (mobile Chrome) against the production preview
npm run audit:prod   # dependency audit of shipped code
npm run validate     # everything above
```

### Android build

CI (`.github/workflows/ci.yml`) runs all checks, builds a signed release APK and publishes it to **Releases** on every push to `main`.

Locally (needs Android Studio / SDK 36, JDK 21):

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease     # or: npx cap open android
```

### Signing (one-off setup, keeps your data across updates)

Android only installs an update over an existing app if both are signed with the **same key**; otherwise you must uninstall, which deletes your records. CI signs with a key stored in GitHub secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of your `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | its password (key alias `healthmonitor`, same password) |

Add them under **GitHub → health-monitor → Settings → Secrets and variables → Actions → New repository secret**. Without them CI still builds, but produces a `-debug` APK signed with a temporary key. Keep a copy of the keystore somewhere safe: losing it means future updates need an uninstall.

Easiest: run **Actions → Generate Android signing key (run once) → Run workflow**, download the `android-signing-key` artifact and follow its README.txt.

Or create a key yourself (JDK installed): `keytool -genkeypair -keystore release.keystore -alias healthmonitor -keyalg RSA -keysize 2048 -validity 20000`, then `base64 -w0 release.keystore` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))`).

### Deploy the web app

- **Cloudflare Pages:** build command `npm run build`, output `dist`. Security headers come from `public/_headers`.
- **Firebase Hosting:** `npm run build && firebase deploy` (uses `firebase.json`).

Serve over HTTPS; `sw.js` and `index.html` must not be cached long-term (configured).

## Limitations

- Data lives only on the device. Clearing app/site data or uninstalling deletes it. Back up regularly; backups are **not encrypted**.
- The app does not encrypt its database; rely on your phone's screen lock and device encryption.
- Browser reminders only fire while the app is open. Android reminders fire when closed but can be delayed by battery optimisation.
- Health Connect provides ~30 days of history on first connection.
- Watch BP is never used for formal averages.
- Not clinically validated. No diagnosis, medication or risk scoring.
- Production dependencies audit clean; `npm audit` reports moderate issues in **build-time** tools only (workbox-build, eslint, Capacitor CLI) which are not shipped.

## Backlog (prioritised)

1. Optional encrypted backup file (passphrase, Web Crypto AES-GCM) with tests.
2. Automatic backup reminder and backup to a user-chosen folder (Android).
3. Edit weight/waist entries in place (currently delete + re-add).
4. PDF GP report.
5. Health Connect background sync and longer history (READ_HEALTH_DATA_HISTORY).
6. Medication log (record only, no advice).
7. Wear OS companion for direct watch reads (only if Health Connect proves insufficient).
