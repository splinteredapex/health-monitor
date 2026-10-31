import { adherence, latestProtocolStart, occurrenceKey, occurrencesForDate, programmePosition, type EngineInput } from './programme';
import { buildDefaultProgramme } from '../programme/template';
import type { ActivityCompletion } from '../db/schemas';
import { bp, ex, protocolDay } from '../test/factories';
import { addDays } from '../lib/dates';
import { generateWeeklySummary } from './review';
import { DEFAULT_GOALS, DEFAULT_REMINDERS } from '../db/repo';

const START = '2026-11-02';
const prog = buildDefaultProgramme(0);
const empty = { bp: [], weights: [], waists: [], exercise: [], sleep: [], nutrition: [], reviews: [] };
const input = (over: Partial<EngineInput> = {}): EngineInput => ({ startDate: START, activities: prog.activities, completions: [], data: empty, today: START, ...over });

describe('default programme', () => {
  it('has 12 weeks plus maintenance with tasks every day', () => {
    expect(prog.weeks).toHaveLength(13);
    for (const w of [1, 2, 3, 6, 9, 12, 0]) for (let d = 1; d <= 7; d++) expect(prog.activities.some((a) => a.weekNumber === w && a.day === d)).toBe(true);
  });
  it('matches the phase volumes', () => {
    const aerobic = (w: number) => prog.activities.filter((a) => a.weekNumber === w && a.category === 'aerobic' && !a.optional);
    const strength = (w: number) => prog.activities.filter((a) => a.weekNumber === w && a.category === 'strength');
    expect(aerobic(1)).toHaveLength(4);
    expect(strength(1)).toHaveLength(0);
    expect(aerobic(3)).toHaveLength(4);
    expect(strength(3)).toHaveLength(2);
    expect(aerobic(6).length).toBeGreaterThanOrEqual(4);
    expect(aerobic(10)).toHaveLength(5);
    expect(prog.weeks.filter((w) => w.bpProtocolWeek).map((w) => w.weekNumber)).toEqual([1, 4, 8, 12]);
    expect(prog.activities.some((a) => a.weekNumber === 1 && a.category === 'medical')).toBe(true);
  });
  it('ids are unique and stable', () => {
    const ids = prog.activities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildDefaultProgramme(5).activities.map((a) => a.id)).toEqual(ids);
  });
});

describe('programme position', () => {
  it('is calendar-based', () => {
    expect(programmePosition(START, '2026-11-01').beforeStart).toBe(true);
    expect(programmePosition(START, START)).toMatchObject({ weekNumber: 1, day: 1 });
    expect(programmePosition(START, addDays(START, 6))).toMatchObject({ weekNumber: 1, day: 7 });
    expect(programmePosition(START, addDays(START, 7))).toMatchObject({ weekNumber: 2, day: 1 });
    expect(programmePosition(START, addDays(START, 84))).toMatchObject({ weekNumber: 13, inMaintenance: true });
  });
  it('crosses DST correctly', () => {
    expect(programmePosition('2026-10-19', '2026-10-26')).toMatchObject({ weekNumber: 2, day: 1 });
  });
  it('changing the start date moves the schedule without touching completions', () => {
    const c: ActivityCompletion = { id: occurrenceKey(prog.activities[0]!.id, START), activityId: prog.activities[0]!.id, dueDate: START, status: 'done', history: [], updatedAt: 0 };
    const later = input({ startDate: addDays(START, 7), completions: [c], today: addDays(START, 7) });
    expect(occurrencesForDate(START, later)).toHaveLength(0);
    const first = occurrencesForDate(addDays(START, 7), later);
    expect(first.every((o) => o.status !== 'done')).toBe(true);
  });
});

