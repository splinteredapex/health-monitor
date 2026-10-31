/**
 * Default 12-week recovery programme, expressed as data. Seeded into IndexedDB on
 * onboarding; the user can edit any of it. Week 0 is the repeating maintenance
 * template used from week 13 onward.
 *
 * Day numbers are *programme days* (day 1 = the weekday of the start date).
 */
import type { ActivityCategory, ProgrammeWeek, ScheduledActivity, Verification } from '../db/schemas';

export const PROGRAMME_ID = 'recovery-12wk';
export const TEMPLATE_VERSION = 1;
export const PROGRAMME_WEEKS = 12;
export const PROTOCOL_WEEKS = [1, 4, 8, 12];

const STD_CAUTIONS = [
  'Stop and seek medical advice if you get chest pain, unusual breathlessness, palpitations, dizziness or fainting during activity.',
  'Do not progress through tendon, joint or muscle pain. Reduce, swap to a pain-free option, or rest – and see a physiotherapist if it persists.',
  'This plan is general guidance, not medical advice. Check with your GP before starting if you have any health concerns or very high readings.',
];

type ActivitySeed = {
  day: number;
  title: string;
  category: ActivityCategory;
  instructions: string;
  targetMinutes?: number;
  optional?: boolean;
  verification?: Verification;
};

type WeekSeed = Omit<ProgrammeWeek, 'id' | 'programmeId' | 'updatedAt' | 'cautions' | 'bpProtocolWeek' | 'notes'> & {
  activities: ActivitySeed[];
  cautions?: string[];
};

const bpAm = (n = 2): ActivitySeed['verification'] => ({ kind: 'bp', period: 'AM', minReadings: n });
const bpPm = (n = 2): ActivitySeed['verification'] => ({ kind: 'bp', period: 'PM', minReadings: n });
const AEROBIC = ['walking', 'running', 'cycling', 'swimming', 'other'] as const;

const protocolTasks = (): ActivitySeed[] =>
  [1, 2, 3, 4, 5, 6, 7].flatMap((day) => [
    {
      day,
      title: 'Morning BP – 2 readings',
      category: 'bp' as const,
      instructions:
        'Before food, caffeine or exercise. Empty bladder, sit with back supported and feet flat for 5 minutes, arm supported at heart level. Take 2 readings about 1 minute apart and record both.',
      verification: bpAm(2),
    },
    {
      day,
      title: 'Evening BP – 2 readings',
      category: 'bp' as const,
      instructions: 'Same routine as the morning: rest 5 minutes seated, take 2 readings about 1 minute apart, record both.',
      verification: bpPm(2),
    },
  ]);

const spotChecks = (): ActivitySeed[] =>
  [1, 4].map((day) => ({
    day,
    title: 'Morning BP check – 2 readings',
    category: 'bp' as const,
    instructions: 'Seated, rested 5 minutes, 2 readings about 1 minute apart. Keeps your trend up to date between monitoring weeks.',
    verification: bpAm(2),
  }));

const dailyLogs = (alcoholFree: boolean): ActivitySeed[] =>
  [1, 2, 3, 4, 5, 6, 7].flatMap((day) => [
    {
      day,
      title: 'Log last night’s sleep',
      category: 'sleep' as const,
      instructions: 'Record bedtime, wake time and how rested you feel. Aim for a consistent wake time, including weekends.',
      verification: { kind: 'sleep' as const },
    },
    {
      day,
      title: alcoholFree ? 'Daily nutrition log (alcohol-free)' : 'Daily nutrition log',
      category: 'nutrition' as const,
      instructions: alcoholFree
        ? 'Quick log: fruit & veg portions, alcohol (aim for zero this fortnight), caffeine, fluids and whether you kept salt low.'
        : 'Quick log: fruit & veg portions, alcohol units, caffeine, fluids and salt.',
      verification: { kind: 'nutrition' as const },
    },
  ]);

