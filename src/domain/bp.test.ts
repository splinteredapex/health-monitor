import { averageReadings, classifyClinic, classifyHomeAverage, dailyAverages, evaluateProtocol, groupSessions, latestReading, readingSafety, readingWarnings, sevenDayTrend, periodForTime } from './bp';
import { bp, protocolDay } from '../test/factories';
import { addDays } from '../lib/dates';

const START = '2026-11-02';
const fullWeek = (s = 140, d = 88) => Array.from({ length: 7 }, (_, i) => protocolDay(addDays(START, i), s, d)).flat();

describe('BP averages', () => {
  it('average of available readings', () => {
    const a = averageReadings([bp('2026-11-01', '07:00', 140, 90, { pulse: 60 }), bp('2026-11-01', '07:01', 130, 80)]);
    expect(a).toEqual({ systolic: 135, diastolic: 85, count: 2, pulse: 60 });
    expect(averageReadings([])).toBeNull();
  });
  it('latest reading is by timestamp, not insertion order', () => {
    const r1 = bp('2026-11-02', '07:00', 120, 80);
    const r2 = bp('2026-11-01', '20:00', 150, 95);
    expect(latestReading([r1, r2])).toBe(r1);
  });
  it('daily averages exclude clinic readings and group by local date', () => {
    const d = dailyAverages([
      bp('2026-11-01', '07:00', 140, 90), bp('2026-11-01', '20:00', 130, 80),
      bp('2026-11-01', '10:00', 170, 100, { setting: 'clinic' }),
      bp('2026-11-02', '00:05', 120, 70),
    ]);
    expect(d).toEqual([
      { date: '2026-11-01', systolic: 135, diastolic: 85, count: 2 },
      { date: '2026-11-02', systolic: 120, diastolic: 70, count: 1 },
    ]);
  });
  it('seven-day trend requires enough days and never interpolates', () => {
    const daily = dailyAverages([bp('2026-11-01', '07:00', 140, 90), bp('2026-11-02', '07:00', 130, 80), bp('2026-11-05', '07:00', 120, 70)]);
    const t = sevenDayTrend(daily);
    expect(t[0]!.trendS).toBeNull();
    expect(t[2]!.trendS).toBe(130);
  });
  it('period from local time', () => {
    expect(periodForTime('11:59')).toBe('AM');
    expect(periodForTime('12:00')).toBe('PM');
  });
  it('groups multiple readings per session', () => {
    const a = bp('2026-11-01', '07:00', 140, 90, { sessionId: 's1' });
    const b = bp('2026-11-01', '07:01', 138, 88, { sessionId: 's1' });
    const c = bp('2026-11-01', '20:00', 130, 85);
    const g = groupSessions([a, b, c]);
    expect(g).toHaveLength(2);
    expect(g[1]).toHaveLength(2);
  });
});

