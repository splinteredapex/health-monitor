# Clinical guidance used by the app

**Reviewed:** 31 October 2026. **Status:** informational implementation of published guidance. **Not clinically validated** and not a medical device. The app never diagnoses, recommends medication or changes treatment.

## Sources

- NICE NG136 *Hypertension in adults: diagnosis and management* (last updated Nov 2023) – thresholds, home BP monitoring protocol, targets.
- NHS: *High blood pressure*, *Low blood pressure*, *How to check your blood pressure at home*.
- UK Chief Medical Officers' low-risk drinking guidelines (2016); NHS alcohol unit calculation.
- UK CMO Physical Activity Guidelines (2019): 150 min moderate or 75 min vigorous per week + strength on 2 days.
- NHS BMI bands; NICE NG246/CG189 waist-to-height ratio (keep waist < half height).
- ACSM heart-rate intensity bands (used only to estimate intensity of watch-imported sessions).

## Blood pressure thresholds (mmHg)

| Context | Stage 1 | Stage 2 | Severe |
|---|---|---|---|
| Clinic | ≥ 140/90 | ≥ 160/100 | systolic ≥ 180 or diastolic ≥ 120 |
| Home average (HBPM) | ≥ 135/85 | ≥ 150/95 | – |

A threshold is met if **either** systolic or diastolic reaches it. Implemented in `src/domain/bp.ts` (`NICE`, `classifyHomeAverage`, `classifyClinic`) and tested in `bp.test.ts`.

Only a **home average** is compared with home thresholds, with wording "may indicate… share with your GP". Individual readings are never labelled as hypertension.

## Home monitoring protocol (NG136 1.2.6)

- Two consecutive seated readings at least ~1 minute apart, morning and evening.
- Ideally 7 days, minimum 4 days. **Discard day 1**; average all remaining readings.
- App statuses:
  - **Complete** – all 7 days have ≥ 2 AM and ≥ 2 PM readings → *formal home average* (days 2–7).
  - **NICE minimum met** – window finished and days 1…N complete consecutively with N ≥ 4 → formal average over days 2…N.
  - **In progress** – window open with no gaps so far → no formal average.
  - **Incomplete** – otherwise → only an "average of available readings (not formal)".
- Readings are assigned to days by their **recorded local date** and to AM/PM by the period chosen at entry (defaulting to before/after 12:00).
- Extra readings in a session are included (all readings are averaged as NICE describes "all remaining measurements").
- Clinic readings and **watch (cuffless) readings are excluded** – NICE requires a validated device.
- The app distinguishes three figures: **latest reading**, **average of available readings** (e.g. last 7 days), and **formal home-monitoring average**.

Programme weeks 1, 4, 8 and 12 are monitoring weeks.

## Safety messages (single readings)

- **≥ 180 systolic or ≥ 120 diastolic:** if symptoms (chest pain, breathlessness, severe headache, confusion, vision change, weakness/numbness, speech difficulty, fainting) → call 999; otherwise rest 5 minutes and re-measure; if still ≥ 180/120 contact GP same day or NHS 111.
- **≥ 160/100:** re-measure; a single reading is not a diagnosis; book a GP/practice nurse review if sustained; 999 for emergency symptoms.
- **< 90/60:** often normal if well; seek advice (NHS 111) if dizzy/faint; 999 if collapse or chest pain.
- Plausibility warnings for very narrow/wide pulse pressure or resting pulse outside 40–120.

Messages are always shown with an icon and text (never colour alone).

## Other calculations

- BMI = kg ÷ m²; bands per NHS with the caveat that BMI doesn't reflect muscle mass. Lower weight is not presented as automatically better.
- Waist-to-height = waist ÷ height; 0.4–0.49 healthy, 0.5–0.59 increased risk, ≥ 0.6 high.
- UK units = volume (ml) × ABV (%) ÷ 1000. Guideline ≤ 14 units/week. Unrecorded days are not treated as zero.
- Exercise intensity is self-reported (easy/moderate/hard). Moderate-equivalent minutes = moderate + 2 × hard; easy minutes are shown but not counted. Strength and mobility are not aerobic minutes.
- Watch-imported intensity: avg HR as % of (220 − age): < 64 % easy, 64–76 % moderate, > 76 % hard. Without HR or age → easy, flagged for user review.
- Sleep quality is the user's rating; it is never inferred from duration.

## Programme assumptions and safeguards

- Designed for adults with raised or borderline blood pressure, including people with previous tendon or joint injuries. No personal data is built in: profile values are entered at onboarding.
- Week 1 includes a GP/practice-nurse review task before increasing activity; strength work starts in week 3 "if medically and injury appropriate".
- No high-intensity work is prescribed. Every week shows cautions: stop for chest pain, unusual breathlessness, palpitations, dizziness or fainting; don't progress through tendon/joint pain.
- Skipping is always allowed and never blocks progression.

## Limits

- Values are as entered or as provided by Health Connect; the app cannot verify device accuracy or technique.
- Trends show association only; the app never states causes.
- No diagnosis, medication management or cardiovascular risk scoring.