const aerobic = (days: number[], min: number, max: number, label: string, optionalDays: number[] = []): ActivitySeed[] =>
  days.map((day) => ({
    day,
    title: `${label} ${min}–${max} min`,
    category: 'aerobic' as const,
    instructions:
      `${label} for ${min}–${max} minutes at a conversational pace (you can talk in full sentences). Brisk walking, easy cycling or swimming are ideal; avoid running or jumping if any tendon or joint is irritable.`,
    targetMinutes: min,
    optional: optionalDays.includes(day),
    verification: { kind: 'exercise' as const, types: [...AEROBIC], minMinutes: min },
  }));

const strength = (days: number[], detail: string): ActivitySeed[] =>
  days.map((day) => ({
    day,
    title: 'Strength session (20–30 min)',
    category: 'strength' as const,
    instructions: `${detail} Only if you have no injury flare and your GP/physio is happy. Breathe normally – avoid breath-holding and maximal lifts.`,
    targetMinutes: 20,
    verification: { kind: 'exercise' as const, types: ['strength'], minMinutes: 15 },
  }));

const weighIn = (withWaist: boolean): ActivitySeed[] => [
  {
    day: 1,
    title: 'Weekly weigh-in',
    category: 'weight',
    instructions: 'Morning, after the toilet, before food, same scales and similar clothing.',
    verification: { kind: 'weight' },
  },
  ...(withWaist
    ? [{
        day: 1,
        title: 'Waist measurement',
        category: 'waist' as const,
        instructions: 'Measure halfway between the bottom of your ribs and the top of your hips, breathing out normally. Tape snug, not tight.',
        verification: { kind: 'waist' as const },
      }]
    : []),
];

const review = (): ActivitySeed => ({
  day: 7,
  title: 'Weekly review',
  category: 'review',
  instructions: 'Open Progress → Weekly review. Read the summary, note how the week went and set next week’s focus.',
  verification: { kind: 'review' },
});

const mobility = (days: number[]): ActivitySeed[] =>
  days.map((day) => ({
    day,
    title: 'Mobility 10 min (optional)',
    category: 'mobility' as const,
    instructions: 'Gentle calf, hip and hamstring mobility. Pain-free range only.',
    targetMinutes: 10,
    optional: true,
    verification: { kind: 'exercise' as const, types: ['mobility'], minMinutes: 5 },
  }));

const STRENGTH_INTRO =
  'Bodyweight or light: sit-to-stand from a chair, wall or incline press-ups, glute bridges, supported rows, calf raises (pain-free), dead bug. 2 sets of 8–12, leaving 3+ reps in reserve.';
const STRENGTH_BUILD =
  'Full body: goblet squat or box squat, hip hinge (e.g. light Romanian deadlift or bridge), push, pull, carry, slow calf raises. 2–3 sets of 8–12 at moderate effort.';