describe('7-day home monitoring protocol', () => {
  it('complete protocol excludes day 1', () => {
    const rs = [...protocolDay(START, 180, 110), ...Array.from({ length: 6 }, (_, i) => protocolDay(addDays(START, i + 1), 136, 86)).flat()];
    const p = evaluateProtocol(rs, START, '2026-11-10');
    expect(p.status).toBe('complete');
    expect(p.formal).toEqual({ systolic: 136, diastolic: 86, count: 24, pulse: null });
    expect(p.issues).toHaveLength(0);
  });
  it('incomplete protocol has no formal average', () => {
    const rs = fullWeek().filter((r) => !(r.localDate === addDays(START, 2) && r.period === 'PM'));
    const p = evaluateProtocol(rs, START, '2026-11-10');
    expect(p.status).toBe('incomplete');
    expect(p.formal).toBeNull();
    expect(p.provisional).not.toBeNull();
    expect(p.issues).toContain('Day 3: 0 of 2 evening readings');
  });
  it('NICE minimum: 4 consecutive complete days from day 1, window finished', () => {
    const rs = Array.from({ length: 4 }, (_, i) => protocolDay(addDays(START, i), 140 + i, 90)).flat();
    const p = evaluateProtocol(rs, START, '2026-11-09');
    expect(p.status).toBe('minimum');
    // days 2-4 only: (141+142+143)/3
    expect(p.formal?.systolic).toBe(142);
    expect(p.formal?.count).toBe(12);
  });
  it('in progress while the window is open and no gaps', () => {
    const rs = Array.from({ length: 3 }, (_, i) => protocolDay(addDays(START, i), 140, 90)).flat();
    const p = evaluateProtocol(rs, START, addDays(START, 3));
    expect(p.status).toBe('in-progress');
    expect(p.formal).toBeNull();
  });
  it('a gap while open is incomplete', () => {
    const rs = [...protocolDay(START, 140, 90), ...protocolDay(addDays(START, 2), 140, 90)];
    expect(evaluateProtocol(rs, START, addDays(START, 3)).status).toBe('incomplete');
  });
  it('extra readings per session count; readings outside window ignored', () => {
    const rs = [...fullWeek(), ...protocolDay(addDays(START, 3), 160, 100, 1, 0), bp(addDays(START, 7), '07:00', 200, 120)];
    const p = evaluateProtocol(rs, START, '2026-11-12');
    expect(p.status).toBe('complete');
    expect(p.formal?.count).toBe(25);
  });
  it('uses local dates across the October DST change', () => {
    const start = '2026-10-21';
    const rs = Array.from({ length: 7 }, (_, i) => protocolDay(addDays(start, i), 130, 80)).flat();
    const p = evaluateProtocol(rs, start, '2026-10-30');
    expect(p.status).toBe('complete');
    expect(p.days.map((d) => d.date)).toContain('2026-10-25');
  });
  it('duplicate readings are averaged as recorded (not deduplicated silently)', () => {
    const r = bp(START, '07:00', 140, 90);
    expect(averageReadings([r, { ...r, id: 'dup' }])?.count).toBe(2);
  });
});

describe('NICE NG136 classification', () => {
  it('home average thresholds', () => {
    expect(classifyHomeAverage({ systolic: 134.9, diastolic: 84.9 })).toBe('below-threshold');
    expect(classifyHomeAverage({ systolic: 135, diastolic: 80 })).toBe('stage1-range');
    expect(classifyHomeAverage({ systolic: 120, diastolic: 85 })).toBe('stage1-range');
    expect(classifyHomeAverage({ systolic: 150, diastolic: 80 })).toBe('stage2-range');
    expect(classifyHomeAverage({ systolic: 130, diastolic: 95 })).toBe('stage2-range');
  });
  it('clinic thresholds', () => {
    expect(classifyClinic({ systolic: 139, diastolic: 89 })).toBe('below-threshold');
    expect(classifyClinic({ systolic: 140, diastolic: 87 })).toBe('stage1-range');
    expect(classifyClinic({ systolic: 160, diastolic: 90 })).toBe('stage2-range');
    expect(classifyClinic({ systolic: 179, diastolic: 120 })).toBe('severe-range');
  });
  it('safety messages', () => {
    expect(readingSafety({ systolic: 180, diastolic: 100 }).level).toBe('very-high');
    expect(readingSafety({ systolic: 150, diastolic: 120 }).level).toBe('very-high');
    expect(readingSafety({ systolic: 182, diastolic: 100 }).body.join(' ')).toMatch(/999/);
    expect(readingSafety({ systolic: 165, diastolic: 95 }).level).toBe('high');
    expect(readingSafety({ systolic: 85, diastolic: 55 }).level).toBe('low');
    expect(readingSafety({ systolic: 128, diastolic: 82 }).level).toBe('none');
  });
  it('plausibility warnings', () => {
    expect(readingWarnings({ systolic: 100, diastolic: 95 })).toHaveLength(1);
    expect(readingWarnings({ systolic: 130, diastolic: 80, pulse: 150 })).toHaveLength(1);
  });
});