describe('occurrences and verification', () => {
  it('BP task verified only by enough readings of the right period', () => {
    const one = occurrencesForDate(START, input({ data: { ...empty, bp: [bp(START, '07:00', 130, 80)] } }));
    expect(one.find((o) => o.activity.title.startsWith('Morning BP'))!.status).toBe('pending');
    const two = occurrencesForDate(START, input({ data: { ...empty, bp: protocolDay(START, 130, 80, 2, 0) } }));
    expect(two.find((o) => o.activity.title.startsWith('Morning BP'))!.status).toBe('verified');
    expect(two.find((o) => o.activity.title.startsWith('Evening BP'))!.status).toBe('pending');
  });
  it('exercise verification respects type and minimum minutes', () => {
    const d = addDays(START, 1);
    const short = occurrencesForDate(d, input({ today: d, data: { ...empty, exercise: [ex(d, 'walking', 10, 'easy')] } }));
    expect(short.find((o) => o.activity.category === 'aerobic')!.status).toBe('pending');
    const ok = occurrencesForDate(d, input({ today: d, data: { ...empty, exercise: [ex(d, 'walking', 25, 'easy')] } }));
    expect(ok.find((o) => o.activity.category === 'aerobic')!.status).toBe('verified');
  });
  it('manual done distinguishes from verified; past pending is missed; future upcoming', () => {
    const a = occurrencesForDate(START, input())[0]!;
    const c: ActivityCompletion = { id: a.key, activityId: a.activity.id, dueDate: START, status: 'done', history: [], updatedAt: 0 };
    expect(occurrencesForDate(START, input({ completions: [c] }))[0]!.status).toBe('done');
    expect(occurrencesForDate(START, input({ today: addDays(START, 1) }))[0]!.status).toBe('missed');
    expect(occurrencesForDate(addDays(START, 1), input())[0]!.status).toBe('upcoming');
  });
  it('rescheduled tasks move to the new date', () => {
    const a = occurrencesForDate(START, input()).find((o) => o.activity.category === 'medical')!;
    const c: ActivityCompletion = { id: a.key, activityId: a.activity.id, dueDate: START, status: 'pending', rescheduledTo: addDays(START, 2), history: [], updatedAt: 0 };
    const i = input({ completions: [c] });
    expect(occurrencesForDate(START, i).some((o) => o.key === a.key)).toBe(false);
    const moved = occurrencesForDate(addDays(START, 2), i).find((o) => o.key === a.key)!;
    expect(moved.movedIn).toBe(true);
  });
  it('archived activities are hidden', () => {
    const acts = prog.activities.map((a) => (a.weekNumber === 1 && a.day === 1 ? { ...a, archived: true } : a));
    expect(occurrencesForDate(START, input({ activities: acts }))).toHaveLength(0);
  });
});

describe('adherence', () => {
  it('counts only due, non-optional tasks up to today; missed tasks do not block', () => {
    const today = addDays(START, 1);
    const a0 = adherence(START, addDays(START, 6), input({ today }));
    const day1 = occurrencesForDate(START, input()).filter((o) => !o.activity.optional).length;
    const day2 = occurrencesForDate(today, input({ today })).filter((o) => !o.activity.optional).length;
    expect(a0.due).toBe(day1 + day2);
    expect(a0.missed).toBe(day1);
    expect(a0.percent).toBe(0);
    expect(programmePosition(START, addDays(START, 8)).weekNumber).toBe(2);
  });
  it('null before anything is due', () => {
    expect(adherence(START, addDays(START, 6), input({ today: addDays(START, -1) })).percent).toBeNull();
  });
  it('verified completions raise adherence', () => {
    const data = { ...empty, bp: protocolDay(START, 130, 80) };
    const a = adherence(START, START, input({ data }));
    expect(a.verified).toBe(2);
    expect(a.percent).toBe(Math.round((2 / a.due) * 100));
  });
  it('latest protocol start', () => {
    expect(latestProtocolStart(START, addDays(START, 30), prog.weeks)).toBe(addDays(START, 21));
    expect(latestProtocolStart(START, addDays(START, -1), prog.weeks)).toBeNull();
  });
});

describe('weekly summary', () => {
  it('is factual and flags unrecorded alcohol days', () => {
    const today = addDays(START, 6);
    const profile = { id: 'profile' as const, createdAt: 0, updatedAt: 0, sex: 'male' as const, heightCm: 178, baselineWeightKg: 80, programmeStartDate: START, theme: 'system' as const, reminders: DEFAULT_REMINDERS };
    const data = {
      ...empty,
      bp: Array.from({ length: 7 }, (_, i) => protocolDay(addDays(START, i), 138, 86)).flat(),
      exercise: [ex(addDays(START, 1), 'walking', 30, 'moderate')],
      nutrition: [{ id: 'n', createdAt: 0, updatedAt: 0, source: 'manual' as const, localDate: START, fruitVegPortions: 5, alcoholUnits: 0, drinks: [], caffeineMg: null, saltG: null, fluidsL: null, targetsMet: { lowSalt: null, wholeFoods: null, noLateEating: null } }],
    };
    const s = generateWeeklySummary(1, input({ today, data }), profile, DEFAULT_GOALS(0), prog.weeks);
    const text = s.lines.join('\n');
    expect(text).toMatch(/formal average 138\/86/);
    expect(text).toMatch(/6 days not recorded/);
    expect(text).toMatch(/Weight: not recorded/);
    expect(s.nextFocus.length).toBeGreaterThan(0);
  });
});