function week(n: number): WeekSeed {
  const protocol = PROTOCOL_WEEKS.includes(n);
  const bp = protocol ? protocolTasks() : spotChecks();
  const waist = n === 1 || (n >= 5 && n <= 8) || n % 2 === 1 || n === 12;
  if (n <= 2) {
    return {
      weekNumber: n,
      title: n === 1 ? 'Week 1 – Baseline' : 'Week 2 – Settle the routine',
      phase: 'Foundations',
      objectives:
        n === 1
          ? [
              'Complete a 7-day home BP monitoring period to establish your baseline.',
              'Record baseline weight and waist.',
              'Book a GP or practice nurse review of your blood pressure before increasing activity.',
              'Start 4 easy aerobic sessions of 20–30 minutes.',
              'Begin an alcohol-free fortnight and reduce salt.',
              'Set a consistent bedtime and wake time.',
            ]
          : [
              'Keep 4 easy aerobic sessions of 20–30 minutes.',
              'Continue the alcohol-free period.',
              'Build salt-reduction habits: check labels, cook from scratch more often.',
              'Keep a consistent sleep schedule.',
            ],
      exerciseSchedule: '4 × easy aerobic, 20–30 minutes (days 2, 4, 6, 7). No high-intensity work.',
      nutritionFocus: 'Diet quality: more vegetables, fruit, pulses and whole grains; under 6 g salt a day; no alcohol this fortnight.',
      recoveryAdvice: 'Fixed wake time, wind-down routine, limit caffeine after midday.',
      measurementReminders: n === 1 ? ['7-day BP: 2 morning + 2 evening readings daily', 'Baseline weight and waist on day 1'] : ['BP checks on days 1 and 4', 'Weekly weigh-in'],
      reviewPrompts: ['How did the sessions feel?', 'Any injury niggles?', 'How hard was the alcohol-free period?'],
      activities: [
        ...bp,
        ...weighIn(waist),
        ...(n === 1
          ? [{
              day: 1,
              title: 'Book a GP / practice nurse BP review',
              category: 'medical' as const,
              instructions:
                'Book a blood pressure review, especially if previous readings were 140/90 mmHg or higher (NICE clinic threshold). Bring your home readings and ask whether you are fit for a gradual exercise increase.',
            }]
          : []),
        ...aerobic([2, 4, 6, 7], 20, 30, 'Easy walk or cycle'),
        ...dailyLogs(true),
        review(),
      ],
    };
  }
  if (n <= 4) {
    return {
      weekNumber: n,
      title: `Week ${n} – Build aerobic base`,
      phase: 'Build',
      objectives: [
        '4 aerobic sessions of 30–35 minutes.',
        'Introduce 2 manageable strength sessions if medically and injury appropriate.',
        n === 4 ? 'Repeat the 7-day home BP monitoring and review your trend.' : 'Keep BP spot checks going.',
        'Keep salt low and alcohol within your target.',
      ],
      exerciseSchedule: '4 × aerobic 30–35 min (days 2, 4, 6, 7) + 2 × strength (days 1, 5).',
      nutritionFocus: 'Keep up vegetables and fibre; hold salt under 6 g; reintroduce alcohol only within your target, if at all.',
      recoveryAdvice: 'At least one full rest day; sleep consistency.',
      measurementReminders: n === 4 ? ['7-day BP monitoring week', 'Weekly weigh-in'] : ['BP checks on days 1 and 4', 'Weekly weigh-in'],
      reviewPrompts: ['Did strength work aggravate any old injury?', 'How is your BP trend compared with week 1?'],
      activities: [...bp, ...weighIn(waist), ...aerobic([2, 4, 6, 7], 30, 35, 'Aerobic'), ...strength([1, 5], STRENGTH_INTRO), ...dailyLogs(false), review()],
    };
  }
  if (n <= 8) {
    return {
      weekNumber: n,
      title: `Week ${n} – Consistency`,
      phase: 'Consistency',
      objectives: [
        '4–5 aerobic sessions of 30–45 minutes.',
        '2 strength sessions.',
        'Consistent nutrition and recovery habits.',
        'Weekly waist tracking.',
        ...(n === 8 ? ['7-day home BP monitoring.'] : []),
      ],
      exerciseSchedule: '4 × aerobic 30–45 min (days 2, 3, 6, 7) + optional 5th (day 4) + 2 × strength (days 1, 5).',
      nutritionFocus: 'Regular meals, protein at each meal, plenty of plants; salt and alcohol within targets.',
      recoveryAdvice: 'If sleep or soreness worsens, hold the volume rather than adding more.',
      measurementReminders: n === 8 ? ['7-day BP monitoring week', 'Weigh-in and waist'] : ['BP checks on days 1 and 4', 'Weigh-in and waist'],
      reviewPrompts: ['Is the schedule sustainable?', 'Any warning signs (pain, poor sleep, high readings)?'],
      activities: [...bp, ...weighIn(true), ...aerobic([2, 3, 4, 6, 7], 30, 45, 'Aerobic', [4]), ...strength([1, 5], STRENGTH_BUILD), ...mobility([3]), ...dailyLogs(false), review()],
    };
  }
  return {
    weekNumber: n,
    title: n === 12 ? 'Week 12 – Review and maintain' : `Week ${n} – Reach the target`,
    phase: 'Target',
    objectives: [
      'Aim for 150–200 minutes of moderate aerobic activity this week, if tolerated.',
      '2 strength sessions.',
      ...(n === 12 ? ['Complete a 7-day home BP monitoring period and compare with week 1.', 'Review all measurements and set a maintenance routine.'] : ['Keep measurements consistent.']),
    ],
    exerciseSchedule: '5 × aerobic 30–40 min (days 2, 3, 4, 6, 7) + 2 × strength (days 1, 5). Only progress if pain-free.',
    nutritionFocus: 'Maintain the habits that worked; plan for social occasions.',
    recoveryAdvice: 'Keep one easy week every 4–6 weeks long term.',
    measurementReminders: n === 12 ? ['7-day BP monitoring week', 'Final weight and waist', 'Book a GP review with your summary'] : ['BP checks on days 1 and 4', 'Weekly weigh-in'],
    reviewPrompts: ['Which habits will you keep?', 'What does your maintenance week look like?'],
    activities: [
      ...bp,
      ...weighIn(waist),
      ...aerobic([2, 3, 4, 6, 7], 30, 40, 'Moderate aerobic'),
      ...strength([1, 5], STRENGTH_BUILD),
      ...(n === 12
        ? [{ day: 7, title: 'Book a GP review with your 12-week summary', category: 'medical' as const, instructions: 'Export the GP summary from Settings → Data and take it to your appointment.' }]
        : []),
      ...dailyLogs(false),
      review(),
    ],
  };
}

