# Architecture

## Overview

React 19 + TypeScript (strict) single-page app built with Vite, styled with Tailwind 4, storing data in IndexedDB via Dexie. The same build runs as a PWA and inside a Capacitor 8 Android shell. No backend.

```
src/
  lib/          dates (local-date, DST-safe), ids, maths
  db/           schemas.ts (zod), db.ts (Dexie versions), repo.ts (validated writes), backup.ts
  domain/       pure logic: bp, body, sleep, exercise, alcohol, programme engine, review, reminders, exports, csv
  programme/    template.ts – default 12-week programme as data
  native/       Health Connect bridge, mapping, sync; native notifications (Android only)
  ui/           primitives, charts, task row, router, hooks, theme, PWA status, error boundary
  pages/        Onboarding, Dashboard, Plan, Record/*, Progress, Settings
android/        Capacitor project + HealthConnectPlugin.kt
e2e/            Playwright specs
```

Rule: **domain/** is pure and fully unit-tested; pages call `repo` for writes and read via `dexie-react-hooks` live queries (`ui/hooks.ts`), so every screen updates as soon as data changes.

## State

- Persistent state: IndexedDB only. No global store; live queries are the source of truth.
- UI state: local `useState`. Navigation: hash router (`#/record/bp`), so deep links and reloads work offline.
- `useEngine()` bundles profile start date, activities, completions, all records and today's date for the programme engine.

## Schema (Dexie, `db/db.ts`)

| Table | Key / indexes | Notes |
|---|---|---|
| userProfile | `id` = 'profile' | DOB, height, baselines, start date, theme, reminders, Health Connect state |
| healthGoals | `id` = 'goals' | Targets |
| programmes | `id` | Programme metadata |
| programmeWeeks | `id`, programmeId, weekNumber | Week 0 = maintenance template |
| scheduledActivities | `id`, weekNumber, [weekNumber+day] | Task templates (archived, never deleted) |
| activityCompletions | `id` = `activityId@dueDate`, dueDate, rescheduledTo | Status, history log |
| bloodPressure | `id`, takenAt, localDate, sessionId, source | Readings; sessionId groups a sitting |
| weights / waists | `id`, takenAt, localDate | |
| exercise | `id`, localDate, type, source | |
| sleep | `id`, wakeDate, bedAt, source | One main sleep per wake date |
| nutrition | `id`, **&localDate** | One per day; `null` = not recorded |
| dailyMetrics | `id`, **&localDate**, source | Resting HR, steps (v2) |
| weeklyReviews | `id` = `review-w<n>` | Snapshot of summary + reflection |

Every record has a stable UUID (or deterministic id for imports: `hc:<healthConnectId>`), `createdAt`, `updatedAt`, `source` ('manual' | 'watch' | 'import').

### Time handling

Each timed record stores the absolute instant (`takenAt` epoch ms), the device's UTC offset at the time, and the **local calendar date/time** strings. All grouping (days, weeks, protocol) uses the stored local date, so readings never jump days when travelling or across DST. Calendar arithmetic is done on date strings via UTC midnight (`lib/dates.ts`). Sleep duration uses real elapsed time, so DST nights are 7 h / 9 h correctly.

### Migrations

`db.version(n)` blocks are append-only. v1 = core tables; v2 adds `source` indexes and `dailyMetrics`, with an idempotent upgrade that back-fills `source = 'manual'`. Dexie runs upgrades in a single transaction: a failing upgrade aborts and leaves the previous version intact (tested). If the database can't open, the app shows a non-destructive "Storage unavailable" screen.

## Validation

`db/schemas.ts` (zod) is the single source of truth for types, write validation (`repo.ts`) and import validation (`backup.ts`). Unknown keys are stripped.

## Programme engine (`domain/programme.ts`)

- Position is purely calendar-based: week = ⌊days since start / 7⌋ + 1, day = 1–7. Missed tasks never block progress. Weeks > 12 use the maintenance template.
- Occurrences for a date = active activities for that template week/day, minus those moved away, plus those moved in.
- Status: `done`/`skipped` (manual completion record) > `verified` (a measurement satisfies the task's `verification` rule, e.g. ≥2 AM home BP readings) > `pending`/`missed`/`upcoming`.
- Adherence = (done + verified) / due non-optional occurrences up to today.
- Changing the start date only re-aligns the schedule; completions stay keyed to their original dates.

## Calculations

See `domain/*`. BMI = kg/m² (1 dp); waist:height (2 dp); UK units = ml × ABV% ÷ 1000; moderate-equivalent = moderate + 2 × hard aerobic minutes (easy excluded; strength/mobility not aerobic); BP averages and the NICE protocol are documented in CLINICAL_GUIDANCE.md.

## Backup and import

JSON: `{ format, formatVersion, schemaVersion, exportedAt, tables }`. Import: size limit (25 MB) → JSON parse → format/version checks → per-row schema validation → duplicate id / unique-date checks → preview (new / identical / conflicts) → user chooses **Merge** (adds new only, never overwrites) or **Replace all** (explicit confirmation). Applied in one Dexie transaction, so an interrupted import changes nothing. CSV exports per category escape formula-injection characters.

## Offline / PWA

vite-plugin-pwa (Workbox `generateSW`) precaches the app shell; `registerType: 'prompt'` shows an "Update now" banner so updates are user-initiated. IndexedDB is untouched by updates. In the Android app the service worker is not registered (assets ship in the APK).

## Android

Capacitor 8 shell (`android/`), minSdk 26. `HealthConnectPlugin.kt` exposes `getStatus`, `getGrantedPermissions`, `requestHealthPermissions`, `readRecords` and `openHealthConnectSettings`; it is read-only. `src/native/sync.ts` maps records (`hcMap.ts`) and inserts them idempotently in one transaction. Native reminders use `@capacitor/local-notifications`; file exports use Filesystem + Share. Cloud backup of app data is disabled (`allowBackup=false`, data-extraction rules) to keep health data on-device.

## Security

- Strict CSP (no inline/remote scripts, `connect-src 'self'`); headers in `public/_headers` and `firebase.json`.
- No `dangerouslySetInnerHTML` (lint-enforced); React escapes all text.
- No secrets in the client. Imports treated as untrusted.
- Error boundaries per page with "Download backup" escape hatch.
