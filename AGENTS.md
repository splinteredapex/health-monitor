# Agent / contributor guide

## Conventions

- TypeScript strict (`noUncheckedIndexedAccess`). No `any` without a comment explaining why.
- Pure logic lives in `src/domain` and must be unit-tested. UI never computes clinical values itself.
- All writes go through `src/db/repo.ts` (zod-validated). Never call `db.<table>.put` from UI code.
- Dates: use `src/lib/dates.ts`. Store local date strings + epoch ms; never derive a calendar day from `toISOString()`.
- UK formats: DD/MM/YYYY, kg, cm, mmHg, UK units.
- Accessibility: every input has a label; errors use `aria-invalid` + text; status uses `Pill`/`Notice` (icon + text); charts must have a text summary; touch targets ≥ 44 px.
- No `dangerouslySetInnerHTML` (lint error). No network calls, trackers or third-party scripts.

## Tests (must pass before merge)

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run audit:prod
```

- New calculations: unit tests including edge cases (missing data, duplicates, DST, midnight).
- New record types or fields: schema, repo round-trip, backup round-trip, CSV export.
- UI flows: Playwright on the mobile project.

## Migrations

- Append a new `db.version(n)`; never edit a released version. Bump `DB_SCHEMA_VERSION`.
- Upgrades must be idempotent and never delete health records.
- Add a migration test that opens the previous version with data, upgrades, and checks values.
- If backup shape changes, bump `BACKUP_FORMAT_VERSION` and keep importing older formats.

## Security

- Treat imported JSON and Health Connect data as untrusted: validate with zod, cap sizes, strip unknown keys.
- Keep the CSP strict; don't add remote origins.
- Health Connect plugin stays read-only. Don't add write permissions.
- Never commit secrets or keystores (`*.keystore` is git-ignored). Signing keys come from CI secrets.

## Clinical safeguards

- Follow CLINICAL_GUIDANCE.md. Changing a threshold requires updating that file, the constants in `domain/bp.ts` and tests.
- Never label a single reading as hypertension; only home averages are compared with home thresholds.
- Never use watch/cuffless or clinic readings in formal home averages.
- No diagnosis, medication advice or prescriptive high-intensity exercise.
- Never present missing data as zero or infer causes.

## Documentation

Update README (user-facing), ARCHITECTURE (structure/schema), CLINICAL_GUIDANCE (any health logic) in the same change.