function maintenance(): WeekSeed {
  return {
    weekNumber: 0,
    title: 'Maintenance week',
    phase: 'Maintenance',
    objectives: ['150+ minutes moderate aerobic activity across the week.', '2 strength sessions.', 'Regular BP checks; a 7-day monitoring period every 3 months or as your GP advises.'],
    exerciseSchedule: '4–5 × aerobic 30–40 min + 2 × strength.',
    nutritionFocus: 'Maintain dietary quality, salt and alcohol targets.',
    recoveryAdvice: 'Keep sleep consistent; build in easier weeks.',
    measurementReminders: ['Weekly weigh-in', 'BP checks twice a week', 'Waist monthly'],
    reviewPrompts: ['Are you still on track with your targets?'],
    activities: [...spotChecks(), ...weighIn(false), ...aerobic([2, 4, 6, 7], 30, 40, 'Moderate aerobic'), ...strength([1, 5], STRENGTH_BUILD), ...dailyLogs(false), review()],
  };
}

export function buildDefaultProgramme(now: number) {
  const seeds = [...Array.from({ length: PROGRAMME_WEEKS }, (_, i) => week(i + 1)), maintenance()];
  const weeks: ProgrammeWeek[] = [];
  const activities: ScheduledActivity[] = [];
  for (const s of seeds) {
    const { activities: acts, cautions, ...rest } = s;
    weeks.push({
      ...rest,
      id: `${PROGRAMME_ID}:w${s.weekNumber}`,
      programmeId: PROGRAMME_ID,
      cautions: cautions ?? STD_CAUTIONS,
      bpProtocolWeek: PROTOCOL_WEEKS.includes(s.weekNumber),
      updatedAt: now,
    });
    const perDay = new Map<number, number>();
    acts.forEach((a) => {
      const order = perDay.get(a.day) ?? 0;
      perDay.set(a.day, order + 1);
      activities.push({
        id: `${PROGRAMME_ID}:w${s.weekNumber}:d${a.day}:${order}`,
        programmeId: PROGRAMME_ID,
        weekNumber: s.weekNumber,
        day: a.day,
        order,
        title: a.title,
        category: a.category,
        instructions: a.instructions,
        ...(a.targetMinutes != null ? { targetMinutes: a.targetMinutes } : {}),
        optional: a.optional ?? false,
        ...(a.verification ? { verification: a.verification } : {}),
        archived: false,
        updatedAt: now,
      });
    });
  }
  return {
    programme: {
      id: PROGRAMME_ID,
      name: '12-week cardiovascular recovery',
      description: 'Gradual aerobic and strength progression with blood pressure, body, sleep and nutrition tracking.',
      templateVersion: TEMPLATE_VERSION,
      weeks: PROGRAMME_WEEKS,
      createdAt: now,
      updatedAt: now,
    },
    weeks,
    activities,
  };
}
